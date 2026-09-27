import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const tabs = await readFile(new URL("../src/components/workpanel/BrowserTabStrip.tsx", import.meta.url), "utf8");
const core = await readFile(new URL("../src/components/workpanel/BrowserCoreTab.tsx", import.meta.url), "utf8");
const css = await readFile(new URL("../src/styles/work-panel.css", import.meta.url), "utf8");
const phaseF = await readFile(new URL("../../../docs/spec/04-ux/ui-phase-f-browser-interaction-polish.md", import.meta.url), "utf8");

test("Phase F owns a safe keyboard-accessible tab context menu", () => {
  assert.match(tabs, /role="menu"/);
  for (const action of ["New tab", "Reload tab", "Duplicate tab", "Close tab", "Close other tabs"]) assert.match(tabs, new RegExp(action));
  for (const key of ["ContextMenu", "F10", "ArrowDown", "ArrowUp", "Home", "End", "Escape"]) assert.match(tabs, new RegExp(key));
  assert.match(tabs, /aria-haspopup="menu"/);
  assert.match(tabs, /contextOriginRef/);
  assert.doesNotMatch(tabs, /sessionId|guestGeneration|WebContents|CDP/);
});

test("Phase F preserves Browser shortcuts and renderer callback ownership", () => {
  for (const key of ["ctrlKey", "metaKey", "toLowerCase", "event.key === \"Tab\""]) assert.match(tabs, new RegExp(key));
  for (const callback of ["onReload", "onDuplicate", "onCloseOthers"]) assert.match(core, new RegExp(callback));
  assert.doesNotMatch(core, /from "\.\/Browser(?:Host|Pane|Broker|Cdp)"/);
});

test("Phase F keeps narrow overflow, focus rings, motion, and live regions stable", () => {
  assert.match(css, /browser-tab-context-menu[^}]*position: fixed/);
  assert.match(css, /browser-tab-context-menu[^}]*max-height/);
  assert.match(css, /browser-tab-context-menu[^}]*overflow-y: auto/);
  assert.match(css, /browser-tab-context-menu button:disabled/);
  assert.match(css, /prefers-reduced-motion/);
  assert.equal((core.match(/<BrowserOperationStatus/g) ?? []).length, 1);
  assert.equal((core.match(/<BrowserErrorNotice/g) ?? []).length, 1);
  assert.match(phaseF, /focus restoration/);
  assert.match(phaseF, /Reduced[\s-]*motion|reduced[\s-]*motion/i);
});
