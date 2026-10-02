import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { createServer } from "node:http";
import { readFile, readdir, mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join, resolve } from "node:path";

// Focused inspection of real panel components with controlled IPC responses.
const desktop = fileURLToPath(new URL("../../apps/desktop/", import.meta.url));
const require = createRequire(join(desktop, "package.json"));
const { build } = createRequire(require.resolve("vite/package.json"))("esbuild");
const { chromium } = require("playwright-core");
const output = resolve(process.argv[2]);
await mkdir(output, { recursive: true });
const fixture = `import React from 'react';
import {createRoot} from 'react-dom/client';
import {ProcessesTab} from './src/components/workpanel/ProcessesTab';
import {ReviewTab} from './src/components/workpanel/ReviewTab';
window.calls=[]; window.failStop=false; window.delayRead=0; window.opened=[];
const record=(id,sessionId,status='running')=>({id,sessionId,status,command:id==='web'?'node server.mjs':'node --test calc.test.mjs',cwd:'C:/project',exitCode:status==='exited'?0:null,error:null,previewUrl:id==='web'?'http://127.0.0.1:5187/':null,startedAt:1,completedAt:null});
window.records={a:[record('web','a'),record('test','a','exited')],b:[record('foreign','b')]};
window.api={
 managedProcessRead:async(sessionId,id)=>{window.calls.push({kind:'read',sessionId,id});const rows=structuredClone(window.records[sessionId]);const delay=window.delayRead;if(delay)await new Promise(r=>setTimeout(r,delay));return id?{process:rows.find(x=>x.id===id),output:[{cursor:1,stream:'stdout',text:sessionId==='a'?'preview-ready\\n':'other-chat\\n'},{cursor:2,stream:'stderr',text:'diagnostic\\n'}],outputDropped:true}:{processes:rows};},
 managedProcessStop:async(sessionId,id)=>{window.calls.push({kind:'stop',sessionId,id});if(window.failStop)throw Error('Stop refused by fixture');window.records[sessionId].find(x=>x.id===id).status='stopped';},
 managedProcessStopSession:async(sessionId)=>{window.calls.push({kind:'stopAll',sessionId});for(const x of window.records[sessionId])if(x.status==='running')x.status='stopped';}
};
window.state={openWorkPanelTabForSession:(...args)=>window.opened.push(args),messages:[{id:'edit',role:'tool',toolName:'apply_patch',toolStatus:'success',agentName:'fixer',toolResult:{details:{nativeFileChanges:[{path:'calc.mjs',operation:'add',diff:'+export const add = (a,b) => a+b;',truncated:false}]}}}]};
const root=createRoot(document.getElementById('root'));
window.render=(sessionId='a',active=true)=>root.render(<><section className='panel'><ProcessesTab key={sessionId} sessionId={sessionId} active={active}/></section><section className='panel'><ReviewTab/></section><footer>Composer area</footer></>);
window.render();`;
const mocks = {
  api: "export const api=new Proxy({}, {get:(_,key)=>(...args)=>window.api[key](...args)});",
  store: "export const useAppStore=select=>select(window.state);",
  ui: "import React from 'react';export const TooltipButton=({tooltip,ariaLabel,children,...props})=><button title={tooltip} aria-label={ariaLabel} {...props}>{children}</button>;",
  translation: "export const useTranslation=()=>({t:(key,args)=>key==='panel.review.changes'?args.count+' changes':key});",
  card: "export const ReviewChangeCard=()=>null;",
};
const bundle = await build({ stdin: { contents: fixture, resolveDir: desktop, loader: "tsx" },
  bundle: true, write: false, format: "iife", jsx: "automatic", define: { "process.env.NODE_ENV": '"production"' },
  plugins: [{name:"inspection-mocks",setup(b){
    b.onResolve({filter:/^(\.\.\/\.\.\/lib\/api|\.\.\/\.\.\/stores\/app-store|\.\.\/ui|react-i18next|\.\.\/ReviewChangeCard)$/},args=>({path:args.path.includes('/lib/api')?'api':args.path.includes('/stores/')?'store':args.path==='../ui'?'ui':args.path==='react-i18next'?'translation':'card',namespace:'mock'}));
    b.onLoad({filter:/.*/,namespace:'mock'},args=>({contents:mocks[args.path],loader:'jsx',resolveDir:desktop}));
    b.onResolve({filter:/^@pi-desktop\/shared$/},()=>({path:fileURLToPath(new URL('../../packages/shared/src/index.ts',import.meta.url))}));
  }}] });
