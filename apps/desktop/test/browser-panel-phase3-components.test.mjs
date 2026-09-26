import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const core = await readFile(new URL("../src/components/workpanel/BrowserCoreTab.tsx", import.meta.url), "utf8");
const guest = await readFile(new URL("../src/components/workpanel/BrowserGuestSurface.tsx", import.meta.url), "utf8");
const toolbar = await readFile(new URL("../src/components/workpanel/BrowserToolbar.tsx", import.meta.url), "utf8");
const styles = await readFile(new URL("../src/styles/work-panel.css", import.meta.url), "utf8");

test("Phase 3 decomposes BrowserCoreTab into resource components", () => {
  for (const name of ["BrowserToolbar", "BrowserReadinessStrip", "BrowserGuestSurface", "BrowserOperationStatus", "BrowserErrorNotice", "BrowserEmptyState", "BrowserDiagnosticsDrawer"]) assert.match(core, new RegExp(name));
  assert.match(toolbar, /presentation/);
  assert.doesNotMatch(core, /ResizeObserver|browserCoreSurfaceSet/);
});

test("Phase 3 guest surface owns bounded coalesced reporting", () => {
  assert.match(guest, /ResizeObserver/);
  assert.match(guest, /requestAnimationFrame/);
  assert.match(guest, /browserCoreSurfaceSet/);
  assert.match(guest, /width <= 0|width: rect\.width/);
  assert.match(guest, /visible: false/);
  assert.doesNotMatch(guest, /from "electron"|BrowserHost|BrowserCdp|WebContents/);
});

test("Phase 3 establishes stable status/error surfaces and semantic styles", () => {
  assert.match(core, /BrowserOperationStatus/);
  assert.match(core, /BrowserErrorNotice/);
  for (const cls of ["browser-core-view", "browser-toolbar", "browser-readiness-strip", "browser-operation-status", "browser-error-notice", "browser-empty-state", "browser-guest-surface", "browser-diagnostics-drawer"]) assert.match(styles, new RegExp(`\\.${cls}`));
});
