import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const geometry = await readFile(new URL("../electron/main/browser-surface-geometry.ts", import.meta.url), "utf8");
const pane = await readFile(new URL("../electron/main/browser-view.ts", import.meta.url), "utf8");
const guest = await readFile(new URL("../src/components/workpanel/BrowserGuestSurface.tsx", import.meta.url), "utf8");

test("native compositing has an explicit CSS measurement and conversion contract", () => {
  assert.match(geometry, /renderer-viewport-css/);
  assert.match(geometry, /scaleFactor/);
  assert.match(geometry, /contentBounds/);
  assert.match(geometry, /reason: "empty"/);
  assert.match(guest, /createBrowserSurfaceMeasurement/);
  assert.match(guest, /measurement/);
});

test("BrowserPane exposes topmost ordering and capture diagnostics", () => {
  assert.match(pane, /childOrder/);
  assert.match(pane, /capturePage/);
  assert.match(pane, /toPNG\(\)/);
  assert.match(pane, /topmost/);
  assert.match(pane, /probeSurface/);
});