const assets = join(desktop, "out/renderer/assets");
const cssName = (await readdir(assets)).find(name => name.endsWith(".css"));
const css = await readFile(join(assets, cssName), "utf8");
const server = createServer((request,response)=>{
  if(request.url==='/app.js'){response.setHeader('Content-Type','text/javascript');response.end(bundle.outputFiles[0].text);return;}
  if(request.url==='/app.css'){response.setHeader('Content-Type','text/css');response.end(css);return;}
  response.setHeader('Content-Type','text/html');response.end(`<!doctype html><html data-theme="twilight-mountains"><head><link rel="stylesheet" href="/app.css"><style>body{margin:0;background:var(--ds-bg-base);color:var(--ds-text-primary)}#root{display:grid;grid-template-columns:1fr 1fr;height:100vh;grid-template-rows:minmax(0,1fr) 64px;gap:12px;padding:12px}.panel{min-height:0;overflow:hidden;background:var(--ds-bg-surface);border:1px solid var(--ds-border-default)}footer{grid-column:1/-1;border-top:1px solid var(--ds-border-default);padding:15px}@media(max-width:600px){#root{grid-template-columns:1fr;grid-template-rows:minmax(0,1fr) 160px 64px}}</style></head><body><div id="root"></div><script src="/app.js"></script></body></html>`);
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
let browser;
const errors=[];const observations=[];
try {
  browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
  const page=await browser.newPage({viewport:{width:1120,height:780}});
  page.setDefaultTimeout(10_000);
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.getByLabel('Process output').getByText('preview-ready').waitFor();
  await page.getByRole('button',{name:/^node server.mjs running/}).click();
  await page.getByRole('button',{name:'Open preview',exact:true}).click();
  assert.equal(await page.evaluate(()=>window.opened[0][0]),'a');
  await page.locator('.native-review-change summary').click();
  assert.match(await page.locator('.native-review-change pre').innerText(),/export const add/);
  assert.equal(await page.getByRole('button',{name:/rollback|revert/i}).count(),0);
  for(const width of [1120,375]){
    await page.setViewportSize({width,height:780});
    for(const theme of ['twilight-mountains','obsidian-horizon','emerald-afterglow','alpine-light']){
      await page.evaluate(theme=>{document.documentElement.dataset.theme=theme==='alpine-light'?'light':'dark';document.documentElement.dataset.scenicTheme=theme;},theme);
      const bounds=await page.locator('.processes-tab').boundingBox();
      assert(bounds.x>=0 && bounds.x+bounds.width<=width);
      const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);
      assert.equal(overflow,false,`${theme}/${width} overflow`);
      const footer=await page.locator('footer').boundingBox();assert(bounds.y+bounds.height<=footer.y);
      await page.screenshot({path:join(output,`${theme}-${width}.png`)});
      observations.push({theme,width,bounds});
    }
  }
  await page.getByRole('button',{name:'Refresh processes',exact:true}).focus();
  await page.keyboard.press('Tab');await page.keyboard.press('Shift+Tab');
  assert.equal(await page.evaluate(()=>getComputedStyle(document.activeElement).outlineStyle),'solid');
  await page.evaluate(()=>window.failStop=true);
  await page.getByRole('button',{name:'Stop node server.mjs',exact:true}).click();
  await page.getByRole('alert').getByText('Stop refused by fixture').waitFor();
  await page.getByRole('button',{name:'Refresh processes',exact:true}).click();
  await page.waitForTimeout(1800);
  assert(await page.getByRole('alert').getByText('Stop refused by fixture').isVisible());
  await page.evaluate(()=>window.failStop=false);
  await page.getByRole('button',{name:'Stop node server.mjs',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('.processes-detail-heading')?.textContent==='stopped');
  await page.evaluate(()=>{window.records.a[0].status='running';window.render('a',true);});
  await page.getByRole('button',{name:'Refresh processes',exact:true}).click();
  await page.getByRole('button',{name:'Stop all',exact:true}).click();
  await page.waitForFunction(()=>window.calls.some(x=>x.kind==='stopAll'&&x.sessionId==='a'));
  await page.evaluate(()=>{window.delayRead=300;window.render('a',true);});
  await page.getByRole('button',{name:'Refresh processes',exact:true}).click();
  await page.waitForTimeout(50);
  await page.evaluate(()=>window.render('b',true));
  await page.getByLabel('Process output').getByText('other-chat').waitFor();
  assert(!await page.getByLabel('Process output').getByText('preview-ready').count());
  await page.evaluate(()=>window.render('b',false));
  await page.waitForTimeout(400);
  const count=await page.evaluate(()=>window.calls.length);await page.waitForTimeout(1700);
  assert.equal(await page.evaluate(()=>window.calls.length),count,'Inactive polling stops');
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});window.render('b',true);});
  await page.waitForTimeout(1700);assert.equal(await page.evaluate(()=>window.calls.length),count,'Hidden polling stops');
  assert.deepEqual(errors,[]);
  await writeFile(join(output,'report.json'),JSON.stringify({passed:true,scope:'Real React components, controlled IPC; four themes, narrow/desktop layout, keyboard, stop actions/errors, preview routing, native review and stale/inactive/hidden polling.',observations},null,2));
  console.log(JSON.stringify({passed:true,output}));
} finally {await browser?.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
