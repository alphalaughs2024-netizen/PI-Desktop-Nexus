import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { evaluate, doctor } from './evaluate.mjs';

export async function serve({allowCloud=false,credential,port=0}={}) {
  const nonce=randomBytes(24).toString('hex');let snapshot={turn:null,items:[]};let busy=false;let reportPath=null;
  const server=createServer(async(req,res)=>{
    const url=new URL(req.url,'http://localhost');
    res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
    if(req.headers.host!==`127.0.0.1:${server.address().port}`){res.writeHead(403).end();return;}
    if(req.method==='GET'&&url.pathname==='/'){res.setHeader('Content-Type','text/html');res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'");res.end(await readFile(new URL('./prototype.html',import.meta.url)));return;}
    if(req.method==='GET'&&['/prototype.js','/prototype.css'].includes(url.pathname)){res.setHeader('Content-Type',url.pathname.endsWith('.js')?'text/javascript':'text/css');res.end(await readFile(new URL('.'+url.pathname,import.meta.url)));return;}
    const origin=req.headers.origin;if(origin && origin!==`http://127.0.0.1:${server.address().port}`){res.writeHead(403).end();return;}
    if(url.searchParams.get('token')!==nonce){res.writeHead(403).end();return;}
    res.setHeader('Content-Type','application/json');
    if(req.method==='GET'&&url.pathname==='/state'){res.end(JSON.stringify({snapshot,busy,reportPath,allowCloud,doctor:await doctor()}));return;}
    if(req.method==='POST'&&url.pathname==='/run'){
      if(busy){res.writeHead(409).end();return;}
      let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>65536){res.writeHead(413).end();return;}}
      let args;try{args=JSON.parse(raw);}catch{res.writeHead(400).end();return;}
      if(!['codex','opencode','pi'].includes(args.engine)||!['fixture','xkiro'].includes(args.mode)||args.mode==='xkiro'&&!allowCloud){res.writeHead(403).end();return;}
      busy=true;reportPath=null;res.writeHead(202).end('{}');
      void evaluate({engine:args.engine,mode:args.mode,model:args.mode==='fixture'?'nexus-fixture':args.model,
        prompt:String(args.prompt??'Reply with exactly: Nexus evaluation ready.').slice(0,8192),image:!!args.image,
        cancelAfterMs:args.cancel?750:undefined,credential,onUpdate:value=>{snapshot=value;}}).then(result=>{reportPath=result.reportPath;snapshot=result.snapshot;}).catch(()=>{snapshot={turn:{outcome:'failed'},items:[]};}).finally(()=>{busy=false;});return;
    }
    res.writeHead(404).end();
  });
  await new Promise(r=>server.listen(port,'127.0.0.1',r));
  const address=`http://127.0.0.1:${server.address().port}/#${nonce}`;
  return {address,async close(){server.closeAllConnections();await new Promise(r=>server.close(r));}};
}
