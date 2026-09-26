import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
const main = await readFile(new URL("../electron/main/index.ts", import.meta.url), "utf8");
const core = await readFile(new URL("../src/components/workpanel/BrowserCoreTab.tsx", import.meta.url), "utf8");
test("Browser view state is session-routed", () => {
  assert.match(main, /browserPresentations = new Map/);
  assert.match(main, /sessionId: target/);
  assert.match(core, /event\.sessionId === sessionId/);
  assert.match(core, /browserGetViewState\(sessionId\)/);
});
