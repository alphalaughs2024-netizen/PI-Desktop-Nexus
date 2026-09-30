import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Timeline, StreamBatcher } from './timeline.mjs';
import { engineAdapter } from './adapters.mjs';
import { modelGateway } from './gateway.mjs';
import { PINS, defaultProfileRoot, launcher } from './process.mjs';

export const TRIALS = ['quiet-start','multi-step','vision','safe-edit','managed-process','browser-viewports','cancellation','reload-recovery'];
export async function doctor() {
  const engines={};for(const name of Object.keys(PINS)){try{const installed=await launcher(name);engines[name]={installed:installed.version,pinned:PINS[name],matches:installed.version===PINS[name]};}catch{engines[name]={installed:null,pinned:PINS[name],matches:false};}}
  return {engines,productionEngineChanged:false,defaultModelRequests:false,profileRoot:defaultProfileRoot()};
}
export async function evaluate({engine,mode='fixture',model='nexus-fixture',root=defaultProfileRoot(),prompt='Reply with exactly: Nexus evaluation ready.',image=false,cancelAfterMs,credential,onUpdate=()=>{},timeoutMs=150000}={}) {
  if(!Object.keys(PINS).includes(engine))throw new Error('UNKNOWN_ENGINE');
  const runRoot=join(root,new Date().toISOString().replaceAll(':','-')+'-'+randomUUID().slice(0,8));await mkdir(runRoot,{recursive:true});
  const timeline=new Timeline();timeline.begin(engine,mode);timeline.on('update',onUpdate);onUpdate(timeline.snapshot());const token=timeline.token();
  const rawEvents={};const diagnostics=[];const batcher=new StreamBatcher(event=>timeline.accept(event,token));
  let adapter;let gateway;let failure=null;let cancelTimer;
  const completed=new Promise(resolveDone=>timeline.on('update',snapshot=>{if(snapshot.turn.endedAt!==null)resolveDone();}));
  try {
    const installed=await launcher(engine);if(installed.version!==PINS[engine])throw new Error('ENGINE_VERSION_MISMATCH');
    gateway=await modelGateway({mode,model,credential});
    adapter=await engineAdapter(engine,{root:runRoot,gateway,onEvent:event=>batcher.push(event),onRaw:(type,error)=>{rawEvents[type]=(rawEvents[type]??0)+1;if(error)diagnostics.push(JSON.stringify(error).slice(0,600));}});
    if(cancelAfterMs)cancelTimer=setTimeout(()=>void adapter.interrupt().catch(()=>{batcher.push({kind:'terminal',outcome:'failed'});}),cancelAfterMs);
    let timeout;
    try { await Promise.race([(async()=>{await adapter.run(prompt,{image});await completed;})(),new Promise((_,reject)=>{timeout=setTimeout(()=>reject(new Error('EVALUATION_TIMEOUT')),timeoutMs);})]); }
    finally{clearTimeout(timeout);}
  } catch(error){failure=String(error.message).slice(0,400);batcher.push({kind:'terminal',outcome:'failed'});}
  finally{clearTimeout(cancelTimer);batcher.flush();await adapter?.close();await gateway?.close();}
  const report={schemaVersion:1,engine,pinnedVersion:PINS[engine],mode,model,runRoot,failure,
    timeline:timeline.evidence(),requests:gateway?.records??[],rawEvents,diagnostics,
    trials:Object.fromEntries(TRIALS.map(trial=>[trial,{status:'not-tested',reason:'Requires its dedicated trial; a successful transport turn is insufficient.'}])),
    selection:{eligible:false,reason:'No engine selection until all required trials and deliverable quality have evidence.'}};
  report.trials['quiet-start']={status:report.timeline.turn.outcome==='completed'?'transport-verified':'failed',scope:mode==='fixture'?'real engine + scripted model, not inference quality':'real engine + xkiro free model'};
  if(image)report.trials.vision={status:report.requests.some(r=>r.imageCount>0)?'payload-verified':'failed',reason:'Image presence at gateway is verified separately from image interpretation.'};
  if(cancelAfterMs)report.trials.cancellation={status:report.timeline.turn.outcome==='interrupted'?'interruption-verified':'failed',reason:'This trial does not prove child-process cleanup.'};
  const reportPath=join(runRoot,'evidence.json');await writeFile(reportPath,JSON.stringify(report,null,2));
  return {report,reportPath,snapshot:timeline.snapshot()};
}

