import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const root = resolve(".");
const main = readFileSync(resolve("../electron/main/index.ts"), "utf8");
const host = readFileSync(resolve("../electron/main/host-process.ts"), "utf8");
const runtime = readFileSync(resolve("../../../packages/agent-runtime/src/runtime.ts"), "utf8");

test("Phase 9 removes obsolete Browser product assets", () => {
  for (const path of [
    "resources/plugins/pi.browser/manifest.json",
    "resources/plugins/pi.browser/main.js",
    "resources/plugins/pi.browser/views/browser.html",
  ]) assert.equal(existsSync(resolve(path)), false, path);
  assert.match(host, /PI_DESKTOP_EXCLUDE_BUILTIN_BROWSER/);
  assert.match(main, /legacyBrowserView/);
});

test("Phase 9 keeps typed Browser tools in the direct core catalog", () => {
  for (const name of ["browser_list_tabs", "browser_open", "browser_snapshot", "browser_click", "browser_cdp"]) assert.match(runtime, new RegExp(name));
  assert.match(runtime, /AGENT_CORE_TOOL_NAMES/);
});

test("Phase 9 preserves compatibility identity only for migration", () => {
  const tabs = readFileSync(resolve("../src/lib/work-panel-tabs.ts"), "utf8");
  assert.match(tabs, /normalizeBrowserWorkPanelTab/);
  assert.match(tabs, /core:\/\/browser/);
});
