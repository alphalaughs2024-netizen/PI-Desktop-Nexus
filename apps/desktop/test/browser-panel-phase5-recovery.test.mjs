import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const core = await readFile(new URL("../src/components/workpanel/BrowserCoreTab.tsx", import.meta.url), "utf8");
const empty = await readFile(new URL("../src/components/workpanel/BrowserEmptyState.tsx", import.meta.url), "utf8");
const drawer = await readFile(new URL("../src/components/workpanel/BrowserDiagnosticsDrawer.tsx", import.meta.url), "utf8");

test("Phase 5 recovery is explicit and never replays previous operations", () => {
  assert.match(core, /api\.browserRecover/);
  assert.match(core, /Retrying Browser/);
  assert.match(core, /viewState\.recoverable/);
  assert.match(empty, /Retry/);
  assert.match(empty, /Reopen/);
  assert.match(drawer, /Browser diagnostics/);
  assert.doesNotMatch(core, /runAction\(.*recover|runNavigate\(.*recover/s);
});
