import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = async (path) => readFile(new URL(path, import.meta.url), "utf8");
const coreTab = await read("../src/components/workpanel/BrowserCoreTab.tsx");
const browserCore = await read("../electron/main/browser-core.ts");
const runtime = await read("../electron/main/plugin-runtime.ts");
const main = await read("../electron/main/index.ts");
const host = await read("../electron/main/browser-host.ts");
const tabs = await read("../src/lib/work-panel-tabs.ts");

test("core Browser surface does not depend on the plugin view bridge", () => {
  assert.doesNotMatch(coreTab, /pluginViewSet|pluginBridge|["']pi\.browser["']/);
  assert.match(coreTab, /browserCoreSurfaceSet/);
});

test("all Browser tool names are reserved from plugins", () => {
  for (const name of ["Browser", "browser_list_tabs", "browser_open", "browser_snapshot", "browser_cdp"]) {
    assert.match(browserCore, new RegExp(name.replaceAll("_", "[_]")));
  }
  assert.match(runtime, /built-in core capability/);
});

test("Browser capability policy and compatibility management are core-owned", () => {
  assert.match(main, /coreCapabilityList/);
  assert.match(main, /coreCapabilitySetEnabled/);
  assert.match(main, /Browser is built into Nexus/);
  assert.doesNotMatch(host, /Browser plugin is disabled/);
});

test("legacy Browser tabs normalize to core://browser", () => {
  assert.match(tabs, /normalizeBrowserWorkPanelTab/);
  assert.match(tabs, /core:\/\/browser/);
});
