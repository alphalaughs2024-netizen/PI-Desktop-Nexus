import assert from "node:assert/strict";
import test from "node:test";
import { BrowserHost } from "../electron/main/browser-host.ts";
import { BrowserTabsPane } from "../electron/main/browser-tabs-pane.ts";
import { BrowserBroker } from "../electron/main/browser-broker.ts";
import { createBrowserTypedTools } from "../electron/main/browser-typed-tools.ts";

function fixture() {
  const panes = [];
  const tabs = new BrowserTabsPane(() => {}, (onState) => {
    let state = null;
    const pane = {
      setWindow() {}, setBounds() {}, setVisible() {}, dispose() {},
      surfaceStatus: () => ({ attachment: "detached", generation: 0 }),
      getState: () => state, getWebContents: () => null,
      async navigateAndWait(url) {
        state = { url, title: url, isLoading: false, canGoBack: false, canGoForward: false };
        onState(state); return state;
      }, action() {},
    };
    panes.push(pane); return pane;
  });
  const host = new BrowserHost({ pane: tabs, getFileRoot: async () => null, onState() {} });
  const broker = new BrowserBroker(host);
  return { tabs, host, broker, panes };
}

test("a first tool call creates an owned blank tab without selecting another chat", async () => {
  const { tabs, host, broker } = fixture();
  host.activateTab("visible", "visible-tab");
  const result = await broker.open(undefined, { sessionId: "background" });
  assert.equal(result.ok, true);
  assert.equal(result.result.url, "about:blank");
  assert.equal(host.activeSessionId(), "visible");
  assert.equal(host.activeBrowserId(), "visible-tab");
  assert.equal(broker.listTabs("background").length, 1);
  assert.equal(broker.listTabs("background")[0].ownerSessionId, "background");
  assert.equal(tabs.getState(), null);
});

test("implicit tools use the calling chat's selected retained tab", async () => {
  const { host, broker } = fixture();
  host.activateTab("a", "tab-a");
  host.activateTab("b", "tab-b");
  await broker.navigate({ url: "https://a.example" }, "a");
  await broker.navigate({ url: "https://b.example" }, "b");
  assert.equal(host.getState().url, "https://b.example");
  assert.equal(host.getState({ sessionId: "a", browserId: "tab-a" }).url, "https://a.example");
});

test("explicit nonexistent or closed tab IDs fail and are never recreated", async () => {
  const { host, broker } = fixture();
  assert.equal((await broker.navigate({ url: "https://example.com" }, "a", { browserId: "missing" })).code, "BROWSER_TAB_NOT_FOUND");
  host.activateTab("a", "tab-a"); host.closeTab("a", "tab-a");
  assert.equal((await broker.snapshot({ sessionId: "a", browserId: "tab-a" })).code, "BROWSER_TAB_NOT_FOUND");
  assert.equal(host.hasTab("a", "tab-a"), false);
});

test("successful navigation cannot contain a null guest state", async () => {
  const broker = new BrowserBroker({ navigate: async () => null });
  const result = await broker.open({ url: "about:blank" }, { sessionId: "a" });
  assert.equal(result.ok, false); assert.equal(result.code, "BROWSER_UNAVAILABLE");
});

test("navigation failures reach the caller instead of becoming success", async () => {
  const broker = new BrowserBroker({ navigate: async () => { throw new Error("ERR_CONNECTION_REFUSED"); } });
  const result = await broker.navigate({ url: "https://example.com" }, "a");
  assert.equal(result.ok, false); assert.match(result.message, /ERR_CONNECTION_REFUSED/);
});

test("inspection works on an explicit retained tab without GUI selection", async () => {
  let received;
  const broker = new BrowserBroker({ activeBrowserId: () => "visible", snapshot: async (target) => { received = target; return { tree: "page", url: "https://hidden.example", title: "Hidden" }; } });
  const result = await broker.snapshot({ sessionId: "a", browserId: "hidden" });
  assert.equal(result.ok, true); assert.deepEqual(received, { sessionId: "a", browserId: "hidden" });
});

test("snapshot refs are scoped to session as well as browser ID", async () => {
  const calls = [];
  const broker = new BrowserBroker({ snapshot: async (target) => ({ tree: "page", url: "https://example.com", title: target.sessionId, snapshotId: "snapshot-1" }), click: async (_uid, target) => calls.push(target) });
  await broker.snapshot({ sessionId: "a", browserId: "same" });
  await broker.snapshot({ sessionId: "b", browserId: "same" });
  assert.equal((await broker.click("e1", { sessionId: "a", browserId: "same", snapshotId: "snapshot-1" })).ok, true);
  assert.equal((await broker.click("e1", { sessionId: "c", browserId: "same", snapshotId: "snapshot-1" })).code, "BROWSER_STALE_REF");
  assert.deepEqual(calls, [{ sessionId: "a", browserId: "same" }]);
});

