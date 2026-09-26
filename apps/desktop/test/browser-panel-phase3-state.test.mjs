import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const readiness = await readFile(new URL("../src/components/workpanel/BrowserReadinessStrip.tsx", import.meta.url), "utf8");
const core = await readFile(new URL("../src/components/workpanel/BrowserCoreTab.tsx", import.meta.url), "utf8");

test("Phase 3 defines distinct Browser presentation states", () => {
  for (const state of ["no-page", "starting", "ready", "loading", "unavailable", "policy-blocked", "debugger-unavailable", "closed"]) assert.match(readiness, new RegExp(state));
  assert.match(core, /mapBrowserState/);
  assert.match(core, /presentation/);
  assert.match(core, /transitioning/);
  assert.match(core, /BrowserOperationStatus/);
  assert.match(core, /BrowserErrorNotice/);
});
