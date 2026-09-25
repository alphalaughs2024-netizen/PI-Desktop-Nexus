import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = async (path) => readFile(new URL(path, import.meta.url), "utf8");
const main = await read("../electron/main/index.ts");
const runtime = await read("../../../packages/agent-runtime/src/runtime.ts");
const sidecar = await read("../electron/main/agent-sidecar.ts");
const hostProcess = await read("../electron/main/host-process.ts");
const broker = await read("../electron/main/browser-broker.ts");
const typed = await read("../electron/main/browser-typed-tools.ts");
const policy = await read("../electron/main/browser-policy.ts");
const telemetry = await read("../electron/main/browser-telemetry.ts");

test("Phase 9 core Browser readiness gate has direct typed tool registration", () => {
  for (const name of ["browser_list_tabs", "browser_open", "browser_navigate", "browser_snapshot", "browser_screenshot", "browser_click", "browser_fill", "browser_type", "browser_keypress", "browser_wait", "browser_console", "browser_evaluate", "browser_cdp"]) {
    assert.match(runtime, new RegExp(name));
  }
  assert.match(main, /createBrowserTypedTools/);
  assert.match(main, /for \(const descriptor of browserTypedTools\)/);
  assert.match(sidecar, /localTools/);
});

test("Phase 9 Browser routes share broker, policy, and telemetry seams", () => {
  assert.match(broker, /decideMode|decideCdp|decideNavigation/);
  assert.match(policy, /decideCapability/);
  assert.match(telemetry, /browser\.request\.started|browser\.snapshot/);
});

test("Phase 9 clean core excludes pi.browser from bundled reconciliation", () => {
  assert.match(hostProcess, /PI_DESKTOP_EXCLUDE_BUILTIN_BROWSER/);
  assert.match(hostProcess, /PI_DESKTOP_BUILTIN_PLUGINS_DIR/);
  assert.match(main, /filter\(\(plugin\) => plugin\?\.id !== "pi\.browser"\)/);
});
