import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const core = await readFile(new URL("../src/components/workpanel/BrowserCoreTab.tsx", import.meta.url), "utf8");
const strip = await readFile(new URL("../src/components/workpanel/BrowserTabStrip.tsx", import.meta.url), "utf8");
const tabs = await readFile(new URL("../src/lib/browser-tabs.ts", import.meta.url), "utf8");
const guest = await readFile(new URL("../src/components/workpanel/BrowserGuestSurface.tsx", import.meta.url), "utf8");

test("Browser workspace exposes real tab controls and per-tab state", () => {
  assert.match(core, /newBrowserTab/);
  assert.match(core, /closeBrowserTab/);
  assert.match(core, /activateBrowserTab/);
  assert.match(core, /browserTabs/);
  assert.match(core, /browserTabActivate/);
  assert.match(core, /browserTabClose/);
  assert.doesNotMatch(core, /navigateToAddress\(tab\.url\)/);
  assert.match(guest, /browserId/);
  assert.match(strip, /role=\"tablist\"/);
  assert.match(strip, /New Browser tab/);
  assert.match(strip, /Close/);
  assert.match(tabs, /BrowserTabsContext/);
});
