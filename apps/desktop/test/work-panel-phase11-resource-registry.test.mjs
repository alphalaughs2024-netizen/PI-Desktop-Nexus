import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const host = await readFile(new URL("../src/components/workpanel/WorkPanelResourceHost.tsx", import.meta.url), "utf8");
const panel = await readFile(new URL("../src/components/workpanel/WorkPanel.tsx", import.meta.url), "utf8");
const tabs = await readFile(new URL("../src/lib/work-panel-tabs.ts", import.meta.url), "utf8");

test("Phase 11 defines one resource registry for every Work Panel kind", () => {
  assert.match(host, /WORK_PANEL_RESOURCE_REGISTRY/);
  for (const kind of ["browser", "file", "review", "contextVault", "promptInspector", "plugin"]) assert.match(host, new RegExp(`kind: \"${kind}\"`));
  assert.match(host, /activeTabId/);
  assert.match(host, /is-hidden/);
  assert.match(host, /aria-hidden/);
  assert.match(host, /inert/);
  assert.match(panel, /WorkPanelResourceHost/);
  assert.match(panel, /WorkPanelResourceHost/);
});

test("Phase 11 preserves the canonical Browser identity", () => {
  assert.match(tabs, /CORE_BROWSER_TAB: WorkPanelTab = \{ id: "browser", kind: "browser", resource: "core:\/\/browser" \}/);
});
