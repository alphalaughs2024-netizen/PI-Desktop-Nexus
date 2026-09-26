import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const main = await readFile(new URL("../electron/main/index.ts", import.meta.url), "utf8");
const typed = await readFile(new URL("../electron/main/browser-typed-tools.ts", import.meta.url), "utf8");

test("manual, preview, typed, and compatibility paths share the core broker", () => {
  assert.match(main, /browserBroker\.navigate/);
  assert.match(main, /browserBroker\.preview/);
  assert.match(typed, /broker\.navigate/);
  assert.match(main, /markBrowserSource\(sessionId, "agent"\)/);
  assert.match(main, /markBrowserSource\(sessionId, "workspace-preview"\)/);
  assert.match(main, /markBrowserSource\(sessionId, "unknown"\)/);
  assert.doesNotMatch(main, /browserPane\.navigate/);
});
