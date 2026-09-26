import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const typed = await readFile(new URL("../electron/main/browser-typed-tools.ts", import.meta.url), "utf8");
const broker = await readFile(new URL("../electron/main/browser-broker.ts", import.meta.url), "utf8");
const runtime = await readFile(new URL("../../../packages/agent-runtime/src/runtime.ts", import.meta.url), "utf8");
const intent = await readFile(new URL("../../../packages/agent-runtime/src/browser-intent.ts", import.meta.url), "utf8");

test("Browser inspection and navigation contracts are distinct", () => {
  assert.match(typed, /Inspect the current core Browser tab only/);
  assert.match(typed, /about:blank/);
  assert.match(typed, /Always navigate/);
  assert.match(broker, /latestSnapshot = undefined/);
  assert.match(broker, /location:/);
});

test("natural-language YouTube/GitHub requests resolve to explicit URLs", () => {
  assert.match(intent, /youtube\.com/);
  assert.match(intent, /github\.com/);
  assert.match(runtime, /browserNavigationIntent/);
  assert.match(runtime, /requested\.add\("browser_open"\)/);
  assert.match(runtime, /requested\.add\("browser_snapshot"\)/);
});
