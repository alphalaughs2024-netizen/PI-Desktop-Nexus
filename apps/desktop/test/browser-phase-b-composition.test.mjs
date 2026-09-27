import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const core = await readFile(new URL("../src/components/workpanel/BrowserCoreTab.tsx", import.meta.url), "utf8");
const header = await readFile(new URL("../src/components/workpanel/BrowserHeader.tsx", import.meta.url), "utf8");
const source = await readFile(new URL("../src/components/workpanel/BrowserSourceRow.tsx", import.meta.url), "utf8");
const readiness = await readFile(new URL("../src/components/workpanel/BrowserReadinessStrip.tsx", import.meta.url), "utf8");
const empty = await readFile(new URL("../src/components/workpanel/BrowserEmptyState.tsx", import.meta.url), "utf8");
const css = await readFile(new URL("../src/styles/work-panel.css", import.meta.url), "utf8");
const themes = await Promise.all(["twilight-mountains.css", "alpine-light.css", "obsidian-horizon.css", "emerald-afterglow.css"].map((name) => readFile(new URL(`../src/styles/${name}`, import.meta.url), "utf8")));

test("Browser keeps the host Browser row and removes duplicate resource headers", () => {
  assert.doesNotMatch(core, /<BrowserHeader/);
  assert.doesNotMatch(core, /<BrowserSourceRow/);
  assert.match(header, /<h1>Browser<\/h1>/);
  assert.match(header, /Browser options/);
  assert.match(source, /Opened by you/);
  assert.match(source, /Open in default browser/);
  assert.match(css, /\.work-panel-frame:has\(\.browser-core-view\) \.work-panel-frame-header \{ display: none; \}/);
  assert.match(css, /\.work-panel-frame:has\(\.browser-core-view\) \.work-panel-frame-title[^}]*color: var\(--ds-text-muted/);
});

test("Phase B keeps readiness, operation, and alert regions singular", () => {
  assert.equal((core.match(/<BrowserReadinessStrip/g) ?? []).length, 1);
  assert.equal((core.match(/<BrowserOperationStatus/g) ?? []).length, 1);
  assert.equal((core.match(/<BrowserErrorNotice/g) ?? []).length, 1);
  assert.match(readiness, /New tab/);
  assert.match(readiness, /Surface unavailable/);
  assert.match(empty, /The page loaded, but its Browser surface could not be displayed/);
  assert.doesNotMatch(core, /Browser ready/);
});

test("Phase B does not mount the native guest over New Tab or recovery surfaces", () => {
  assert.match(core, /!\[?isNewTab/);
  assert.match(core, /\[\"unavailable\", \"policy-blocked\", \"debugger-unavailable\", \"closed\"\]/);
  assert.match(css, /browser-new-tab-surface/);
});

test("Phase B keeps Browser chrome readable across the four scenic themes", () => {
  for (const theme of themes) {
    for (const token of ["--browser-panel-surface", "--browser-tab-active", "--browser-toolbar-surface", "--browser-address-surface", "--browser-border", "--browser-focus", "--browser-ready", "--browser-loading", "--browser-error", "--browser-text", "--browser-text-muted", "--browser-new-tab-surface"]) {
      assert.match(theme, new RegExp(token));
    }
  }
});
