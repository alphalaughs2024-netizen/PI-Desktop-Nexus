import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { createServer } from "node:http";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Real permission components with controlled approval/configuration responses.
const desktop = fileURLToPath(new URL("../../apps/desktop/", import.meta.url));
const require = createRequire(join(desktop, "package.json"));
const { build } = createRequire(require.resolve("vite/package.json"))("esbuild");
const { chromium } = require("playwright-core");
const output = resolve(process.argv[2]);
await mkdir(output, { recursive: true });
const fixture = `import React,{useState} from 'react';import {createRoot} from 'react-dom/client';
import {PermissionCard} from './src/components/PermissionCard';
import {PermissionModeContents} from './src/components/PermissionModeContents';
import {FullAccessConfirmation} from './src/components/FullAccessConfirmation';
import {en} from '@pi-desktop/i18n';
window.catalog=en;window.calls=[];window.confirmations=0;window.inflight=0;window.delay=100;window.fail=false;window.saveFail=false;
window.state={sessions:[{id:'chat',projectPath:'C:/project'}],showToast:message=>window.toast=message,
 resolvePermission:async(...args)=>{window.calls.push(args);window.inflight++;try{await new Promise(r=>setTimeout(r,window.delay));if(window.fail)throw Error('Approval refused');}finally{window.inflight--;}}};
const permission={sessionId:'chat',requestId:'once',toolCallId:'patch',toolName:'apply_patch',reason:'This action needs your approval under the current permission settings.',risk:'high',receivedAt:Date.now(),allowedDecisions:['allow-once','deny'],argsPreview:{files:[{path:'src/calc.ts',operation:'update'}]}};
const App=()=>{const [modal,setModal]=useState(false);const [legacy,setLegacy]=useState(false);const [id,setId]=useState(0);const [mode,setMode]=useState('ask');
 window.reset=()=>{setId(x=>x+1);window.calls=[];};
 return <><section className='composer-shell'><div className='composer-permission-menu composer-configuration-menu fixture-menu' role='menu'>
 <div className='composer-configuration-heading composer-permission-heading'>{en.chat.permissionApprovalQuestion}</div>
 {['ask','auto','full-access'].map(value=><button key={value} role='menuitemradio' aria-checked={mode===value} data-permission-mode={value} className={'composer-plus-item composer-permission-option '+(mode===value?'active':'')} onClick={()=>{if(value==='full-access')setModal(true);else setMode(value);}}><PermissionModeContents mode={value} label={value==='ask'?en.chat.permissionAsk:value==='auto'?en.chat.permissionAuto:en.chat.permissionFullAccess}/></button>)}
 </div></section><section className='approval'><PermissionCard key={id} permission={{...permission,requestId:'once-'+id,allowedDecisions:legacy?undefined:permission.allowedDecisions}}/></section>
 <footer><button id='legacy' onClick={()=>{setLegacy(x=>!x);setId(x=>x+1);}}>Toggle legacy</button><textarea className='composer-input' aria-label='Composer'/></footer>
 {modal&&<FullAccessConfirmation onCancel={()=>setModal(false)} onConfirm={async()=>{window.confirmations++;await new Promise(r=>setTimeout(r,window.delay));if(window.saveFail)throw Error('Save refused');setMode('full-access');setModal(false);}}/>}</>;};
createRoot(document.getElementById('root')).render(<App/>);`;
const translation = `import React from 'react';const t=(key,args={})=>{let text=key.split('.').reduce((o,k)=>o?.[k],window.catalog)??key;return typeof text==='string'?text.replace(/{{(.*?)}}/g,(_,k)=>args[k.trim()]??''):key;};export const useTranslation=()=>({t});export const Trans=({values})=><>Allow {values.tool} to run?</>;`;
const bundle = await build({ stdin: { contents: fixture, resolveDir: desktop, loader: "tsx" }, bundle: true, write: false,
  format: "iife", jsx: "automatic", define: { "process.env.NODE_ENV": '"production"' },
  plugins: [{name:"approval-fixtures",setup(b){
    b.onResolve({filter:/^(react-i18next|\.\.\/stores\/app-store|\.\/Markdown|\.\.\/hooks\/use-preview-target)$/},args=>({path:args.path,namespace:'fixture'}));
    b.onLoad({filter:/.*/,namespace:'fixture'},args=>({contents:args.path==='react-i18next'?translation:args.path.includes('stores')?'export const useAppStore=select=>select(window.state);':args.path.includes('hooks')?'export const useOpenPreviewTarget=()=>()=>{};':`import React from 'react';export const HighlightedCode=({code})=><>{code}</>;export const useCopy=()=>({copied:false,run:()=>{}});`,loader:'jsx',resolveDir:desktop}));
    b.onResolve({filter:/^@pi-desktop\/(shared|i18n)$/},args=>({path:fileURLToPath(new URL('../../packages/'+args.path.split('/')[1]+'/src/index.ts',import.meta.url))}));
  }}] });
