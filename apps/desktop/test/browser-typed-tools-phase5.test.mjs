import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const typed = await readFile(new URL("../electron/main/browser-typed-tools.ts", import.meta.url), "utf8");

test("Phase 5 defines focused typed Browser core tools and policy guidance", () => {
  for (const name of ["browser_list_tabs", "browser_open", "browser_navigate", "browser_snapshot", "browser_screenshot", "browser_click", "browser_fill", "browser_type", "browser_keypress", "browser_wait", "browser_console", "browser_evaluate", "browser_cdp"]) assert.match(typed, new RegExp(name));
  assert.match(typed, /BROWSER_PLAN_SAFE_TOOLS/);
  assert.match(typed, /Refs are scoped to browserId and snapshotId/);
  assert.match(typed, /BROWSER_POSSIBLY_APPLIED/);
});

test("Phase 5 keeps the legacy Browser union as compatibility", () => {
  assert.match(typed, /Browser/);
  assert.match(typed, /BROWSER_PLAN_SAFE_TOOLS/);
});
