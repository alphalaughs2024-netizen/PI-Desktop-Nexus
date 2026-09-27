import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const index = await readFile(new URL("../electron/main/index.ts", import.meta.url), "utf8");
const pane = await readFile(new URL("../electron/main/browser-view.ts", import.meta.url), "utf8");
const { resolveBrowserSurfaceReadiness } = await import("../electron/main/browser-surface-readiness.ts");

test("all foreground Browser inspection tools request visible panel activation", () => {
  for (const tool of ["browser_open", "browser_navigate", "browser_list_tabs", "browser_snapshot", "browser_wait", "browser_screenshot"]) assert.match(index, new RegExp(tool));
  assert.match(index, /browserActivationRequested/);
});

test("normal guests verify a capture instead of waiting for an offscreen paint event", () => {
  assert.match(index, /resolveBrowserSurfaceReadiness/);
  assert.match(pane, /this\.probeSurface\(\)/);
  assert.match(pane, /did-finish-load.*this\.verifySurface\(true\)/);
  assert.match(pane, /did-stop-loading.*this\.verifySurface\(\)/);
  assert.match(pane, /SURFACE_CAPTURE_TIMEOUT_MS/);
  assert.doesNotMatch(pane, /wc\.on\("paint"/);
  const surface = { attachment: "attached", visibility: "visible", paint: "unknown" };
  assert.equal(resolveBrowserSurfaceReadiness("ready", surface), "loading");
  assert.equal(resolveBrowserSurfaceReadiness("ready", { ...surface, attachment: "detached" }), "loading");
  assert.equal(resolveBrowserSurfaceReadiness("ready", { ...surface, paint: "painted" }), "ready");
  assert.equal(resolveBrowserSurfaceReadiness("ready", { ...surface, paint: "blank" }), "unavailable");
  assert.equal(resolveBrowserSurfaceReadiness("blocked", surface), "blocked");
  assert.match(index, /navigation\?\.url \? "ready" : navigation\?\.isLoading \? "loading"/);
});
