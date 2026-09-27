import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const css = await readFile(new URL("../src/styles/work-panel.css", import.meta.url), "utf8");
const core = await readFile(new URL("../src/components/workpanel/BrowserCoreTab.tsx", import.meta.url), "utf8");
const newTab = await readFile(new URL("../src/components/workpanel/BrowserNewTabSurface.tsx", import.meta.url), "utf8");

test("Browser address focus is owned by the rounded field", () => {
  assert.match(css, /\.browser-toolbar-address:focus-within\s*\{/);
  assert.match(css, /\.browser-toolbar-address input:focus-visible\s*\{\s*outline:\s*none/);
  assert.doesNotMatch(css, /\.browser-toolbar input:focus-visible\s*\{/);
});

test("New Tab controls have distinct actions and no redundant status gap", () => {
  assert.match(newTab, /onClick=\{onFocusAddress\}/);
  assert.match(newTab, /onClick=\{onSearchWeb\}/);
  assert.match(newTab, /onClick=\{onNewTab\}/);
  assert.match(core, /onSearchWeb=\{\(\) => void navigateToAddress\("https:\/\/www\.google\.com\/"\)\}/);
  assert.match(css, /\.browser-operation-status:empty\s*\{\s*display:\s*none/);
  assert.match(css, /\.browser-core-view--new-tab \.browser-readiness-strip--no-page\s*\{\s*display:\s*none/);
});
