import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const toolbar = await readFile(new URL("../src/components/workpanel/BrowserToolbar.tsx", import.meta.url), "utf8");
const core = await readFile(new URL("../src/components/workpanel/BrowserCoreTab.tsx", import.meta.url), "utf8");
const styles = await readFile(new URL("../src/styles/work-panel.css", import.meta.url), "utf8");

test("Phase 4 toolbar exposes essential controls and address behavior", () => {
  for (const label of ["Go back", "Go forward", "Reload page", "Stop loading", "Browser address", "Capture screenshot", "Open in default browser"]) assert.match(toolbar, new RegExp(label));
  assert.match(toolbar, /type="url"/);
  assert.match(toolbar, /spellCheck=\{false\}/);
  assert.match(toolbar, /autoCorrect="off"/);
  assert.match(toolbar, /autoCapitalize="off"/);
  assert.match(toolbar, /browserAction|onAction/);
  assert.match(toolbar, /browserNavigate|onNavigate/);
  assert.match(toolbar, /browserScreenshot|onScreenshot/);
  assert.doesNotMatch(toolbar, /from "electron"|BrowserHost|BrowserCdp|window\.open/);
  assert.match(core, /BrowserToolbar/);
  assert.match(styles, /browser-toolbar-address/);
});

test("Phase 4 keeps docked and maximized toolbar density distinct", () => {
  assert.match(toolbar, /browser-toolbar--\$\{presentation\}/);
  assert.match(styles, /browser-toolbar--maximized/);
  assert.match(styles, /browser-toolbar-actions/);
  assert.match(styles, /browser-toolbar-overflow/);
});
