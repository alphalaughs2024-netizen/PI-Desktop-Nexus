import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const base = await readFile(new URL("../src/styles/base.css", import.meta.url), "utf8");
const workPanel = await readFile(new URL("../src/styles/work-panel.css", import.meta.url), "utf8");
const core = await readFile(new URL("../src/components/workpanel/BrowserCoreTab.tsx", import.meta.url), "utf8");
const tabs = await readFile(new URL("../src/components/workpanel/BrowserTabStrip.tsx", import.meta.url), "utf8");

test("Phase A defines shared shell and Browser semantic tokens", () => {
  for (const token of ["--shell-titlebar-height", "--shell-content-gutter", "--shell-panel-gap", "--shell-control-height", "--shell-surface-radius", "--shell-focus-ring"]) assert.match(base, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  for (const token of ["--browser-panel-surface", "--browser-tab-active", "--browser-tab-inactive", "--browser-toolbar-surface", "--browser-address-surface", "--browser-focus", "--browser-new-tab-surface"]) assert.match(workPanel, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});

test("Phase A keeps Browser ownership boundaries explicit", () => {
  assert.match(core, /BrowserGuestSurface/);
  assert.match(core, /BrowserDiagnosticsDrawer/);
  assert.match(tabs, /role="tablist"/);
  assert.match(tabs, /role="tab"/);
  assert.match(core, /browser-new-tab-state|New tab/);
});
