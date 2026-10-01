import assert from "node:assert/strict";
import test from "node:test";
import "./browser-test-loader.mjs";
const { BrowserTabsPane } = await import("../electron/main/browser-tabs-pane.ts");
const { BrowserHost } = await import("../electron/main/browser-host.ts");

function fixture() {
  const panes = [];
  const tabs = new BrowserTabsPane(() => {}, onState => {
    let state = null;
    const pane = {
      visible: false,
      bounds: null,
      setWindow() {},
      setBounds(bounds) { this.bounds = bounds; },
      setVisible(visible) { this.visible = visible; },
      dispose() {},
      getWebContents: () => null,
      getState: () => state,
      surfaceStatus: () => ({ attachment: "detached", generation: 1 }),
      async navigateAndWait(url) {
        state = { url, title: url, isLoading: false, canGoBack: false, canGoForward: false };
        onState(state);
        return state;
      },
    };
    panes.push(pane);
    return pane;
  });
  const host = new BrowserHost({ pane: tabs, getFileRoot: async () => null, onState() {} });
  return { host, tabs, panes };
}

test("creating and activating a GUI tab announces only the completed selection", async () => {
  const { host, tabs } = fixture();
  host.activateTab("chat", "website");
  await host.navigate({ url: "https://website.example" }, "chat", "website");
  const events = [];
  tabs.onChanged = sessionId => events.push(host.tabsState(sessionId));
  host.activateTab("chat", "new-tab");
  assert.equal(events.length, 1);
  assert.equal(events[0].activeBrowserId, "new-tab");
  assert.deepEqual(events[0].tabs.map(tab => tab.browserId), ["website", "new-tab"]);
  assert.equal(events[0].tabs[0].state.url, "https://website.example");
  assert.equal(events[0].tabs[1].state, null);
});

test("agent tab creation publishes complete identity and monotonically ordered snapshots", () => {
  const { host, tabs } = fixture();
  const events = [];
  tabs.onChanged = sessionId => events.push(host.tabsState(sessionId));
  const id = tabs.createTab("chat", { openerBrowserId: "opener", disposition: "deliverable" });
  assert.equal(events.length, 1);
  assert.equal(events[0].activeBrowserId, id);
  assert.equal(events[0].tabs[0].disposition, "deliverable");
  assert.equal(events[0].tabs[0].openerBrowserId, "opener");
  const old = events[0];
  host.activateTab("chat", "new-tab");
  const current = host.tabsState("chat");
  assert.ok(current.revision > old.revision);
  assert.equal(host.tabsState("chat").revision, current.revision);
  assert.equal(old.activeBrowserId, id);
});

test("late visible or hidden geometry cannot switch tabs, hide the current guest or recreate a closed tab", async () => {
  const { host, tabs, panes } = fixture();
  host.activateTab("chat", "website");
  await host.navigate({ url: "https://website.example" }, "chat", "website");
  const surface = { sessionId: "chat", browserId: "website", visible: true, bounds: { x: 10, y: 20, width: 700, height: 500 } };
  host.setCoreSurface(surface);
  host.activateTab("chat", "second");
  await host.navigate({ url: "https://second.example" }, "chat", "second");
  assert.equal(panes[1].visible, false, "old geometry cannot attach the newly selected page");
  host.setCoreSurface({ ...surface, browserId: "second" });
  const before = host.tabsState("chat").revision;
  for (let i = 0; i < 50; i++) host.setCoreSurface({ ...surface, visible: i % 2 === 0 });
  assert.equal(host.activeBrowserId(), "second");
  assert.equal(host.tabsState("chat").revision, before);
  assert.equal(panes[0].visible, false);
  assert.equal(panes[1].visible, true);
  host.closeTab("chat", "website");
  host.setCoreSurface(surface);
  assert.equal(tabs.hasTab("chat", "website"), false);
});

test("old-chat geometry cannot change the selected chat or its page", async () => {
  const { host, panes } = fixture();
  host.activateTab("old", "same-id");
  await host.navigate({ url: "https://old.example" }, "old", "same-id");
  host.activateTab("current", "same-id");
  await host.navigate({ url: "https://current.example" }, "current", "same-id");
  const surface = { sessionId: "current", browserId: "same-id", visible: true, bounds: { x: 0, y: 0, width: 500, height: 300 } };
  host.setCoreSurface(surface);
  host.setCoreSurface({ ...surface, sessionId: "old" });
  host.setCoreSurface({ ...surface, sessionId: "old", visible: false });
  assert.equal(host.activeSessionId(), "current");
  assert.equal(panes[1].visible, true);
  assert.equal(host.getState().url, "https://current.example");
});
