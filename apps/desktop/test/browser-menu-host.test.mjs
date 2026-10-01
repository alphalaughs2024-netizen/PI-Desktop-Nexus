import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { EventEmitter } from "node:events";
import vm from "node:vm";

const require = createRequire(import.meta.url);
const { transformSync } = createRequire(require.resolve("vite"))("esbuild");
const source = readFileSync(new URL("../electron/main/browser-menu-host.ts", import.meta.url), "utf8");
const contract = readFileSync(new URL("../common/browser-menu.ts", import.meta.url), "utf8");

function fixture(load = async () => {}) {
  let handler, native, destroyed = false;
  const main = new EventEmitter();
  const messages = [];
  main.webContents = Object.assign(new EventEmitter(), { id: 1, focus() {}, send: (_channel, input) => messages.push(input) });
  main.isDestroyed = () => destroyed;
  main.getContentSize = () => [600, 400];
  main.contentView = { children: [], addChildView(view) { this.children = this.children.filter(v => v !== view); this.children.push(view); } };
  class View {
    constructor() {
      native = this;
      this.destroyed = false;
      this.webContents = Object.assign(new EventEmitter(), { id: 2, isDestroyed: () => this.destroyed, focus() {}, setWindowOpenHandler() {}, loadFile: load, loadURL: load, send() {}, close: () => { this.destroyed = true; } });
    }
    setVisible(value) { assert.equal(this.destroyed, false); this.visible = value; }
    setBounds(value) { this.bounds = value; }
    setBackgroundColor() {}
  }
  const common = { exports: {} };
  vm.runInNewContext(transformSync(contract, { loader: "ts", format: "cjs" }).code, { module: common, exports: common.exports });
  const module = { exports: {} };
  vm.runInNewContext(transformSync(source, { loader: "ts", format: "cjs" }).code, {
    module, exports: module.exports, __dirname: "/test", process: { env: {} }, URL,
    require: id => id === "electron" ? { app: { getLocale: () => "en" }, WebContentsView: View, ipcMain: { handle: (_channel, fn) => { handler = fn; } } }
      : id === "@pi-desktop/shared" ? { IPC: { invoke: { browserMenu: "request" }, event: { browserMenu: "event" } } }
      : id.includes("common/browser-menu") ? common.exports : require(id),
  });
  const host = new module.exports.BrowserMenuHost();
  host.register(() => main);
  const invoke = (id, input) => handler({ sender: { id } }, input);
  const snapshot = id => ({ id, sessionId: "chat", title: "Actions", anchor: { left: 590, top: 390 }, items: [{ id: "copy", label: "Copy", icon: "copy" }, { id: "close", label: "Close", icon: "close", disabled: true }], theme: "dark", styleTokens: {} });
  const show = id => invoke(1, { kind: "show", snapshot: snapshot(id) });
  const action = (id = 1, itemId = "copy", sessionId = "chat") => invoke(2, { kind: "action", id, itemId, sessionId });
  return { host, main, invoke, snapshot, show, action, messages, native: () => native, destroyWindow: () => { destroyed = true; main.emit("closed"); } };
}

test("native menus validate sender and current enabled item, dispatching once", async () => {
  const f = fixture();
  try {
    assert.equal((await f.invoke(9, { kind: "show", snapshot: f.snapshot(1) })).ok, false);
    assert.equal((await f.show(1)).ok, true);
    assert.equal((await f.invoke(2, { kind: "show", snapshot: f.snapshot(2) })).ok, false);
    assert.equal((await f.action(1, "close")).ok, false);
    assert.equal((await f.action(1, "copy", "other")).ok, false);
    assert.equal((await f.action(0)).ok, false);
    assert.equal((await f.action()).ok, true);
    assert.equal((await f.action()).ok, false);
    assert.equal(f.messages.filter(message => message.kind === "action").length, 1);
    assert.equal(f.native().visible, false);
    await f.show(2);
    await f.show(1);
    await f.invoke(1, { kind: "close", id: 1 });
    assert.equal(f.native().visible, true, "Old cleanup cannot dismiss a newer menu");
  } finally { f.host.dispose(); }
});

test("menu geometry is clamped above the live guest; resize, reload and destruction retire it", async () => {
  const f = fixture();
  try {
    await f.show(1);
    const { x, y, width, height } = f.native().bounds;
    assert.ok(x >= 8 && y >= 8 && x + width <= 592 && y + height <= 392);
    f.main.contentView.addChildView({ page: true });
    f.host.raise();
    assert.equal(f.main.contentView.children.at(-1), f.native());
    f.main.emit("resize");
    assert.equal(f.native().visible, false);
    await f.show(2);
    const guest = new EventEmitter();
    f.host.watchGuest(guest);
    f.host.watchGuest(guest);
    assert.equal(guest.listenerCount("before-mouse-event"), 1);
    guest.emit("before-mouse-event", {}, { type: "mouseDown" });
    assert.equal(f.native().visible, false, "Actual guest input closes the menu");
    await f.show(3);
    f.main.webContents.emit("did-start-navigation", {}, "about:blank", false, true);
    assert.equal(f.native().visible, false);
    await f.show(1);
    assert.equal(f.native().visible, true, "Reload resets renderer revision sequence");
    f.native().destroyed = true;
    f.native().webContents.emit("render-process-gone");
    await f.show(2);
    f.destroyWindow();
    assert.equal(f.native().destroyed, true);
  } finally { f.host.dispose(); }
});

test("dismissal during load cannot reopen a menu and failed loads permit recovery", async () => {
  let release;
  const f = fixture(() => new Promise(resolve => { release = resolve; }));
  const pending = f.show(1);
  await f.invoke(1, { kind: "close", id: 1 });
  release();
  await pending;
  assert.equal(f.native().visible, false);
  f.host.dispose();
  let fail = true;
  const g = fixture(async () => { if (fail) throw new Error("Load failed"); });
  try {
    assert.equal((await g.show(1)).ok, false);
    fail = false;
    assert.equal((await g.show(2)).ok, true);
    assert.equal(g.native().visible, true);
  } finally { g.host.dispose(); }
});
