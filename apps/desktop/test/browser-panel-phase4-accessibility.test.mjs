import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const toolbar = await readFile(new URL("../src/components/workpanel/BrowserToolbar.tsx", import.meta.url), "utf8");
const status = await readFile(new URL("../src/components/workpanel/BrowserOperationStatus.tsx", import.meta.url), "utf8");
const error = await readFile(new URL("../src/components/workpanel/BrowserErrorNotice.tsx", import.meta.url), "utf8");

test("Phase 4 toolbar controls are keyboard and screen-reader labelled", () => {
  for (const label of ["Go back", "Go forward", "Reload page", "Stop loading", "Browser address", "Capture screenshot", "Open in default browser", "More Browser actions"]) assert.match(toolbar, new RegExp(label));
  assert.match(toolbar, /aria-expanded=\{menuOpen\}/);
});

test("Phase 4 reuses stable status and alert regions", () => {
  assert.match(status, /browser-operation-status/);
  assert.match(status, /role="status"/);
  assert.match(error, /browser-error-notice/);
  assert.match(error, /role="alert"/);
});
