import assert from "node:assert/strict";
import { readFile, mkdir } from "node:fs/promises";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { createRequire } from "node:module";
import { chromium } from "playwright-core";

// Opt-in actual-component motion probe; no host, agent or external site runs.
const desktop = fileURLToPath(new URL("..", import.meta.url));
const require = createRequire(import.meta.url);
const { build } = createRequire(require.resolve("vite"))("esbuild");
const output = process.env.SLIDER_MOTION_OUTPUT;
if (output) await mkdir(output, { recursive: true });
const bundled = await build({
  stdin: { resolveDir: desktop, loader: "tsx", contents: `
    import React, {useState} from "react";
    import {createRoot} from "react-dom/client";
    import {flushSync} from "react-dom";
    import {ReasoningSlider} from "./src/components/ReasoningSlider";
    function Harness() {
      const [level,setLevel] = useState("medium");
      const [calls,setCalls] = useState(0);
      window.harness = {setLevel: next=>flushSync(()=>setLevel(next)), level, calls};
      return <ReasoningSlider levels={["off","minimal","low","medium","high","xhigh","max"]}
        value={level} defaultValue="medium" modelLabel="Motion fixture" disabled={false}
        onModel={()=>{}} onSelect={async next=>{
          setCalls(n=>n+1); await new Promise(r=>setTimeout(r,20));
          if(window.rejectNext) {window.rejectNext=false; throw Error("fixture");}
          setLevel(next);
        }}/>;
    }
    createRoot(document.getElementById("root")).render(<Harness/>);
  ` },
  bundle: true, write: false, jsx: "automatic", define: { "process.env.NODE_ENV": '"production"' },
  plugins: [{ name: "license-url", setup(build) {
    build.onResolve({ filter: /\.txt\?no-inline&url$/ }, args => ({ path: args.path, namespace: "license" }));
    build.onLoad({ filter: /.*/, namespace: "license" }, () => ({ contents: 'export default "/license.txt";' }));
  } }],
});
const css = await readFile(resolve(desktop, "src/styles/reasoning-slider.css"), "utf8");
const server = createServer((req, res) => {
  if (req.url === "/bundle.js") { res.setHeader("content-type", "text/javascript"); res.end(bundled.outputFiles[0].text); }
  else res.end(`<!doctype html><html data-theme="dark" data-scenic-theme="twilight-mountains">
    <meta name="viewport" content="width=device-width,initial-scale=1"><style>
    :root{--ds-text-primary:#edf3fc;--ds-text-secondary:#aab7ca;--ds-bg-inset:#142235;--ds-border-default:#45546c;--ds-accent:#79acff;--ds-bg-hover:#ffffff18}
    *{box-sizing:border-box}body{margin:0;background:#162b48;color:#edf3fc;font-family:Arial}
    #root{width:min(340px,calc(100vw - 32px));margin:120px auto;background:#202b3a;border-radius:8px}
    button{font:inherit;cursor:pointer}${css}</style><div id="root"></div><script src="/bundle.js"></script></html>`);
});
await new Promise(r => server.listen(0, "127.0.0.1", r));
let browser;
try {
  browser = await chromium.launch({ executablePath: process.env.SLIDER_CHROME_PATH || undefined });
  const page = await browser.newPage({ viewport: { width: 1100, height: 780 } });
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  await page.addInitScript(() => {
    window.canvasResizes = 0;
    for (const key of ["width", "height"]) {
      const descriptor = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, key);
      Object.defineProperty(HTMLCanvasElement.prototype, key, { ...descriptor, set(value) {
        window.canvasResizes++; descriptor.set.call(this, value);
      } });
    }
  });
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  const slider = page.getByRole("slider");
  await slider.waitFor();
  await page.waitForTimeout(220);
  const sample = async (level, reverse) => page.evaluate(async ({level,reverse}) => {
    const thumb = document.querySelector(".reasoning-thumb");
    const fill = document.querySelector(".reasoning-fill");
    const root = document.querySelector(".reasoning-slider");
    const rail = document.querySelector(".reasoning-rail");
    const get = () => ({ time:performance.now(), x:parseFloat(getComputedStyle(thumb).left),
      fill:fill.getBoundingClientRect().width, color:getComputedStyle(root).getPropertyValue("--reasoning-from"),
      canvas:document.querySelector("canvas").getBoundingClientRect().width, rail:rail.clientWidth });
    const initial = get(); const frames = []; let reversed = false;
    window.harness.setLevel(level);
    await new Promise(done => {
      const tick = () => {
        frames.push(get());
        if(reverse && !reversed && frames.at(-1).time-initial.time>65) {
          window.harness.setLevel("off"); reversed=true;
        }
        if(frames.at(-1).time-initial.time<400) requestAnimationFrame(tick); else done();
      }; requestAnimationFrame(tick);
    });
    return {initial,frames,resizes:window.canvasResizes};
  }, {level,reverse});
  for (const theme of ["twilight-mountains","obsidian-horizon","emerald-afterglow","alpine-light"]) {
    await page.evaluate(theme => { document.documentElement.dataset.scenicTheme=theme; window.harness.setLevel("medium"); }, theme);
    await page.waitForTimeout(220);
    const before = await page.evaluate(() => window.canvasResizes);
    const {initial,frames,resizes} = await sample("max");
    const end = frames.at(-1);
    assert(end.x > initial.x + 50, `${theme}: thumb must move`);
    assert(frames.some(f => f.x > initial.x+2 && f.x < end.x-2), `${theme}: thumb must pass intermediate positions: ${JSON.stringify({initial,frames:frames.slice(0,8),end})}`);
    assert(frames.some(f => f.fill > initial.fill+2 && f.fill < end.fill-2), `${theme}: fill must pass intermediate widths`);
    assert(frames.some(f => f.color !== initial.color && f.color !== end.color), `${theme}: gradient must interpolate`);
    // The rail's two border pixels reduce its inner percentage width.
    assert(frames.every(f => Math.abs(f.x-f.fill) <= 2.1 && Math.abs(f.canvas-f.rail)<1), `${theme}: thumb/fill stay synchronized; canvas remains rail-sized`);
    assert.equal(resizes,before, `${theme}: effort changes must not reset canvas`);
    if(output) await page.screenshot({path:resolve(output,`${theme}.png`)});
    console.log(`${theme}: ${frames.length} frames; intermediate thumb/fill/colour, synchronized geometry, no canvas resets`);
  }
  await page.evaluate(() => window.harness.setLevel("off")); await page.waitForTimeout(550);
  const reversed = await sample("max", true);
  assert(reversed.frames.some(f=>f.x>reversed.initial.x+10));
  assert(Math.abs(reversed.frames.at(-1).x-reversed.initial.x)<1, "reversal settles at Off");
  const pixels = () => page.locator("canvas").evaluate(c => {
    const data = c.getContext("2d").getImageData(0,0,c.width,c.height).data;
    return {nonblank:data.some(v=>v),hash:data.reduce((sum,v,i)=>(sum+v*(i%17))%10000019,0)};
  });
  await page.waitForTimeout(550); assert.equal((await pixels()).nonblank,false);
  await slider.press("End"); await page.waitForTimeout(300);
  const first = await pixels(); await page.waitForTimeout(80);
  assert(first.nonblank); assert.notEqual(first.hash,(await pixels()).hash,"particles move after waking from Off");
  await slider.press("Home"); await page.waitForTimeout(40);
  assert.equal(await slider.getAttribute("aria-valuetext"),"Off");
  await page.waitForTimeout(550);
  await page.getByRole("button",{name:"Reset reasoning to model default"}).click(); await page.waitForTimeout(240);
  assert.equal(await slider.getAttribute("aria-valuetext"),"Medium");
  const box = await slider.boundingBox(); const beforeCalls = await page.evaluate(()=>window.harness.calls);
  await page.mouse.move(box.x+box.width/2,box.y+box.height/2); await page.mouse.down();
  await page.mouse.move(box.x+box.width-11,box.y+box.height/2,{steps:15});
  assert.equal(await page.evaluate(()=>window.harness.calls),beforeCalls,"drag preview must not save");
  await page.mouse.up(); await page.waitForTimeout(240);
  assert.equal(await page.evaluate(()=>window.harness.calls),beforeCalls+1,"release saves exactly once");
  await page.evaluate(()=>{window.rejectNext=true}); await slider.press("Home"); await page.waitForTimeout(240);
  assert.equal(await slider.getAttribute("aria-valuetext"),"Max","failed save rolls back");
  await page.emulateMedia({reducedMotion:"reduce"}); await page.waitForTimeout(40);
  assert.equal((await pixels()).nonblank,false);
  const reduced = await sample("off");
  assert(reduced.frames.every(f=>Math.abs(f.x-reduced.frames.at(-1).x)<1),"reduced motion must settle immediately");
  await page.setViewportSize({width:375,height:780});
  assert.equal(await page.locator(".reasoning-slider").evaluate(el=>el.scrollWidth>el.clientWidth),false);
  if(output) await page.screenshot({path:resolve(output,"narrow-reduced.png")});
  assert.deepEqual(errors,[]);
  console.log("PASS: four palettes, animated pixels, interrupted/reversed transition, Off/wake, keyboard/reset, drag save, rejection rollback, reduced motion, 375px; zero page errors.");
} finally {
  await browser?.close(); await new Promise(r=>server.close(r));
}
