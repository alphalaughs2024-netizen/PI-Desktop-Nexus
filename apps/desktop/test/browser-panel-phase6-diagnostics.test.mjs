import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
const drawer = await readFile(new URL("../src/components/workpanel/BrowserDiagnosticsDrawer.tsx", import.meta.url), "utf8");
const styles = await readFile(new URL("../src/styles/work-panel.css", import.meta.url), "utf8");
test("diagnostics drawer is in-frame, non-modal, and presentation-aware", () => {
  assert.match(drawer, /browser-diagnostics-drawer--\$\{presentation\}/);
  assert.match(drawer, /Escape/);
  assert.match(drawer, /navigator\.clipboard/);
  assert.doesNotMatch(drawer, /BrowserWindow|WebContents|CDP/);
  assert.match(styles, /browser-diagnostics-drawer--docked/);
  assert.match(styles, /browser-diagnostics-drawer--maximized/);
});
