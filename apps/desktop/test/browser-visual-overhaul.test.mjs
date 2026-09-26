import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const css = await readFile(new URL("../src/styles/work-panel.css", import.meta.url), "utf8");
const core = await readFile(new URL("../src/components/workpanel/BrowserCoreTab.tsx", import.meta.url), "utf8");

test("Browser visual overhaul defines semantic shell/new-tab surfaces", () => {
  assert.match(css, /--shell-titlebar-height/);
  assert.match(css, /--browser-new-tab-surface/);
  assert.match(css, /browser-tab-strip/);
  assert.match(css, /browser-core-view/);
  assert.match(css, /browser-empty-state/);
  assert.match(core, /browser-core-view--\$\{state\}/);
  assert.match(core, /surface is unavailable/);
});
