import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const index = await readFile(new URL("../electron/main/index.ts", import.meta.url), "utf8");
const pane = await readFile(new URL("../electron/main/browser-view.ts", import.meta.url), "utf8");
const api = await readFile(new URL("../src/lib/api.ts", import.meta.url), "utf8");
const host = await readFile(new URL("../src/components/workpanel/WorkPanelResourceHost.tsx", import.meta.url), "utf8");

test("Browser commands request foreground panel activation and preserve structured results", () => {
  assert.match(index, /browserActivationRequested/);
  assert.match(index, /descriptor\.name/);
  assert.match(index, /details: result/);
  assert.match(api, /onBrowserActivationRequested/);
});

test("BrowserPane exposes attachment lifecycle and reattaches visible guests", () => {
  assert.match(pane, /surfaceStatus/);
  assert.match(pane, /this\.attached/);
  assert.match(pane, /if \(this\.window && this\.visible && this\.view\) this\.attach\(\)/);
  assert.match(pane, /did-fail-load/);
  assert.match(pane, /render-process-gone/);
});

test("inactive resources are not treated as shell transitions", () => {
  assert.match(host, /blocked: blocked && active/);
  assert.match(host, /transitioning/);
  assert.match(host, /aria-hidden/);
});
