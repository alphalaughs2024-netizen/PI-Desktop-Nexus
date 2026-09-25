import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
const tabs = await readFile(new URL("../src/lib/work-panel-tabs.ts", import.meta.url), "utf8");
const workPanel = await readFile(new URL("../src/components/workpanel/WorkPanel.tsx", import.meta.url), "utf8");
const app = await readFile(new URL("../src/App.tsx", import.meta.url), "utf8");
const core = await readFile(new URL("../src/components/workpanel/BrowserCoreTab.tsx", import.meta.url), "utf8");
test("Phase 6 resolves Browser through a core view", () => {
  assert.match(tabs, /kind: "browser", resource: "core:\/\/browser"/);
  assert.match(workPanel, /activeTab\?\.kind === "browser"/);
  assert.match(workPanel, /<BrowserCoreTab/);
  assert.match(app, /CORE_BROWSER_TAB/);
});
test("Phase 6 exposes readiness states in the core Browser panel", () => {
  for (const state of ["ready", "loading", "unavailable", "starting"]) assert.match(core, new RegExp(state));
  assert.match(core, /role="status"/);
});
