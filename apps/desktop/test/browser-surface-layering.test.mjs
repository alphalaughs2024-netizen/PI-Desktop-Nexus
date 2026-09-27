import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const css = await readFile(new URL("../src/styles/work-panel.css", import.meta.url), "utf8");
const core = await readFile(new URL("../src/components/workpanel/BrowserCoreTab.tsx", import.meta.url), "utf8");

test("Browser viewport reserves status rows and isolates opaque page surfaces", () => {
  assert.match(css, /\.work-panel-resource-host\s*\{[^}]*display: flex;[^}]*min-height: 0;[^}]*flex: 1;[^}]*flex-direction: column;/);
  assert.match(css, /\.work-panel-tabpane\s*\{[^}]*display: flex;[^}]*min-height: 0;[^}]*flex: 1;/);
  assert.match(css, /browser-content-viewport[^}]*display: flex/);
  assert.match(css, /browser-content-viewport[^}]*isolation: isolate/);
  assert.match(css, /browser-page-surface[^}]*flex: 1/);
  assert.match(css, /browser-state-surface[^}]*inset: 0/);
  assert.match(css, /browser-state-surface[^}]*z-index: 1/);
  assert.match(core, /browser-content-viewport[\s\S]*<BrowserReadinessStrip[\s\S]*<BrowserOperationStatus[\s\S]*<BrowserErrorNotice[\s\S]*browser-page-surface/);
});
