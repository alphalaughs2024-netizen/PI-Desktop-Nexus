import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const core = await readFile(new URL("../src/components/workpanel/BrowserCoreTab.tsx", import.meta.url), "utf8");
const presentation = await readFile(new URL("../src/components/workpanel/browser-presentation-state.ts", import.meta.url), "utf8");
const newTab = await readFile(new URL("../src/components/workpanel/BrowserNewTabSurface.tsx", import.meta.url), "utf8");
const empty = await readFile(new URL("../src/components/workpanel/BrowserEmptyState.tsx", import.meta.url), "utf8");
const diagnostics = await readFile(new URL("../src/components/workpanel/BrowserDiagnosticsDrawer.tsx", import.meta.url), "utf8");
const css = await readFile(new URL("../src/styles/work-panel.css", import.meta.url), "utf8");

test("Phase D centralizes Browser presentation states and guest eligibility", () => {
  for (const state of ["no-page", "starting", "ready", "loading", "unavailable", "policy-blocked", "debugger-unavailable", "closed"]) assert.match(presentation, new RegExp(state));
  assert.match(core, /mapBrowserState/);
  assert.match(core, /isBrowserGuestSurfaceVisible/);
  assert.match(presentation, /state === "ready" \|\| state === "loading"/);
});

test("Phase D makes New Tab an explicit opaque address-focused surface", () => {
  assert.match(core, /<BrowserNewTabSurface/);
  assert.match(newTab, /New tab/);
  assert.match(newTab, /Enter a URL to browse/);
  assert.match(newTab, /Focus address bar/);
  assert.match(core, /focusAddress\(true\)/);
  assert.match(core, /address\?\.select\(\)/);
  assert.match(css, /browser-content-viewport/);
  assert.match(css, /browser-new-tab-surface/);
});

test("Phase D gives recovery states dedicated safe content and actions", () => {
  for (const copy of ["Starting Browser…", "Surface unavailable", "The page loaded, but its Browser surface could not be displayed.", "Policy blocked", "Debugger unavailable", "Browser closed", "Retry", "Diagnostics", "Reopen Browser"]) assert.match(empty, new RegExp(copy));
  assert.match(empty, /data-browser-surface/);
  assert.match(core, /isBrowserRecoveryState/);
});

test("Phase D keeps live regions, diagnostics, and motion contracts stable", () => {
  assert.equal((core.match(/<BrowserReadinessStrip/g) ?? []).length, 1);
  assert.equal((core.match(/<BrowserOperationStatus/g) ?? []).length, 1);
  assert.equal((core.match(/<BrowserErrorNotice/g) ?? []).length, 1);
  assert.match(diagnostics, /aria-hidden="true"/);
  assert.doesNotMatch(diagnostics, /WebContents|CDP target|cookie|credential|filesystem path/i);
  assert.match(css, /browser-operation-status[^}]*flex: 0 0 20px/);
  assert.match(css, /prefers-reduced-motion/);
  assert.doesNotMatch(core, /Browser ready/);
});
