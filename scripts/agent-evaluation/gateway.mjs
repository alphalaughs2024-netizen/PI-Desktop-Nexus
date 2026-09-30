import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { createHash, createDecipheriv } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { join } from 'node:path';
import { homedir } from 'node:os';

export { TEST_IMAGE } from './test-image.mjs';
export async function xkiroCredential(dataRoot = join(homedir(), '.pi-desktop-nexus')) {
  const db = new DatabaseSync(join(dataRoot, 'pi.sqlite'), { readOnly: true });
  let provider; try { provider = db.prepare('SELECT id, base_url, secret_ref FROM providers WHERE lower(name)=? AND enabled=1').get('xkiro'); } finally { db.close(); }
  if (!provider || new URL(provider.base_url).origin !== 'https://api.xkiro.com') throw new Error('XKIRO_PROVIDER_NOT_CONFIGURED');
  const secretRef = provider.secret_ref || `secret:provider:${provider.id}:api_key`;
  const key = await readFile(join(dataRoot, 'secrets/.machine-key'));
  const hash = createHash('sha256').update(secretRef).digest('hex');
  const encrypted = Buffer.from((await readFile(join(dataRoot, 'secrets', hash + '.bin'), 'utf8')).trim(), 'base64');
  try {
    const cipher = createDecipheriv('aes-256-gcm', key, encrypted.subarray(0,12));
    cipher.setAuthTag(encrypted.subarray(-16));
    return Buffer.concat([cipher.update(encrypted.subarray(12,-16)), cipher.final()]);
  } finally { key.fill(0); encrypted.fill(0); }
}
export function freeModel(catalog, id) {
  const model = catalog.data?.find(item => item.id === id);
  if (!model || model.access_tier !== 'free' || model.pricing?.input !== 0 || model.pricing?.output !== 0 || !model.capabilities?.tools) throw new Error('MODEL_NOT_VERIFIED_FREE_WITH_TOOLS');
  return model;
}
function countImages(value) {
  if (!value || typeof value !== 'object') return 0;
  if (value.type === 'input_image' || value.type === 'image_url') return 1;
  return Object.values(value).reduce((sum, child) => sum + (Array.isArray(child) ? child.reduce((n,v)=>n+countImages(v),0) : countImages(child)), 0);
}
export async function modelGateway({ mode = 'fixture', model = 'nexus-fixture', delayMs = 250, maxRequests = 8, credential } = {}) {
  const records = []; let secret; let stopped = false;
  if (mode === 'xkiro') {
    const catalog = await (await fetch('https://api.xkiro.com/v1/models', { signal: AbortSignal.timeout(15000) })).json();
    freeModel(catalog, model); secret = credential ? Buffer.from(credential) : await xkiroCredential();
  }
  const server = createServer(async (request, response) => {
    try {
      const pathname = new URL(request.url, 'http://localhost').pathname;
      if (request.method === 'GET' && pathname.endsWith('/models')) {
        response.setHeader('Content-Type','application/json'); response.end(JSON.stringify({object:'list',data:[{id:model,object:'model',created:0,owned_by:'evaluation'}]})); return;
      }
      if (request.method !== 'POST' || !['/v1/chat/completions','/v1/responses'].includes(pathname)) { response.writeHead(404).end(); return; }
      let raw = ''; for await (const chunk of request) { raw += chunk; if (raw.length > 4*1024*1024) throw new Error('REQUEST_TOO_LARGE'); }
      const body = JSON.parse(raw);
      if (body.model !== model || records.length >= maxRequests || stopped) { response.writeHead(429).end(JSON.stringify({error:{message:'Evaluation request limit or model mismatch'}})); return; }
      const record = { sequence: records.length+1, api: pathname, startedAt: Date.now(), imageCount: countImages(body), toolCount: body.tools?.length ?? 0 };
      records.push(record);
      if (mode === 'xkiro') {
        // This relay forwards only to the user-selected provider. It performs no API translation.
        body.max_tokens = Math.min(body.max_tokens ?? 1024, 2048);
        if (pathname.endsWith('/responses')) { delete body.max_tokens; body.max_output_tokens = Math.min(body.max_output_tokens ?? 1024, 2048); }
        const controller = new AbortController();
        response.on('close', () => controller.abort());
        const upstream = await fetch('https://api.xkiro.com' + pathname, { method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+secret.toString('utf8')},body:JSON.stringify(body),signal:AbortSignal.any([controller.signal,AbortSignal.timeout(120000)]) });
        record.httpStatus = upstream.status; record.headersAt = Date.now();
        response.writeHead(upstream.status, {'Content-Type':upstream.headers.get('content-type') || 'application/json'});
        for await (const chunk of upstream.body) { if (!record.firstByteAt) record.firstByteAt=Date.now(); if (!response.destroyed) response.write(chunk); }
        record.endedAt=Date.now(); response.end(); return;
      }
      await new Promise(resolveDelay => setTimeout(resolveDelay, delayMs));
      record.httpStatus=200; record.headersAt=Date.now(); record.firstByteAt=Date.now();
      response.writeHead(200, {'Content-Type':'text/event-stream'});
      if (pathname.endsWith('/chat/completions')) {
        const delta = {role:'assistant',content:'Fixture response. This proves transport, not model quality.'};
        response.write('data: '+JSON.stringify({id:'fixture',object:'chat.completion.chunk',created:0,model,choices:[{index:0,delta,finish_reason:null}]})+'\n\n');
        response.write('data: '+JSON.stringify({id:'fixture',object:'chat.completion.chunk',created:0,model,choices:[{index:0,delta:{},finish_reason:'stop'}],usage:{prompt_tokens:1,completion_tokens:1,total_tokens:2}})+'\n\n'); response.write('data: [DONE]\n\n');
      } else {
        const item={id:'message-fixture',type:'message',status:'completed',role:'assistant',content:[{type:'output_text',text:'Fixture response. This proves transport, not model quality.',annotations:[]}]};
        const send=(type,payload)=>response.write('event: '+type+'\ndata: '+JSON.stringify({type,...payload})+'\n\n');
        send('response.created',{response:{id:'fixture',object:'response',status:'in_progress',output:[]}});
        send('response.output_item.added',{output_index:0,item:{...item,status:'in_progress',content:[]}});
        send('response.content_part.added',{item_id:item.id,output_index:0,content_index:0,part:{type:'output_text',text:'',annotations:[]}});
        send('response.output_text.delta',{item_id:item.id,output_index:0,content_index:0,delta:item.content[0].text});
        send('response.output_text.done',{item_id:item.id,output_index:0,content_index:0,text:item.content[0].text});
        send('response.output_item.done',{output_index:0,item});
        send('response.completed',{response:{id:'fixture',object:'response',status:'completed',output:[item],usage:{input_tokens:1,output_tokens:1,total_tokens:2}}});
      }
      record.endedAt=Date.now(); response.end();
    } catch { if (!response.headersSent) response.writeHead(502); if (!response.destroyed) response.end(JSON.stringify({error:{message:'Evaluation upstream failed; inspect metadata report'}})); }
  });
  await new Promise(resolveListen => server.listen(0,'127.0.0.1',resolveListen));
  return { baseUrl:'http://127.0.0.1:'+server.address().port+'/v1', model, mode, records,
    async close() { stopped=true; server.closeAllConnections(); await new Promise(resolveClose=>server.close(resolveClose)); secret?.fill(0); } };
}


