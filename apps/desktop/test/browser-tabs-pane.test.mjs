import assert from "node:assert/strict";
import test from "node:test";
import { BrowserTabsPane } from "../electron/main/browser-tabs-pane.ts";

function fakePane(onState) {
  let state = null;
  let visible = false;
  let disposed = false;
  return {
    setWindow() {}, setBounds() {},
    setVisible(value) { visible = value; },
    surfaceStatus() { return { attachment: visible && state ? "attached" : "detached", visibility: visible ? "visible" : "hidden", paint: "painted", capture: "nonempty", childOrder: "topmost", generation: 1 }; },
    getState() { return state; },
    getWebContents() { return null; },
    async navigateAndWait(url) { state = { url, title: url, isLoading: false, canGoBack: false, canGoForward: false }; onState(state); return state; },
    action() {}, dispose() { disposed = true; },
    get visible() { return visible; }, get disposed() { return disposed; },
  };
}

test("Browser tabs retain distinct pages and only the selected guest is visible", async () => {
  const created = [];
  const events = [];
  const tabs = new BrowserTabsPane((state) => events.push(state.url), (onState) => {
    const pane = fakePane(onState);
    created.push(pane);
    return pane;
  });
  tabs.activate("session-a", "tab-a");
  tabs.setVisible(true);
  await tabs.navigateTabAndWait("session-a", "tab-a", "https://a.example", null);
  tabs.activate("session-a", "tab-b");
  await tabs.navigateTabAndWait("session-a", "tab-b", "https://b.example", null);
  await tabs.navigateTabAndWait("session-a", "tab-a", "https://a.example/next", null);
  assert.equal(tabs.getState().url, "https://b.example");
  assert.equal(created[1].visible, false);
  assert.equal(created[2].visible, true);
  tabs.activate("session-a", "tab-a");
  assert.equal(tabs.getState().url, "https://a.example/next");
  assert.deepEqual(events, ["https://a.example", "https://b.example"]);
  tabs.close("session-a", "tab-b");
  assert.equal(created[2].disposed, true);
  assert.equal(tabs.listTabs().filter((tab) => tab.sessionId === "session-a").length, 1);
});

test("same tab ID in another conversation has a separate guest", async () => {
  const tabs = new BrowserTabsPane(() => {}, fakePane);
  tabs.activate("session-a", "browser-core-1");
  await tabs.navigateTabAndWait("session-a", "browser-core-1", "https://a.example", null);
  tabs.activate("session-b", "browser-core-1");
  await tabs.navigateTabAndWait("session-b", "browser-core-1", "https://b.example", null);
  tabs.activateSession("session-a");
  assert.equal(tabs.getState().url, "https://a.example");
});
