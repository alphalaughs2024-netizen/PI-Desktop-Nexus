import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../src/lib/browser-geometry-coordinator.ts", import.meta.url), "utf8");
const guest = await readFile(new URL("../src/components/workpanel/BrowserGuestSurface.tsx", import.meta.url), "utf8");

test("Phase 11 centralizes Browser guest geometry scheduling", () => {
  assert.match(source, /requestAnimationFrame|raf/);
  assert.match(source, /generation/);
  assert.match(source, /transitionGeneration/);
  assert.match(source, /browserGuestRectKey/);
  assert.match(source, /visible: false/);
  assert.match(guest, /createGuestGeometryCoordinator/);
  assert.doesNotMatch(guest, /browserGuestRectKey\(/);
});
