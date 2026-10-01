import assert from "node:assert/strict";
import test from "node:test";
import { EventEmitter } from "node:events";
import "./browser-test-loader.mjs";
const { BrowserBroker } = await import("../electron/main/browser-broker.ts");
const { BrowserDeveloper, BROWSER_DEVELOPER_METHODS } = await import("../electron/main/browser-developer.ts");
const { BrowserSitePermissions } = await import("../electron/main/browser-permissions.ts");
const { BrowserCdp, flattenAxTree } = await import("../electron/main/browser-cdp.ts");
const { validateBrowserInteraction, GuestTransport } = await import("../electron/main/browser-automation.ts");
const { BrowserTabsPane } = await import("../electron/main/browser-tabs-pane.ts");
const { BrowserPageServices } = await import("../electron/main/browser-page.ts");
import { BROWSER_TOOL_NAMES, SUBAGENT_PRESETS, SUBAGENT_BROWSER_TOOLS } from "@pi-desktop/shared";
const { createBrowserTypedTools } = await import("../electron/main/browser-typed-tools.ts");

function contents() {
  const wc = new EventEmitter(); wc.id = 42; wc.url = "https://example.test/start"; wc.getURL = () => wc.url; wc.isDestroyed = () => false;
  wc.debugger = new EventEmitter(); wc.debugger.isAttached = () => true; wc.debugger.attach = () => {}; wc.debugger.detach = () => {};
  wc.debugger.sendCommand = async () => ({});
  wc.session = Object.assign(new EventEmitter(), { setPermissionCheckHandler(fn) { this.check = fn; }, setPermissionRequestHandler(fn) { this.request = fn; } });
  return wc;
}

test("browser catalog, tool registration and writing presets expose the same complete set", () => {
  assert.deepEqual(createBrowserTypedTools({}).map(tool => tool.name).sort(), [...BROWSER_TOOL_NAMES].sort());
  assert.deepEqual([...SUBAGENT_BROWSER_TOOLS].sort(), [...BROWSER_TOOL_NAMES].sort());
  for (const id of ["fixer", "ui-designer", "test-runner"]) for (const tool of BROWSER_TOOL_NAMES) assert.ok(SUBAGENT_PRESETS.find(preset => preset.id === id).tools.includes(tool), `${id}: ${tool}`);
  assert.ok(!SUBAGENT_PRESETS.find(preset => preset.id === "code-reviewer").tools.includes("browser_evaluate"));
});

test("text waits use cached content after an unchanged snapshot", async () => {
  let count = 0;
  const broker = new BrowserBroker({ snapshot: async () => count++ ? { tree: "(unchanged)", unchanged: true, snapshotId: "s2" } : { tree: "Saved", snapshotId: "s1" }, getState: () => ({ url: "https://example.test" }) });
  await broker.snapshot();
  assert.equal((await broker.wait({ kind: "text", value: "Saved" })).ok, true);
});

test("Plan permits page inspection but denies export, console clearing and interaction", async () => {
  const broker = new BrowserBroker({ service: async () => ({}), console: async () => ({}), interact: async () => ({}) });
  assert.equal((await broker.service("page", { operation: "content" }, { mode: "plan" })).ok, true);
  assert.equal((await broker.service("page", { operation: "export", format: "html" }, { mode: "plan" })).code, "BROWSER_POLICY_BLOCKED");
  assert.equal((await broker.console(10, { mode: "plan" }, { clear: true })).code, "BROWSER_POLICY_BLOCKED");
  assert.equal((await broker.interact({ action: "click", locator: { text: "Buy" } }, { mode: "plan" })).code, "BROWSER_POLICY_BLOCKED");
});

test("takeover cancels the active agent and blocks queued mutations, resume restores access", async () => {
  let paused = false; let release; const pending = new Promise(resolve => { release = resolve; }); const calls = [];
  const broker = new BrowserBroker({ resolveTarget: (sessionId, browserId) => ({ sessionId, browserId }), isPaused: () => paused, setControl: (_target, owner) => { paused = owner === "user"; return { owner }; }, evaluate: async () => { calls.push("evaluate"); await pending; }, snapshot: async () => ({ tree: "Button", snapshotId: "s1" }), click: async () => calls.push("click") });
  const context = { sessionId: "s", browserId: "b" };
  const first = broker.evaluate("1", context); await Promise.resolve();
  const queued = broker.click("e1", context);
  broker.control("user", { ...context, actor: "user" });
  assert.equal((await first).code, "BROWSER_POSSIBLY_APPLIED");
  assert.equal((await queued).code, "BROWSER_CANCELLED");
  release(); await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal((await broker.click("e1", context)).code, "BROWSER_POLICY_BLOCKED");
  broker.control("agent", { ...context, actor: "user" });
  await broker.snapshot(context);
  assert.equal((await broker.click("e1", context)).ok, true);
  assert.deepEqual(calls, ["evaluate", "click"]);
  assert.throws(() => broker.control("agent", context));
});

