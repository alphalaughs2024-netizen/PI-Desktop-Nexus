import assert from "node:assert/strict";
import test from "node:test";
import { BrowserHost } from "../electron/main/browser-host.ts";
import { BrowserTabsPane } from "../electron/main/browser-tabs-pane.ts";

test("closing the final tab clears the session URL before Browser reopens", () => {
  let rootLookups = 0;
  const tabs = new BrowserTabsPane(() => {}, () => ({
    setWindow() {}, setBounds() {}, setVisible() {}, dispose() {},
    getState() { return null; }, getWebContents() { return null; },
    surfaceStatus() { return { attachment: "detached", visibility: "hidden", paint: "unknown", generation: 0 }; },
  }));
  const host = new BrowserHost({
    pane: tabs,
    getFileRoot: async () => { rootLookups += 1; return null; },
    onState() {},
  });
  tabs.activate("session-a", "browser-core-1");
  host.rememberLocation("session-a", "https://old.example");
  host.closeTab("session-a", "browser-core-1");
  host.setChromeSession("session-a");
  assert.equal(rootLookups, 0);
  assert.equal(host.activateTab("session-a", "browser-core-1"), null);
});
