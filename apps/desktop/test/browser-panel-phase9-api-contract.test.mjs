import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [types, api, main, protocol] = await Promise.all([
  readFile(new URL("../../../packages/shared/src/types.ts", import.meta.url), "utf8"),
  readFile(new URL("../src/lib/api.ts", import.meta.url), "utf8"),
  readFile(new URL("../electron/main/index.ts", import.meta.url), "utf8"),
  readFile(new URL("../../../packages/shared/src/protocol.ts", import.meta.url), "utf8"),
]);

test("Phase 9 Browser APIs use shared session-safe contracts", () => {
  assert.match(types, /BrowserViewStateEvent = \{ sessionId: string; state: BrowserViewState \}/);
  assert.match(types, /BrowserDiagnosticsDisplay/);
  assert.match(types, /BrowserCoreSurfaceInput/);
  for (const name of ["browserCoreSurfaceSet", "browserGetViewState", "browserDiagnostics", "browserRecover", "browserNavigate", "browserAction", "browserScreenshot", "browserOpenExternal"]) {
    assert.equal((api.match(new RegExp(`\\b${name}\\s*:`)) ?? []).length, 1, `${name} declared once`);
    assert.match(protocol, new RegExp(name));
  }
  assert.match(main, /BrowserCoreSurfaceInput/);
  assert.match(main, /BrowserScreenshotResult/);
});

test("renderer API does not expose Electron or Browser host internals", async () => {
  const source = await readFile(new URL("../src/components/workpanel/BrowserCoreTab.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(source, /from ["']electron["']/);
  assert.doesNotMatch(source, /BrowserHost|BrowserCdp|WebContents|ipcRenderer/);
});