const assets = join(desktop,"out/renderer/assets");
const css = await readFile(join(assets,(await readdir(assets)).find(name=>/^index-.*\.css$/.test(name))),'utf8');
const server=createServer((request,response)=>{
  if(request.url==='/app.js'){response.setHeader('Content-Type','text/javascript');response.end(bundle.outputFiles[0].text);return;}
  if(request.url==='/app.css'){response.setHeader('Content-Type','text/css');response.end(css);return;}
  response.setHeader('Content-Type','text/html');response.end(`<!doctype html><html data-theme="dark"><head><link rel="stylesheet" href="/app.css"><style>
  body{margin:0;background:var(--ds-bg-primary);color:var(--ds-text-primary)}#root{padding:16px;display:grid;grid-template-columns:350px minmax(0,1fr);gap:20px;min-height:100vh}.composer-shell{container-type:inline-size;align-self:start}.fixture-menu{position:relative;bottom:auto;max-height:none}.approval{min-width:0}footer{grid-column:1/-1;align-self:end}.composer-input{display:block;width:100%;height:50px;border:1px solid var(--ds-border-default)}@media(max-width:600px){#root{grid-template-columns:minmax(0,1fr);gap:16px}}
  </style></head><body><div id="root"></div><script src="/app.js"></script></body></html>`);
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
let browser;const errors=[];const observations=[];
try {
  browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
  const page=await browser.newPage({viewport:{width:1120,height:800}});
  page.setDefaultTimeout(10_000);page.on('pageerror',error=>errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.getByRole('button',{name:'Allow once',exact:true}).waitFor();
  assert.equal(await page.getByRole('button',{name:'Allow for this chat',exact:true}).count(),0);
  assert.match(await page.locator('.permission-card-args').innerText(),/src\/calc.ts/);
  const contrast=async selector=>page.locator(selector).evaluate(element=>{
    const style=getComputedStyle(element);const canvas=document.createElement('canvas');canvas.width=canvas.height=1;
    const ctx=canvas.getContext('2d');const rgb=value=>{ctx.clearRect(0,0,1,1);ctx.fillStyle=value;ctx.fillRect(0,0,1,1);return Array.from(ctx.getImageData(0,0,1,1).data).slice(0,3).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;});};
    const luminance=values=>values[0]*.2126+values[1]*.7152+values[2]*.0722;const a=luminance(rgb(style.color)),b=luminance(rgb(style.backgroundColor));return(Math.max(a,b)+.05)/(Math.min(a,b)+.05);
  });
  for(const width of [1120,375])for(const theme of ['dark','light','twilight-mountains','obsidian-horizon','emerald-afterglow','alpine-light']){
    await page.setViewportSize({width,height:800});
    await page.evaluate(theme=>{document.documentElement.dataset.theme=theme==='light'||theme==='alpine-light'?'light':'dark';document.documentElement.dataset.scenicTheme=['dark','light'].includes(theme)?'':theme;},theme);
    await page.waitForTimeout(180);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`${theme}/${width} overflow`);
    const ratio=await contrast('.permission-card-actions .btn-primary');assert(ratio>=4.5,`${theme} primary contrast ${ratio}`);
    await page.getByRole('menuitemradio',{name:/^Full access/}).click();
    await page.getByRole('dialog').waitFor();
    const modalRatio=await contrast('.composer-full-access-actions .danger');assert(modalRatio>=4.5,`${theme} danger contrast ${modalRatio}`);
    await page.keyboard.press('Escape');await page.getByRole('dialog').waitFor({state:'hidden'});
    await page.screenshot({path:join(output,`${theme}-${width}.png`)});
    observations.push({theme,width,ratio,modalRatio});
  }
  await page.getByRole('menuitemradio',{name:/^Full access/}).click();
  assert.equal(await page.evaluate(()=>document.activeElement.textContent),'Cancel');
  await page.keyboard.press('Shift+Tab');assert.equal(await page.evaluate(()=>document.activeElement.textContent),'Enable Full access');
  await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>document.activeElement.textContent),'Cancel');
  await page.keyboard.press('Escape');assert.equal(await page.evaluate(()=>document.activeElement.getAttribute('data-permission-mode')),'full-access');
  await page.evaluate(()=>{window.delay=500;window.saveFail=true;});
  await page.getByRole('menuitemradio',{name:/^Full access/}).click();
  await page.getByRole('button',{name:'Enable Full access',exact:true}).evaluate(button=>{button.click();button.click();});
  assert.equal(await page.getByRole('dialog').getAttribute('aria-busy'),'true');
  await page.getByRole('alert').getByText('Save refused').waitFor();assert.equal(await page.evaluate(()=>window.confirmations),1);
  await page.evaluate(()=>window.saveFail=false);await page.getByRole('button',{name:'Enable Full access',exact:true}).click();
  await page.getByRole('dialog').waitFor({state:'hidden'});assert.equal(await page.evaluate(()=>window.confirmations),2);
  await page.getByRole('button',{name:'Allow once',exact:true}).evaluate(button=>{button.click();button.click();});
  assert.equal(await page.evaluate(()=>window.calls.length),1);assert.deepEqual(await page.evaluate(()=>window.calls[0]),['chat','once-0','allow-once']);
  await page.waitForFunction(()=>window.inflight===0);
  await page.evaluate(()=>window.reset());await page.getByRole('button',{name:'Deny',exact:true}).click();
  assert.equal(await page.evaluate(()=>window.calls[0][2]),'deny');
  await page.waitForFunction(()=>window.inflight===0);
  await page.evaluate(()=>{window.fail=true;window.reset();});await page.getByRole('button',{name:'Allow once',exact:true}).click();
  await page.waitForFunction(()=>window.toast==='Approval refused'&&!document.querySelector('.permission-card-actions .btn-primary').disabled);
  await page.evaluate(()=>window.fail=false);await page.getByRole('button',{name:'Allow once',exact:true}).click();assert.equal(await page.evaluate(()=>window.calls.length),2);
  await page.getByRole('button',{name:'Toggle legacy'}).click();await page.getByRole('button',{name:'Allow for this chat',exact:true}).waitFor();
  assert.deepEqual(errors,[]);
  await writeFile(join(output,'report.json'),JSON.stringify({passed:true,scope:'Real permission/card/tool-detail/menu-content/modal components; controlled store, translation, copy/preview actions; six themes, narrow/desktop, contrast, native/legacy actions, keyboard, retries and single dispatch.',observations},null,2));
  console.log(JSON.stringify({passed:true,output,minimumContrast:Math.min(...observations.flatMap(row=>[row.ratio,row.modalRatio]))}));
}finally{await browser?.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