test("Playwright deadlines produce explicit ambiguous mutation results", async () => {
  const broker = new BrowserBroker({ interact: async () => { const error = new Error("Timed out"); error.name = "TimeoutError"; throw error; } });
  assert.equal((await broker.interact({ action: "click", locator: { text: "Missing" } })).code, "BROWSER_POSSIBLY_APPLIED");
});

test("interaction validation rejects malformed locators and unbounded inputs", () => {
  for (const input of [null, { action: "click" }, { action: "inspect", locator: { css: "button", index: -1 } }, { action: "mouse", x: Infinity, y: 0 }, { action: "fill", locator: { label: "Name" }, text: "x".repeat(65537) }]) assert.throws(() => validateBrowserInteraction(input), { code: "BROWSER_INVALID_INPUT" });
  validateBrowserInteraction({ action: "click", locator: { frames: ["iframe"], role: "button", name: "Save" } });
});

test("AX cycles terminate, protected values stay hidden and limits are reported", () => {
  const tree = flattenAxTree([{ nodeId: "a", role: { value: "textbox" }, value: { value: "secret" }, properties: [{ name: "protected", value: { value: true } }], childIds: ["a"] }]);
  assert.equal(tree.nodeCount, 1); assert.ok(!tree.tree.includes("secret"));
  const large = flattenAxTree(Array.from({ length: 2100 }, (_, index) => ({ nodeId: String(index), role: { value: "button" } })));
  assert.equal(large.nodeCount, 2000); assert.equal(large.truncation.nodes, true);
});

test("Developer events redact credentials, revoke by site and restrict response body IDs", async () => {
  const wc = contents(); const developer = new BrowserDeveloper(wc);
  assert.throws(() => developer.read());
  await developer.grant("https://example.test");
  wc.debugger.emit("message", {}, "Network.requestWillBeSent", { requestId: "approved", request: { headers: { Authorization: "secret", Cookie: "secret" }, postData: "secret" } });
  const events = developer.read(); assert.equal(events.events.length, 1); assert.ok(!JSON.stringify(events).includes("secret"));
  assert.equal((await developer.send("Network.getResponseBody", { requestId: "approved" })) !== undefined, true);
  await assert.rejects(developer.send("Network.getResponseBody", { requestId: "other" }), { code: "PERMISSION_DENIED" });
  assert.ok(!BROWSER_DEVELOPER_METHODS.has("Storage.clearDataForOrigin"));
  assert.throws(() => developer.read(-1), { code: "BROWSER_INVALID_INPUT" });
  wc.url = "https://other.test"; wc.debugger.emit("message", {}, "Page.frameNavigated", { frame: { url: wc.url } });
  assert.equal(developer.status().enabled, false);
  wc.url = "https://example.test"; assert.equal(developer.status().enabled, false);
  developer.dispose();
});

test("site permissions require approval and stay document and media-type scoped", async () => {
  const wc = contents(); const asked = [];
  const permission = new BrowserSitePermissions(wc, async (origin, capability) => { asked.push({ origin, capability }); return true; });
  assert.equal(permission.check("media", "https://example.test", { mediaType: "audio" }), false);
  assert.equal(await permission.request("media", { requestingUrl: wc.url, mediaTypes: ["audio"] }), true);
  assert.equal(permission.check("media", "https://example.test", { mediaType: "audio" }), true);
  assert.equal(permission.check("media", "https://example.test", { mediaType: "video" }), false);
  assert.equal(await permission.request("media", { requestingUrl: "https://other.test", mediaTypes: ["video"] }), false);
  assert.equal(await permission.request("display-capture", { requestingUrl: wc.url }), false);
  assert.equal(asked.length, 1);
  wc.emit("did-start-navigation", {}, wc.url, false, true);
  assert.equal(permission.check("media", "https://example.test", { mediaType: "audio" }), false);
  permission.dispose();
});

test("navigation invalidates a pending permission even after returning to the same site", async () => {
  const wc = contents(); let resolve; const permission = new BrowserSitePermissions(wc, () => new Promise(done => { resolve = done; }));
  const request = permission.request("notifications", { requestingUrl: wc.url });
  wc.emit("did-start-navigation", {}, "https://other.test", false, true); resolve(true);
  assert.equal(await request, false); permission.dispose();
});

test("Developer revoke resets diagnostics and emulation before a new grant", async () => {
  const wc = contents(); const calls = [];
  wc.debugger.sendCommand = async (method, params) => { calls.push({ method, params }); return {}; };
  const developer = new BrowserDeveloper(wc);
  await developer.grant("https://example.test");
  await developer.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  const cleanup = developer.revoke();
  assert.equal(developer.allowed(), false);
  await cleanup;
  assert.ok(calls.some(call => call.method === "Emulation.setCPUThrottlingRate" && call.params.rate === 1));
  assert.ok(calls.some(call => call.method === "Network.disable"));
  await developer.grant("https://example.test");
  assert.equal(calls.at(-1).method, "Performance.enable");
  developer.dispose();
});

