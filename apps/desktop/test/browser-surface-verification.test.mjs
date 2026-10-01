import assert from "node:assert/strict";
import test from "node:test";
import { EventEmitter } from "node:events";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";

const require = createRequire(new URL("../../../packages/agent-runtime/package.json", import.meta.url));
const { buildSync } = require("esbuild");
const code = buildSync({ entryPoints: [new URL("../electron/main/browser-view.ts", import.meta.url).pathname.replace(/^\/(\w:)/, "$1")], bundle: true, write: false, platform: "node", format: "cjs", external: ["electron"] }).outputFiles[0].text;
const image = (width = 640, height = 480) => ({ getSize: () => ({ width, height }), toPNG: () => Buffer.alloc(width && height ? 100 : 0) });
const waitFor = async (predicate) => {
  const deadline = Date.now() + 2000;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error("Surface condition timed out");
    await new Promise(resolve => setTimeout(resolve, 10));
  }
};

function fixture(capture) {
  let view;
  class Guest {
    constructor() {
      view = this;
      this.bounds = { width: 0, height: 0 };
      this.captures = 0;
      const wc = this.webContents = new EventEmitter();
      wc.url = "";
      wc.isDestroyed = () => false;
      wc.getURL = () => wc.url;
      wc.getTitle = () => "Fixture";
      wc.isLoading = () => false;
      wc.navigationHistory = { canGoBack: () => false, canGoForward: () => false };
      wc.setWindowOpenHandler = () => {};
      wc.session = { setPermissionRequestHandler() {}, setPermissionCheckHandler() {} };
      wc.loadURL = async url => { wc.emit("did-start-loading"); wc.url = url; wc.emit("did-finish-load"); wc.emit("did-stop-loading"); };
      wc.capturePage = async () => { this.captures++; return capture?.(this) ?? image(this.bounds.width, this.bounds.height); };
      wc.close = () => {};
    }
    setBounds(bounds) { this.bounds = bounds; }
  }
  const module = { exports: {} };
  runInNewContext(code, { module, exports: module.exports, require: id => id === "electron" ? { WebContentsView: Guest, shell: {} } : require(id), Buffer, URL,
    setTimeout: (callback, ms) => setTimeout(callback, ms === 5000 ? 20 : ms), clearTimeout });
  const states = [];
  const pane = new module.exports.BrowserPane(state => states.push({ state, surface: pane.surfaceStatus() }));
  const children = [];
  pane.setWindow({ isDestroyed: () => false, contentView: { children, addChildView: child => children.push(child), removeChildView: child => children.splice(children.indexOf(child), 1) } });
  return { pane, states, get view() { return view; } };
}

test("agent-opened page waits for GUI bounds before verifying its surface", async () => {
  const f = fixture();
  f.pane.setVisible(true);
  await f.pane.navigateAndWait("https://fixture.example/");
  await new Promise(resolve => setTimeout(resolve, 30));
  assert.equal(f.view.captures, 0);
  assert.equal(f.pane.surfaceStatus().paint, "unknown");
  f.pane.setBounds({ x: 20, y: 50, width: 640, height: 480 });
  await waitFor(() => f.pane.surfaceStatus().paint === "painted");
  assert.equal(f.view.webContents.url, "https://fixture.example/");
  f.pane.dispose();
});

test("main-document readiness returns and paints while remaining resources are loading", async () => {
  const f = fixture();
  await f.pane.navigateAndWait("https://fixture.example/");
  const wc = f.view.webContents;
  wc.isLoading = () => true;
  wc.loadURL = url => { wc.url = url; wc.emit("did-start-loading"); queueMicrotask(() => wc.emit("dom-ready")); return new Promise(() => {}); };
  f.pane.setBounds({ x: 0, y: 0, width: 640, height: 480 }); f.pane.setVisible(true);
  const result = await f.pane.navigateAndWait("https://fixture.example/slow", null, 100);
  assert.equal(result.isLoading, true, "Resource loading remains truthful");
  assert.equal(result.url, "https://fixture.example/slow");
  assert.equal(wc.listenerCount("dom-ready"), 1, "Only the pane's lifecycle listener remains");
  await waitFor(() => f.pane.surfaceStatus().paint === "painted");
  f.pane.dispose();
});

