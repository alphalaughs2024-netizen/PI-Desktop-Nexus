import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const core = await readFile(new URL("../src/components/workpanel/BrowserCoreTab.tsx", import.meta.url), "utf8");
const empty = await readFile(new URL("../src/components/workpanel/BrowserEmptyState.tsx", import.meta.url), "utf8");
const strip = await readFile(new URL("../src/components/workpanel/BrowserReadinessStrip.tsx", import.meta.url), "utf8");
const source = await readFile(new URL("../src/components/workpanel/BrowserSourceRow.tsx", import.meta.url), "utf8");

test("Phase 5 maps dedicated view-state into distinct Browser surfaces", () => {
  assert.match(core, /browserGetViewState/);
  assert.match(core, /onBrowserViewState/);
  for (const value of ["no-page", "starting", "ready", "loading", "unavailable", "policy-blocked", "debugger-unavailable", "closed"]) assert.match(core + strip, new RegExp(value));
  assert.match(empty, /Surface unavailable/);
  assert.match(empty, /Policy blocked/);
  assert.match(empty, /Browser closed/);
});

test("Phase 5 source labels contain no prompt or internal identifiers", () => {
  for (const label of ["Opened by you", "Opened by agent", "Workspace preview"]) assert.match(source, new RegExp(label));
  assert.doesNotMatch(source, /prompt|tool args|BrowserId/i);
});