test("guest automation denies global targets and confines auto-attach to frames and workers", async () => {
  const wc = contents(); wc.getTitle = () => "Fixture"; const calls = []; const replies = [];
  wc.debugger.sendCommand = async (method, params) => { calls.push({ method, params }); return {}; };
  const transport = new GuestTransport(wc, "page-id"); transport.onmessage = message => replies.push(message);
  transport.send({ id: 1, method: "Target.setAutoAttach", params: { autoAttach: true } });
  transport.send({ id: 2, sessionId: "nexus-page", method: "Target.setAutoAttach", params: { autoAttach: true, waitForDebuggerOnStart: true } });
  transport.send({ id: 3, method: "Target.createTarget", params: { url: "https://other.test" } });
  transport.send({ id: 4, sessionId: "other-tab", method: "Runtime.evaluate", params: { expression: "1" } });
  await new Promise(resolve => setImmediate(resolve));
  assert.ok(replies.some(reply => reply.id === 3 && reply.error));
  assert.ok(replies.some(reply => reply.id === 4 && reply.error));
  assert.deepEqual(calls[0].params.filter, [{ type: "iframe" }, { type: "worker" }, { exclude: true }]);
  assert.equal(calls[0].params.waitForDebuggerOnStart, false);
  transport.close();
  assert.equal(wc.debugger.listenerCount("message"), 0);
});

test("all tab creation paths enforce the limit and background popups preserve selection", async () => {
  const panes = [];
  const tabs = new BrowserTabsPane(() => {}, () => {
    const pane = { setWindow() {}, setBounds() {}, setVisible() {}, dispose() {}, getState: () => null, getWebContents: () => null,
      surfaceStatus: () => ({ generation: 0 }), setPopupHandler(handler, allowed) { this.popup = handler; this.allowed = allowed; }, createPopup: () => ({}) };
    panes.push(pane); return pane;
  });
  tabs.activateSession("chat");
  const opener = tabs.activeBrowserId("chat");
  panes[0].popup({ background: true });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(tabs.activeBrowserId("chat"), opener);
  assert.equal(tabs.listTabs()[1].openerBrowserId, opener);
  while (tabs.listTabs().length < 20) tabs.createTab("chat");
  assert.equal(panes[0].allowed(), false);
  assert.throws(() => tabs.createTab("chat"), { code: "BROWSER_INVALID_INPUT" });
  assert.throws(() => tabs.activate("chat", "arbitrary-extra-tab"), { code: "BROWSER_INVALID_INPUT" });
  assert.equal(tabs.activeBrowserId("chat"), opener);
  panes[1].onGuestDestroyed();
  assert.equal(tabs.listTabs().length, 19);
  tabs.dispose();
});

test("destroyed native guests clean up without accessing destroyed Electron properties", async () => {
  const wc = contents(); const session = wc.session; wc.getTitle = () => "Fixture";
  const managers = [new GuestTransport(wc, "page"), new BrowserDeveloper(wc), new BrowserPageServices(wc, "unused-scratch"), new BrowserSitePermissions(wc, async () => false)];
  wc.isDestroyed = () => true;
  wc.getURL = () => { throw new TypeError("Object has been destroyed"); };
  for (const key of ["debugger", "session", "id"]) Object.defineProperty(wc, key, { get() { throw new TypeError("Object has been destroyed"); } });
  for (const manager of managers) assert.doesNotThrow(() => manager.close ? manager.close() : manager.dispose());
  assert.equal(session.listenerCount("will-download"), 0);
  assert.equal(session.check(wc, "notifications", "https://example.test", {}), false);
  assert.equal(await managers[3].request("notifications", {}), false);
});

test("inspection remains available after cancelling a mutation with an uncertain outcome", async () => {
  let release; const mutation = new Promise(resolve => { release = resolve; });
  const broker = new BrowserBroker({ evaluate: () => mutation, snapshot: async () => ({ tree: "Current state", snapshotId: "s1" }) });
  const controller = new AbortController();
  const pending = broker.evaluate("await uncertainWork()", { signal: controller.signal });
  await new Promise(resolve => setImmediate(resolve)); controller.abort();
  assert.equal((await pending).code, "BROWSER_POSSIBLY_APPLIED");
  assert.equal((await broker.snapshot()).result.tree, "Current state");
  release();
});

test("console aggregates repeats and filters without growing the result", async () => {
  const wc = contents(); const cdp = new BrowserCdp(); await cdp.attach(wc);
  for (let i = 0; i < 50; i++) wc.debugger.emit("message", {}, "Runtime.consoleAPICalled", { type: "warning", args: [{ value: "Repeated CSP" }] });
  wc.debugger.emit("message", {}, "Runtime.consoleAPICalled", { type: "error", args: [{ value: "Actual problem" }] });
  const result = cdp.console(50); assert.equal(result.length, 2); assert.equal(result[0].count, 50);
  assert.equal(cdp.console(50, { contains: "problem" }).length, 1);
  cdp.console(50, { clear: true }); assert.equal(cdp.console().length, 0); cdp.detach(wc);
});
