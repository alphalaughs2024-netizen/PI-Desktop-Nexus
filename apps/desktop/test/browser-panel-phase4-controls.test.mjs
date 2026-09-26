import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const api = await readFile(new URL("../src/lib/api.ts", import.meta.url), "utf8");
const protocol = await readFile(new URL("../../../packages/shared/src/protocol.ts", import.meta.url), "utf8");
const types = await readFile(new URL("../../../packages/shared/src/types.ts", import.meta.url), "utf8");

test("Phase 4 adds a bounded typed screenshot contract", () => {
  assert.match(types, /BrowserScreenshotOptions/);
  assert.match(types, /BrowserScreenshotResult/);
  assert.match(protocol, /browserScreenshot/);
  assert.match(api, /browserScreenshot/);
});

test("Phase 4 preserves existing typed navigation/action/external APIs", () => {
  assert.match(api, /browserNavigate/);
  assert.match(api, /browserAction/);
  assert.match(api, /browserOpenExternal/);
  assert.doesNotMatch(api, /ipcRenderer/);
});
