import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const policy = await readFile(new URL("../electron/main/browser-policy.ts", import.meta.url), "utf8");
const telemetry = await readFile(new URL("../electron/main/browser-telemetry.ts", import.meta.url), "utf8");
const pane = await readFile(new URL("../electron/main/browser-view.ts", import.meta.url), "utf8");
const cdp = await readFile(new URL("../electron/main/browser-cdp.ts", import.meta.url), "utf8");
const ui = await readFile(new URL("../src/components/workpanel/BrowserCoreTab.tsx", import.meta.url), "utf8");

test("Phase 8 centralizes Browser policy and preserves the Electron boundary", () => {
  for (const token of ["decideNavigation", "decideExternal", "decideCdp", "decideMode", "decideCapability"]) assert.match(policy, new RegExp(token));
  assert.match(pane, /sandbox: true/);
  assert.match(pane, /contextIsolation: true/);
  assert.match(pane, /nodeIntegration: false/);
  assert.doesNotMatch(ui, /from "electron"|ipcRenderer|<webview/);
});

test("Phase 8 telemetry is bucketed and identifier-hashed", () => {
  assert.match(telemetry, /safeHash/);
  assert.match(telemetry, /bucket/);
  assert.doesNotMatch(telemetry, /url|pageText|screenshotData|formValue|cdpParams/);
});

test("Phase 8 payload and CDP guards remain explicit", () => {
  assert.match(cdp, /BROWSER_CDP_ALLOWLIST/);
  assert.match(cdp, /MAX_EVALUATE_CHARS/);
  assert.match(cdp, /maxDepth/);
  assert.match(cdp, /maxNodes/);
  assert.match(cdp, /maxBytes/);
});
