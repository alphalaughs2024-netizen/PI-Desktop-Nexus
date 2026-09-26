import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const workPanel = await readFile(new URL("../src/components/workpanel/WorkPanel.tsx", import.meta.url), "utf8");
const tabs = await readFile(new URL("../src/lib/work-panel-tabs.ts", import.meta.url), "utf8");

test("Phase 1 exposes Browser from the native Work Panel menu", () => {
  assert.match(workPanel, /const openBrowser = useCallback/);
  assert.match(workPanel, /ensureSession\(\)/);
  assert.match(workPanel, /CORE_BROWSER_TAB/);
  assert.match(workPanel, /candidate\.id === CORE_BROWSER_TAB\.id/);
  assert.match(workPanel, /activeTab\?\.kind === "browser"/);
  assert.match(workPanel, /role="menuitemradio"[\s\S]*t\("panel\.tabs\.browser"\)/);
  assert.doesNotMatch(workPanel, /openBrowser[\s\S]{0,500}pluginViewOpen/);
});

test("Phase 1 exposes Browser in the empty Work Panel independently of plugins", () => {
  assert.match(workPanel, /data-work-panel-browser/);
  assert.match(workPanel, /openBrowser\(\)/);
  assert.match(workPanel, /className="work-panel-empty-tools"[\s\S]*data-work-panel-browser/);
});

test("Phase 1 keeps Browser identity canonical and classifies it as a core tool", () => {
  assert.match(tabs, /CORE_BROWSER_TAB: WorkPanelTab/);
  assert.match(tabs, /resource: "core:\/\/browser"/);
  assert.match(tabs, /tab\.kind === "browser"/);
  assert.match(tabs, /browserWorkPanelTab/);
});
