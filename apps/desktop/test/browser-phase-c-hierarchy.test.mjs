import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const core = await readFile(new URL("../src/components/workpanel/BrowserCoreTab.tsx", import.meta.url), "utf8");
const header = await readFile(new URL("../src/components/workpanel/BrowserHeader.tsx", import.meta.url), "utf8");
const tabs = await readFile(new URL("../src/components/workpanel/BrowserTabStrip.tsx", import.meta.url), "utf8");
const toolbar = await readFile(new URL("../src/components/workpanel/BrowserToolbar.tsx", import.meta.url), "utf8");
const css = await readFile(new URL("../src/styles/work-panel.css", import.meta.url), "utf8");

test("Browser header menu is not duplicated in the compact resource composition", () => {
  assert.doesNotMatch(core, /<BrowserHeader/);
  assert.match(header, /role="menu"/);
  for (const action of ["Open Browser diagnostics", "Retry Browser", "Reopen Browser", "Copy safe address", "Open in default browser"]) assert.match(header, new RegExp(action));
  for (const key of ["ArrowDown", "ArrowUp", "Home", "End", "Escape"]) assert.match(header, new RegExp(key));
  assert.match(header, /triggerRef\.current\?\.focus/);
});

test("Phase C adds complete Browser tab focus and cycling behavior", () => {
  for (const key of ["ArrowRight", "ArrowLeft", "Home", "End", "Enter", " ", "ctrlKey", "metaKey", "Tab"]) assert.match(tabs, new RegExp(key));
  assert.match(tabs, /data-browser-tab/);
  assert.match(tabs, /onClose\(tab\.browserId\)/);
  assert.match(tabs, /focusTab\(next\.browserId\)/);
});

test("Phase C keeps toolbar slots stable and secondary actions in overflow", () => {
  assert.doesNotMatch(toolbar, /presentation === "maximized" && <button/);
  for (const slot of ["Go back", "Go forward", "Reload page", "Stop loading", "Browser address", "More Browser actions"]) assert.match(toolbar, new RegExp(slot));
  assert.match(toolbar, /Capture screenshot/);
  assert.match(css, /browser-toolbar--maximized/);
  assert.match(css, /browser-header-menu-panel/);
  assert.match(css, /browser-focus/);
});

test("Phase C preserves singular status/alert regions and guest safety", () => {
  assert.equal((core.match(/<BrowserReadinessStrip/g) ?? []).length, 1);
  assert.equal((core.match(/<BrowserOperationStatus/g) ?? []).length, 1);
  assert.equal((core.match(/<BrowserErrorNotice/g) ?? []).length, 1);
  assert.match(core, /!isNewTab && !\["unavailable", "policy-blocked", "debugger-unavailable", "closed"\]/);
  assert.doesNotMatch(core, /Browser ready/);
});
