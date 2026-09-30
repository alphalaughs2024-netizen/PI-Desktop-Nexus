import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { launcher, JsonRpcProcess, profile, stopProcess, piModules } from './process.mjs';
import { TEST_IMAGE } from './gateway.mjs';

function itemType(type='') {
  if (/reason/i.test(type)) return 'reasoning';
  if (/command|tool|fileChange|mcp/i.test(type)) return 'tool';
  return 'assistant';
}
export function codexEvent(event) {
  const p = event.params ?? {};
  if (event.method === 'turn/started') return { kind:'phase', phase:'waiting-model' };
  if (event.method === 'turn/completed') return { kind:'terminal',outcome:p.turn?.status === 'completed' ? 'completed' : p.turn?.status === 'interrupted' ? 'interrupted' : 'failed' };
  if (event.method === 'item/started' || event.method === 'item/completed') {
    return { kind:'item',id:p.item.id,type:itemType(p.item.type),status:event.method === 'item/completed' ? 'completed':'running',text:p.item.text };
  }
  if (event.method === 'item/agentMessage/delta' || /reasoning\/.*Delta$/.test(event.method))
    return {kind:'item',id:p.itemId,type:/reasoning/.test(event.method)?'reasoning':'assistant',delta:p.delta ?? '',status:'running'};
  if (event.method === 'item/commandExecution/outputDelta') return {kind:'item',id:p.itemId,type:'tool',delta:p.delta??'',status:'running'};
  if (event.method === 'error' && !p.willRetry) return {kind:'terminal',outcome:'failed'};
  return null;
}
export function openCodeEvent(event, sessionId) {
  const payload=event.payload ?? event; const p=payload.properties??{};
  if (p.sessionID && p.sessionID !== sessionId) return null;
  if (payload.type === 'session.status') return {kind:'phase',phase:p.status?.type === 'retry' ? 'retrying' : p.status?.type === 'idle' ? 'idle' : 'waiting-model'};
  if (payload.type === 'session.error') return {kind:'terminal',outcome:'failed'};
  if (payload.type === 'message.part.updated') {
    const part=p.part; if (!part || part.sessionID !== sessionId) return null;
    if (!['text','reasoning','tool'].includes(part.type)) return null;
    return {kind:'item',id:part.id,type:part.type==='text'?'assistant':part.type,status:part.state?.status??(part.time?.end?'completed':'running'),text:part.text};
  }
  if (payload.type === 'message.part.delta') return {kind:'item',id:p.partID,type:p.field==='reasoning'?'reasoning':'assistant',delta:p.delta??'',status:'running'};
  return null;
}
async function waitUntil(check, timeoutMs=20000) {
  const until=Date.now()+timeoutMs;
  while (Date.now()<until) { if (await check()) return; await new Promise(r=>setTimeout(r,100)); }
  throw new Error('ENGINE_READINESS_TIMEOUT');
}
async function unusedPort() {
  const socket=createServer(); await new Promise(r=>socket.listen(0,'127.0.0.1',r));
  const port=socket.address().port; await new Promise(r=>socket.close(r)); return port;
}
export async function engineAdapter(engine, { root, gateway, onEvent, onRaw = ()=>{} }) {
  const launch=await launcher(engine);
  const p=await profile(root,engine);
  await writeFile(join(p.workspace,'evaluation-note.txt'),'Nexus evaluation fixture: violet lantern, number 47.\n');
  if (engine === 'pi') {
    const {core,api}=await piModules();
    const model={id:gateway.model,name:gateway.model,api:'openai-completions',provider:'evaluation',baseUrl:gateway.baseUrl,reasoning:false,input:['text','image'],
      contextWindow:32768,maxTokens:2048,cost:{input:0,output:0,cacheRead:0,cacheWrite:0},compat:{supportsStore:false,supportsDeveloperRole:false,supportsReasoningEffort:false}};
    const {readFile}=await import('node:fs/promises');
    const agent=new core.Agent({initialState:{model,systemPrompt:'You are testing an agent harness. Use evaluation_read if asked to read the fixture. Return concise factual results. Never run unrelated work.',tools:[{
      name:'evaluation_read',label:'Read fixture',description:'Read the evaluation note. Takes no parameters. This is a harness-owned tool, not a native pi file tool.',
      parameters:{type:'object',properties:{},additionalProperties:false},execute:async()=>({content:[{type:'text',text:await readFile(join(p.workspace,'evaluation-note.txt'),'utf8')}],details:{fixture:true}})
    }]},streamFn:(m,c,o)=>api.streamSimple(m,c,{...o,apiKey:'evaluation-relay',maxTokens:1024})});
    agent.subscribe(event=>{
      onRaw(event.type);
      if(event.type==='agent_start') onEvent({kind:'phase',phase:'waiting-model'});
      if(event.type==='message_update') {const e=event.assistantMessageEvent; if(e.type==='text_delta'||e.type==='thinking_delta') onEvent({kind:'item',id:e.type==='thinking_delta'?'pi-reasoning':'pi-answer',type:e.type==='thinking_delta'?'reasoning':'assistant',delta:e.delta,status:'running'});}
      if(event.type==='tool_execution_start') {onEvent({kind:'phase',phase:'tool'});onEvent({kind:'item',id:event.toolCallId,type:'tool',status:'running'});}
      if(event.type==='tool_execution_end') {onEvent({kind:'item',id:event.toolCallId,type:'tool',status:event.isError?'failed':'completed'});onEvent({kind:'phase',phase:'waiting-model'});}
      if(event.type==='message_end'&&event.message.role==='assistant'&&['error','aborted'].includes(event.message.stopReason)) onEvent({kind:'terminal',outcome:event.message.stopReason==='aborted'?'interrupted':'failed'});
      if(event.type==='agent_end') onEvent({kind:'terminal',outcome:'completed'});
    });
    return {version:launch.version,workspace:p.workspace,async run(text,{image=false}={}) {await agent.prompt(text,image?[{type:'image',data:TEST_IMAGE,mimeType:'image/png'}]:undefined);},async interrupt(){agent.abort();},async close(){agent.abort();}};
  }
  if(engine==='codex') {
    const args=[...launch.prefix,'app-server','-c','model_provider="evaluation"','-c',`model="${gateway.model}"`,'-c','model_context_window=32768','-c','model_max_output_tokens=2048',
      '-c','features.enable_request_compression=false','-c','features.unified_exec=false','-c','model_providers.evaluation.name="Nexus evaluation"',
      '-c',`model_providers.evaluation.base_url="${gateway.baseUrl}"`,'-c','model_providers.evaluation.wire_api="responses"','-c','model_providers.evaluation.requires_openai_auth=false'];
    let nativeThread; let nativeTurn;
    const rpc=new JsonRpcProcess(launch.executable,args,{env:p.env,cwd:p.workspace},event=>{
      onRaw(event.method); if(event.method==='turn/started') nativeTurn=event.params.turn.id;
      if(event.params?.threadId && nativeThread && event.params.threadId!==nativeThread) return;
      const normalized=codexEvent(event); if(normalized) onEvent(normalized);
    });
    try { await rpc.request('initialize',{clientInfo:{name:'nexus-evaluation',version:'1.0.0'},capabilities:{experimentalApi:false}}); rpc.send({method:'initialized'});
      const result=await rpc.request('thread/start',{cwd:p.workspace,model:gateway.model,modelProvider:'evaluation',approvalPolicy:'never',sandbox:'read-only',ephemeral:true}); nativeThread=result.thread.id;
    } catch(error) {await rpc.close(); throw error;}
    return {version:launch.version,workspace:p.workspace,nativeHandle:nativeThread,
      async run(text,{image=false}={}) {const input=[{type:'text',text}];if(image)input.push({type:'image',url:'data:image/png;base64,'+TEST_IMAGE});await rpc.request('turn/start',{threadId:nativeThread,input});},
      async interrupt(){if(nativeTurn)await rpc.request('turn/interrupt',{threadId:nativeThread,turnId:nativeTurn});},async close(){await rpc.close();}};
  }
  if(engine==='opencode') {
    const port=await unusedPort();const base='http://127.0.0.1:'+port;
    const config={model:'evaluation/'+gateway.model,small_model:'evaluation/'+gateway.model,enabled_providers:['evaluation'],provider:{evaluation:{npm:'@ai-sdk/openai-compatible',name:'Nexus evaluation',options:{baseURL:gateway.baseUrl,apiKey:'evaluation-relay'},models:{[gateway.model]:{name:gateway.model,attachment:true,tool_call:true,modalities:{input:['text','image'],output:['text']},limit:{context:32768,output:2048}}}}},permission:{'*':'deny',read:'allow',glob:'allow',grep:'allow'}};
    const env={...p.env,OPENCODE_CONFIG_CONTENT:JSON.stringify(config),OPENCODE_CONFIG_DIR:join(p.directory,'config/opencode'),OPENCODE_DISABLE_MODELS_FETCH:'true',OPENCODE_DISABLE_AUTOUPDATE:'true'};
    const child=spawn(launch.executable,[...launch.prefix,'serve','--pure','--hostname','127.0.0.1','--port',String(port)],{env,cwd:p.workspace,windowsHide:true,stdio:['ignore','pipe','pipe']});
    child.on('error',()=>{});child.stdout.resume();child.stderr.resume();
    const streamAbort=new AbortController();let active=false;let busy=false;let sessionId;let readerTask;
    const call=async(path,body)=>{const r=await fetch(base+path,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json','x-opencode-directory':p.workspace},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(20000)});if(!r.ok)throw new Error('OPENCODE_HTTP_'+r.status);return r.status===204?null:r.json();};
    try {
      await waitUntil(async()=>{if(child.exitCode!==null)throw new Error('OPENCODE_PROCESS_EXITED');try{return(await fetch(base+'/global/health',{signal:AbortSignal.timeout(500)})).ok;}catch{return false;}});
      sessionId=(await call('/session',{})).id;
      const stream=await fetch(base+'/event',{headers:{'x-opencode-directory':p.workspace},signal:streamAbort.signal});
      if(!stream.ok)throw new Error('OPENCODE_EVENT_STREAM_FAILED');
      readerTask=(async()=>{let buffer='';for await(const bytes of stream.body){buffer+=Buffer.from(bytes).toString('utf8');let boundary;while((boundary=buffer.indexOf('\n\n'))>=0){const frame=buffer.slice(0,boundary);buffer=buffer.slice(boundary+2);const raw=frame.split('\n').filter(l=>l.startsWith('data:')).map(l=>l.slice(5).trim()).join('\n');if(!raw)continue;let event;try{event=JSON.parse(raw);}catch{continue;}onRaw((event.payload??event).type, (event.payload??event).type==='session.error' ? (event.payload??event).properties?.error : undefined);if(!active)continue;const normalized=openCodeEvent(event,sessionId);if(!normalized)continue;if(normalized.kind==='phase'&&normalized.phase==='idle'){if(busy){active=false;onEvent({kind:'terminal',outcome:'completed'});}continue;}if(normalized.kind==='phase')busy=true;onEvent(normalized);}}})().catch(()=>{if(active)onEvent({kind:'terminal',outcome:'failed'});});
    } catch(error) {streamAbort.abort();await stopProcess(child);throw error;}
    return {version:launch.version,workspace:p.workspace,nativeHandle:sessionId,
      async run(text,{image=false}={}){active=true;busy=false;const parts=[{type:'text',text}];if(image)parts.push({type:'file',mime:'image/png',url:'data:image/png;base64,'+TEST_IMAGE,filename:'fixture.png'});onEvent({kind:'phase',phase:'waiting-model'});await call('/session/'+sessionId+'/prompt_async',{parts,model:{providerID:'evaluation',modelID:gateway.model}});},
      async interrupt(){active=false;await call('/session/'+sessionId+'/abort',{});onEvent({kind:'terminal',outcome:'interrupted'});},async close(){active=false;streamAbort.abort();await stopProcess(child);await readerTask;}};
  }
  throw new Error('UNKNOWN_ENGINE');
}


