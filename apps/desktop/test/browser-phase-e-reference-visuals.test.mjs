import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const css = await readFile(new URL("../src/styles/work-panel.css", import.meta.url), "utf8");
const fixtureManifest = await readFile(new URL("../../../docs/spec/04-ux/ui-phase-a-fixtures.md", import.meta.url), "utf8");
const e2e = await readFile(new URL("../../../docs/spec/06-delivery/04-e2e-test-plan.md", import.meta.url), "utf8");

test("Phase E visual hierarchy matches the reference card language", () => {
  assert.match(css, /browser-header[^}]*min-height: 40px/);
  assert.match(css, /browser-source-row[^}]*min-height: 28px/);
  assert.match(css, /browser-tab-strip[^}]*min-height: 34px/);
  assert.match(css, /browser-toolbar[^}]*min-height: 36px/);
  assert.match(css, /browser-tab\.is-active[^}]*box-shadow/);
  assert.match(css, /browser-toolbar-address[^}]*border-radius: 9px/);
  assert.match(css, /browser-diagnostics-drawer[^}]*backdrop-filter: blur\(12px\)/);
});

test("Phase E keeps reference fixtures and comparison procedure explicit", () => {
  for (const fixture of ["browser-new-tab", "browser-one-tab", "browser-multiple-tabs", "browser-loading", "browser-surface-unavailable", "browser-diagnostics", "browser-narrow", "browser-reduced-motion"]) assert.match(fixtureManifest, new RegExp(fixture));
  for (const reference of ["alpine light.png", "twlight mountains.png", "obsidian black.png", "emerald after glow.png"]) assert.match(e2e, new RegExp(reference.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(e2e, /hierarchy, contrast, opacity, spacing, active\/inactive tab/);
  assert.match(e2e, /guest page pixels remain guest-owned/);
});

test("Phase E protects Browser-only ownership and reduced motion", () => {
  assert.match(css, /prefers-reduced-motion/);
  assert.match(css, /browser-content-viewport/);
  assert.match(css, /browser-new-tab-surface/);
  assert.doesNotMatch(css, /page DOM|guest pixels/i);
});
