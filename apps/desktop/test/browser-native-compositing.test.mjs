import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const geometry = await readFile(new URL("../electron/main/browser-surface-geometry.ts", import.meta.url), "utf8");
const pane = await readFile(new URL("../electron/main/browser-view.ts", import.meta.url), "utf8");
const guest = await readFile(new URL("../src/components/workpanel/BrowserGuestSurface.tsx", import.meta.url), "utf8");
const { convertBrowserSurfaceMeasurement } = await import("../electron/main/browser-surface-geometry.ts");

test("native compositing has an explicit CSS measurement and conversion contract", () => {
  assert.match(geometry, /renderer-viewport-css/);
  assert.match(geometry, /contentBounds/);
  assert.match(geometry, /reason: "empty"/);
  assert.match(guest, /createBrowserSurfaceMeasurement/);
  assert.match(guest, /measurement/);
});

test("native guest bounds stay in local CSS pixels at 125% display scaling", () => {
  const contentBounds = { x: 120, y: 80, width: 1228, height: 690 };
  const measurement = {
    coordinateSpace: "renderer-viewport-css",
    rect: { x: 748, y: 150, width: 480, height: 500 },
    viewport: { width: 1228, height: 690, devicePixelRatio: 1.25 },
    visible: true,
  };
  assert.deepEqual(convertBrowserSurfaceMeasurement(measurement, contentBounds), measurement.rect);
  assert.deepEqual(convertBrowserSurfaceMeasurement({ ...measurement, rect: { x: 1200, y: 680, width: 80, height: 80 } }, contentBounds), { x: 1200, y: 680, width: 28, height: 10 });
  assert.deepEqual(convertBrowserSurfaceMeasurement({ ...measurement, rect: { x: 1250, y: 150, width: 80, height: 80 } }, contentBounds).reason, "empty");
});

test("BrowserPane exposes topmost ordering and capture diagnostics", () => {
  assert.match(pane, /childOrder/);
  assert.match(pane, /capturePage/);
  assert.match(pane, /toPNG\(\)/);
  assert.match(pane, /topmost/);
  assert.match(pane, /probeSurface/);
});
