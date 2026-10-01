import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { EventEmitter } from "node:events";
import vm from "node:vm";

const require = createRequire(import.meta.url);
const { transformSync } = createRequire(require.resolve("vite"))("esbuild");
const source = readFileSync(new URL("../electron/main/browser-composer-host.ts", import.meta.url), "utf8");
const contractSource = readFileSync(new URL("../common/browser-composer.ts", import.meta.url), "utf8");
const channels = { invoke: { browserComposer: "request" }, event: { browserComposer: "event" } };

function fixture() {
  let handler;
  let native;
  const main = new EventEmitter();
  main.webContents = Object.assign(new EventEmitter(), { id: 1, send: (channel, input) => main.emit("message", input) });
  main.isDestroyed = () => false;
  main.getContentSize = () => [1200, 800];
  main.contentView = { children: [], addChildView(view) { this.children = this.children.filter(v => v !== view); this.children.push(view); } };
  class View {
    constructor() {
      native = this;
      this.webContents = Object.assign(new EventEmitter(), { id: 2, isDestroyed: () => false, setWindowOpenHandler() {}, loadFile: async () => {}, loadURL: async () => {}, send() {}, close() {} });
    }
    setVisible(value) { this.visible = value; }
    setBounds(value) { this.bounds = value; }
    setBackgroundColor() {}
  }
  const contract = { exports: {} };
  vm.runInNewContext(transformSync(contractSource, { loader: "ts", format: "cjs" }).code, { module: contract, exports: contract.exports });
  const module = { exports: {} };
  vm.runInNewContext(transformSync(source, { loader: "ts", format: "cjs" }).code, {
    module, exports: module.exports, __dirname: "/test", process: { env: {} }, URL,
    setTimeout, clearTimeout,
    require: specifier => specifier === "electron" ? { app: { getLocale: () => "en" }, BrowserWindow: class {}, WebContentsView: View, ipcMain: { handle: (_channel, fn) => { handler = fn; } } }
      : specifier === "@pi-desktop/shared" ? { IPC: channels }
      : specifier.includes("common/browser-composer") ? contract.exports : require(specifier),
  });
  const host = new module.exports.BrowserComposerHost();
  host.register(() => main);
  const invoke = (id, input) => handler({ sender: { id } }, input);
  const snapshot = (generation = 1, visible = true, sessionId = "chat") => ({ generation, visible, sessionId, state: {}, theme: "dark", font: "sans-serif", draft: { text: "before", fileReferences: [] } });
  const publish = value => invoke(1, { kind: "snapshot", snapshot: value });
  return { host, main, invoke, snapshot, publish, native: () => native };
}

test("native input is isolated by actual sender, session, generation and action allowlist", async () => {
  const f = fixture();
  try {
    assert.equal((await f.invoke(9, { kind: "ready" })).ok, false);
    await f.publish(f.snapshot());
    assert.equal(f.host.ownsSender(9), false);
    assert.equal(f.host.ownsSender(2, true), true);
    await f.publish(f.snapshot(2, false));
    assert.equal(f.host.ownsSender(2, true), false);
    assert.equal(f.host.ownsSender(2), true, "Hidden trusted renderer can cancel its speech request");
    await f.publish(f.snapshot(3));
    assert.equal((await f.invoke(2, { kind: "snapshot", snapshot: f.snapshot(9) })).ok, false);
    for (const input of [
      { kind: "action", action: "sendPrompt", args: [], generation: 0, sessionId: "chat" },
      { kind: "action", action: "sendPrompt", args: [], generation: 3, sessionId: "other" },
      { kind: "action", action: "deleteSession", args: [], generation: 3, sessionId: "chat" },
    ]) assert.equal((await f.invoke(2, input)).ok, false);
  } finally { f.host.dispose(); }
});

test("drafts survive state batches, tab stacking and return; stale snapshots cannot reopen input", async () => {
  const f = fixture();
  try {
    await f.publish(f.snapshot());
    const draft = { text: "after", fileReferences: [{ path: "image.png", name: "image.png", kind: "image" }] };
    await f.invoke(2, { kind: "draft", generation: 1, sessionId: "chat", draft });
    await f.publish({ ...f.snapshot(), draft: undefined });
    assert.deepEqual((await f.invoke(2, { kind: "ready" })).data.draft, draft);
    f.main.contentView.addChildView({ page: true });
    f.host.raise();
    assert.equal(f.main.contentView.children.at(-1), f.native());
    await f.publish(f.snapshot(2, false));
    await f.publish(f.snapshot(1));
    assert.equal(f.native().visible, false);
    assert.equal((await f.invoke(2, { kind: "draft", generation: 1, sessionId: "chat", draft })).ok, false);
  } finally { f.host.dispose(); }
});

test("an accepted action runs once and can finish after Full view closes", async () => {
  const f = fixture();
  try {
    await f.publish(f.snapshot());
    const actions = [];
    f.main.on("message", input => { if (input.kind === "action") actions.push(input); });
    const response = f.invoke(2, { kind: "action", action: "abort", args: [], generation: 1, sessionId: "chat" });
    assert.equal(actions.length, 1);
    await f.publish(f.snapshot(2, false));
    await f.invoke(1, { kind: "result", id: actions[0].id, value: true });
    assert.equal((await response).data, true);
    await f.invoke(1, { kind: "result", id: actions[0].id, value: false });
    assert.equal(actions.length, 1);
  } finally { f.host.dispose(); }
});

test("blocking overlays hide native input; main reload rejects work without replay and resets ownership", async () => {
  const f = fixture();
  try {
    await f.publish(f.snapshot(8));
    await f.invoke(1, { kind: "blocked", blocked: true });
    f.host.raise();
    assert.equal(f.native().visible, false);
    assert.equal((await f.invoke(2, { kind: "action", action: "abort", args: [], generation: 8, sessionId: "chat" })).ok, false);
    await f.invoke(1, { kind: "blocked", blocked: false });
    assert.equal(f.native().visible, true);
    const pending = f.invoke(2, { kind: "action", action: "abort", args: [], generation: 8, sessionId: "chat" });
    f.main.webContents.emit("did-start-navigation", {}, "about:blank", false, false);
    f.main.webContents.emit("did-start-navigation", {}, "about:blank#hash", true, true);
    assert.equal(f.native().visible, true, "Subframe and in-place navigation retain the composer");
    f.main.webContents.emit("did-start-navigation", {}, "about:blank", false, true);
    assert.equal((await pending).ok, false);
    assert.equal(f.native().visible, false);
    await f.publish(f.snapshot(1));
    assert.equal(f.native().visible, true);
  } finally { f.host.dispose(); }
});
