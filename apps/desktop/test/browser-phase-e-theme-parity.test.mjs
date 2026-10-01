import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const themeNames = ["alpine-light.css", "twilight-mountains.css", "obsidian-horizon.css", "emerald-afterglow.css"];
const tokens = ["--browser-panel-surface", "--browser-panel-surface-raised", "--browser-tab-active", "--browser-tab-inactive", "--browser-tab-hover", "--browser-toolbar-surface", "--browser-address-surface", "--browser-border", "--browser-focus", "--browser-ready", "--browser-loading", "--browser-error", "--browser-text", "--browser-text-muted", "--browser-new-tab-surface"];
const themes = await Promise.all(themeNames.map(async (name) => [name, await readFile(new URL(`../src/styles/${name}`, import.meta.url), "utf8")]));
const browserCss = await readFile(new URL("../src/styles/work-panel.css", import.meta.url), "utf8");
const core = await readFile(new URL("../src/components/workpanel/BrowserCoreTab.tsx", import.meta.url), "utf8");
const diagnostics = await readFile(new URL("../src/components/workpanel/BrowserDiagnosticsDrawer.tsx", import.meta.url), "utf8");

test("Phase E gives every scenic theme one authoritative Browser token mapping", () => {
  for (const [name, css] of themes) for (const token of tokens) assert.equal((css.match(new RegExp(`${token}\\s*:`, "g")) ?? []).length, 1, `${name} must define ${token} once`);
});

test("Phase E Browser chrome uses semantic tokens for state, controls, and diagnostics", () => {
  for (const token of ["browser-text", "browser-text-muted", "browser-border", "browser-focus", "browser-ready", "browser-loading", "browser-error", "browser-panel-surface-raised"]) assert.match(browserCss, new RegExp(`var\\(--${token}`));
  assert.match(browserCss, /browser-toolbar button[^}]*ds-text-secondary/);
  assert.match(browserCss, /browser-diagnostics-row[^}]*browser-border/);
  assert.match(browserCss, /browser-header-readiness--ready[^}]*browser-ready/);
  assert.match(browserCss, /browser-inspection-error[^}]*browser-error/);
  assert.match(browserCss, /prefers-reduced-motion/);
  assert.match(core, /BrowserNewTabSurface/);
  assert.doesNotMatch(diagnostics, /WebContents|CDP target|cookie|credential|filesystem path/i);
});

test("Phase E preserves guest ownership and stable Browser live regions", () => {
  assert.match(core, /isBrowserGuestSurfaceVisible/);
  assert.equal((core.match(/<BrowserOperationStatus/g) ?? []).length, 1);
  assert.equal((core.match(/<BrowserErrorNotice/g) ?? []).length, 1);
  assert.match(browserCss, /browser-content-viewport/);
  assert.match(browserCss, /browser-new-tab-surface/);
});
