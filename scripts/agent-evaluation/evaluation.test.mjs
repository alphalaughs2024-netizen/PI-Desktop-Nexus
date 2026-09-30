import test from 'node:test';
import assert from 'node:assert/strict';
import { Timeline, StreamBatcher } from './timeline.mjs';
import { codexEvent, openCodeEvent } from './adapters.mjs';
import { freeModel, modelGateway, TEST_IMAGE } from './gateway.mjs';
import { launcher, PINS } from './process.mjs';

test('whole user turn survives tool cycles, approvals, and exactly one terminal event',()=>{
  let clock=100;const timeline=new Timeline({now:()=>clock});const token=timeline.begin('pi','fixture');
  clock=200;timeline.accept({kind:'phase',phase:'waiting-model'},token);
  clock=500;timeline.accept({kind:'phase',phase:'tool'},token);
  clock=700;timeline.accept({kind:'phase',phase:'approval'},token);
  clock=1700;timeline.accept({kind:'phase',phase:'waiting-model'},token);
  clock=2000;timeline.accept({kind:'terminal',outcome:'completed'},token);
  assert.equal(timeline.accept({kind:'terminal',outcome:'completed'},token),false);
  const s=timeline.snapshot();assert.equal(s.turn.elapsedMs,1900);assert.equal(s.turn.terminalEvents,1);
  assert.equal(Object.values(s.turn.phaseMs).reduce((a,b)=>a+b),1900);
});
test('new generations reject late deltas and terminal events from the preceding request',()=>{
  const t=new Timeline();const old=t.begin('codex','fixture');t.accept({kind:'terminal',outcome:'interrupted'},old);
  const current=t.begin('codex','fixture');assert.equal(t.accept({kind:'item',id:'old',delta:'stale'},old),false);
  t.accept({kind:'item',id:'new',type:'assistant',delta:'current'},current);assert.deepEqual(t.snapshot().items.map(i=>i.text),['current']);
});
test('duplicate transport notifications do not duplicate response text',()=>{
  const t=new Timeline();t.begin('codex','fixture');const event={kind:'item',id:'m',type:'assistant',delta:'hello',eventId:'same'};
  t.accept(event);t.accept(event);assert.equal(t.snapshot().items[0].text,'hello');
});
test('first token is immediate and buffered deltas are delivered before terminal state',()=>{
  const delivered=[];let callback;const b=new StreamBatcher(e=>delivered.push(e),{schedule:f=>{callback=f;return 1;},cancel:()=>{}});
  b.push({kind:'item',id:'a',delta:'one'});assert.equal(delivered.length,1);
  b.push({kind:'item',id:'a',delta:'two'});b.push({kind:'item',id:'a',delta:'three'});assert.equal(delivered.length,1);
  b.push({kind:'terminal',outcome:'completed'});assert.equal(delivered[1].delta,'twothree');assert.equal(delivered[2].kind,'terminal');
});
test('evidence export excludes visible text and tool argument content',()=>{
  const t=new Timeline();t.begin('pi','fixture');t.accept({kind:'item',id:'a',type:'assistant',text:'private-content',args:{key:'sensitive'}});
  const exportText=JSON.stringify(t.evidence());assert(!exportText.includes('private-content'));assert(!exportText.includes('sensitive'));
});
test('Codex interruption is not completed; OpenCode events cannot cross session boundaries',()=>{
  assert.equal(codexEvent({method:'turn/completed',params:{turn:{status:'interrupted'}}}).outcome,'interrupted');
  assert.equal(openCodeEvent({type:'session.error',properties:{sessionID:'other'}},'current'),null);
});
test('paid, unknown, and non-tool models cannot enter a cloud trial',()=>{
  const catalog={data:[{id:'ok',access_tier:'free',pricing:{input:0,output:0},capabilities:{tools:true}},{id:'paid',access_tier:'free',pricing:{input:1,output:0},capabilities:{tools:true}}]};
  assert.equal(freeModel(catalog,'ok').id,'ok');assert.throws(()=>freeModel(catalog,'paid'));assert.throws(()=>freeModel(catalog,'unknown'));
});
test('loopback fixture counts image payloads and caps requests without inference',async()=>{
  const gateway=await modelGateway({maxRequests:1,delayMs:0});
  try{const body={model:gateway.model,messages:[{role:'user',content:[{type:'image_url',image_url:{url:'data:image/png;base64,'+TEST_IMAGE}}]}]};
    const first=await fetch(gateway.baseUrl+'/chat/completions',{method:'POST',body:JSON.stringify(body)});assert.equal(first.status,200);await first.text();
    assert.equal(gateway.records[0].imageCount,1);const second=await fetch(gateway.baseUrl+'/chat/completions',{method:'POST',body:JSON.stringify(body)});assert.equal(second.status,429);
  }finally{await gateway.close();}
});