test("navigation invalidates refs only for the target tab", async () => {
  const broker = new BrowserBroker({ snapshot: async () => ({ tree: "", url: "", title: "", snapshotId: "snapshot-1" }), navigate: async () => ({ url: "https://next.example" }), click: async () => {} });
  await broker.snapshot({ sessionId: "a", browserId: "one" });
  await broker.snapshot({ sessionId: "a", browserId: "two" });
  await broker.navigate({ url: "https://next.example" }, "a", { browserId: "two" });
  assert.equal((await broker.click("e1", { sessionId: "a", browserId: "one", snapshotId: "snapshot-1" })).ok, true);
  assert.equal((await broker.click("e1", { sessionId: "a", browserId: "two", snapshotId: "snapshot-1" })).code, "BROWSER_STALE_REF");
});

test("wait reads the calling tab even if another page is visible", async () => {
  let received;
  const broker = new BrowserBroker({ getState: (target) => { received = target; return { url: "https://a.example", isLoading: false }; }, snapshot: async () => ({ tree: "", url: "https://a.example", title: "A" }) });
  const result = await broker.wait({ kind: "url", match: "equals", value: "https://a.example" }, { sessionId: "a", browserId: "tab-a" }, 500);
  assert.equal(result.ok, true); assert.deepEqual(received, { sessionId: "a", browserId: "tab-a" });
});

test("tab listing returns only the requesting session's retained tabs", async () => {
  const { host, broker } = fixture();
  host.activateTab("a", "one"); host.activateTab("b", "two");
  const tool = createBrowserTypedTools(broker).find(t => t.name === "browser_list_tabs");
  const result = await tool.execute({}, { sessionId: "a", mode: "agent" });
  assert.equal(result.tabs.every(t => t.ownerSessionId === "a"), true);
  assert.equal(result.tabs.some(t => t.browserId === "one"), true);
  assert.equal(result.tabs.some(t => t.browserId === "two"), false);
});

test("the capability and Plan gates run before implicit tab creation", async () => {
  const { host, tabs } = fixture();
  const blocked = new BrowserBroker(host, () => false);
  assert.equal((await blocked.open(undefined, { sessionId: "a" })).code, "BROWSER_POLICY_BLOCKED");
  const broker = new BrowserBroker(host);
  assert.equal((await broker.evaluate("1", { sessionId: "a", mode: "plan" })).code, "BROWSER_POLICY_BLOCKED");
  assert.equal(tabs.listTabs().length, 0);
});

test("an admitted target cannot silently bind to a reopened tab", async () => {
  const { host, broker, tabs } = fixture();
  host.activateTab("a", "one");
  const target = host.resolveTarget("a", "one");
  host.closeTab("a", "one"); host.activateTab("a", "one");
  assert.throws(() => host.getState(target), /replaced/);
  await assert.rejects(host.navigate({ url: "https://wrong.example" }, "a", "one", target), /replaced/);
  assert.equal(tabs.getState(), null);
});

test("inspection activation preserves the selected session page's actual URL", async () => {
  const { host, broker } = fixture();
  host.activateTab("a", "one"); await broker.navigate({ url: "https://one.example" }, "a");
  host.activateTab("a", "two"); await broker.navigate({ url: "https://two.example" }, "a");
  host.activateTab("b", "other"); await broker.navigate({ url: "https://other.example" }, "b");
  await broker.navigate({ url: "https://one.example/next" }, "a", { browserId: "one" });
  assert.equal(host.stateForSession("a").url, "https://two.example");
  assert.equal(host.stateForSession("b").url, "https://other.example");
  assert.equal(host.stateForSession("unknown"), null);
});

test("guest disposal releases the render host and allows a fresh browser", async () => {
  const { host, broker, tabs, panes } = fixture();
  await broker.open(undefined, { sessionId: "a" });
  let pageClosed = false;
  let renderHostClosed = false;
  panes[0].dispose = () => { pageClosed = true; };
  const renderHost = host.renderHost;
  renderHost.dispose = () => { renderHostClosed = true; };

  host.disposeGuest();

  assert.equal(pageClosed, true);
  assert.equal(renderHostClosed, true);
  assert.equal(tabs.listTabs().length, 0);
  assert.notEqual(host.renderHost, renderHost);
  const reopened = await broker.open(undefined, { sessionId: "a" });
  assert.equal(reopened.ok, true);
  assert.equal(reopened.result.url, "about:blank");
  assert.equal(panes.length, 2);
});
