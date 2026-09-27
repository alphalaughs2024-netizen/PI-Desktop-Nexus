import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const core = await readFile(new URL("../src/components/workpanel/BrowserCoreTab.tsx", import.meta.url), "utf8");

test("Step 1 preserves the six Browser composition layers in order", () => {
  const layers = ["<BrowserTabStrip", "<BrowserToolbar", "className=\"browser-content-viewport\""];
  let previous = -1;
  for (const layer of layers) {
    const index = core.indexOf(layer);
    assert.notEqual(index, -1, `missing Browser layer: ${layer}`);
    assert.ok(index > previous, `${layer} must follow the previous Browser layer`);
    previous = index;
  }
  const viewport = core.indexOf("className=\"browser-content-viewport\"");
  for (const child of ["<BrowserReadinessStrip", "<BrowserOperationStatus", "<BrowserErrorNotice", "<BrowserGuestSurface", "<BrowserNewTabSurface", "<BrowserEmptyState"]) {
    const index = core.indexOf(child);
    assert.ok(index > viewport, `${child} must remain inside the Browser viewport layer`);
  }
});
