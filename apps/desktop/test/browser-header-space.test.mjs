import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const styles = await readFile(new URL("../src/styles/work-panel.css", import.meta.url), "utf8");
const core = await readFile(new URL("../src/components/workpanel/BrowserCoreTab.tsx", import.meta.url), "utf8");

test("Browser hides duplicate host chrome while retaining canonical Browser layers", () => {
  assert.match(styles, /\.work-panel-frame:has\(\.browser-core-view\) \.work-panel-frame-header \{ display: none; \}/);
  assert.doesNotMatch(core, /<BrowserHeader/);
  assert.doesNotMatch(core, /<BrowserSourceRow/);
  assert.match(core, /<BrowserTabStrip/);
  assert.match(core, /<BrowserToolbar/);
  assert.match(core, /className=\"browser-content-viewport\"/);
});
