import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
const runtime = await readFile(new URL("../electron/main/plugin-runtime.ts", import.meta.url), "utf8");
const store = await readFile(new URL("../src/stores/app-store.ts", import.meta.url), "utf8");
const browserView = await readFile(new URL("../electron/main/browser-view.ts", import.meta.url), "utf8");
const cdp = await readFile(new URL("../electron/main/browser-cdp.ts", import.meta.url), "utf8");
test("Phase 1 reserves Browser and removes plugin-view availability gating", () => {
  assert.match(runtime, /Browser is a built-in core tool/);
  assert.doesNotMatch(store, /Browser is not available in this Nexus installation/);
});
test("Phase 1 preserves Browser security boundaries", () => {
  assert.match(browserView, /sandbox: true/);
  assert.match(browserView, /contextIsolation: true/);
  assert.match(browserView, /nodeIntegration: false/);
  assert.match(cdp, /BROWSER_CDP_ALLOWLIST/);
});
