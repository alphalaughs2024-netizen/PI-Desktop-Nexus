import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const core = await readFile(new URL("../src/components/workpanel/BrowserCoreTab.tsx", import.meta.url), "utf8");
const css = await readFile(new URL("../src/styles/work-panel.css", import.meta.url), "utf8");

test("new tab owns the surface and does not mount the native guest", () => {
  assert.match(core, /isNewTab/);
  assert.match(core, /!isNewTab && <BrowserGuestSurface/);
  assert.match(core, /New tab/);
  assert.match(core, /Focus address bar/);
  assert.match(css, /browser-new-tab-state/);
});