test("failed and never-ready navigation preserve explicit errors and retire readiness listeners", async () => {
  const f = fixture();
  await f.pane.navigateAndWait("https://fixture.example/");
  const wc = f.view.webContents;
  wc.loadURL = async () => { throw new Error("ERR_CONNECTION_REFUSED"); };
  await assert.rejects(f.pane.navigateAndWait("https://fixture.example/failed"), /ERR_CONNECTION_REFUSED/);
  let stopped = false;
  wc.loadURL = () => new Promise(() => {});
  wc.stop = () => { stopped = true; };
  await assert.rejects(f.pane.navigateAndWait("https://fixture.example/stalled", null, 15), /navigation timed out/);
  assert.equal(stopped, true);
  assert.equal(wc.listenerCount("dom-ready"), 1);
  f.pane.dispose();
});

test("a capture from an older geometry cannot mark the new surface blank", async () => {
  let resolveFirst;
  const f = fixture(view => view.captures === 1 ? new Promise(resolve => { resolveFirst = resolve; }) : image());
  await f.pane.navigateAndWait("https://fixture.example/");
  f.pane.setBounds({ x: 0, y: 0, width: 400, height: 300 }); f.pane.setVisible(true);
  await waitFor(() => !!resolveFirst);
  f.pane.setBounds({ x: 0, y: 0, width: 640, height: 480 });
  resolveFirst(image(0, 0));
  await waitFor(() => f.pane.surfaceStatus().paint === "painted");
  assert.equal(f.states.some(event => event.surface.paint === "blank"), false);
  f.pane.dispose();
});

test("transient empty capture recovers without reloading or manual Retry", async () => {
  const f = fixture(view => view.captures === 1 ? image(0, 0) : image());
  await f.pane.navigateAndWait("https://fixture.example/");
  f.pane.setBounds({ x: 0, y: 0, width: 640, height: 480 }); f.pane.setVisible(true);
  await waitFor(() => f.pane.surfaceStatus().paint === "painted");
  assert.equal(f.view.captures, 2);
  assert.equal(f.states.some(event => event.surface.paint === "blank"), false);
  f.pane.dispose();
});

test("persistent capture failure is bounded and manual Retry can recover", async () => {
  let healthy = false;
  const f = fixture(() => healthy ? image() : new Promise(() => {}));
  await f.pane.navigateAndWait("https://fixture.example/");
  f.pane.setBounds({ x: 0, y: 0, width: 640, height: 480 }); f.pane.setVisible(true);
  await waitFor(() => f.pane.surfaceStatus().paint === "blank");
  assert.equal(f.view.captures, 3);
  healthy = true; f.pane.retrySurface();
  await waitFor(() => f.pane.surfaceStatus().paint === "painted");
  f.pane.dispose();
});

test("overlay detach retires old capture and reattach verifies the retained page", async () => {
  let resolveFirst;
  const f = fixture(view => view.captures === 1 ? new Promise(resolve => { resolveFirst = resolve; }) : image());
  await f.pane.navigateAndWait("https://fixture.example/");
  f.pane.setBounds({ x: 0, y: 0, width: 640, height: 480 }); f.pane.setVisible(true);
  await waitFor(() => !!resolveFirst);
  f.pane.setVisible(false); resolveFirst(image(0, 0));
  await new Promise(resolve => setTimeout(resolve, 30));
  assert.equal(f.pane.surfaceStatus().paint, "unknown");
  f.pane.setVisible(true);
  await waitFor(() => f.pane.surfaceStatus().paint === "painted");
  assert.equal(f.states.some(event => event.surface.paint === "blank"), false);
  f.pane.dispose();
});
