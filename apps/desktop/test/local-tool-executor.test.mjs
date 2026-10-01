import assert from "node:assert/strict";
import test from "node:test";
import { LocalToolExecutor } from "../electron/main/local-tool-executor.ts";

test("abort is scoped to session and settles even when a handler never returns", async () => {
  const executor = new LocalToolExecutor(5000);
  let signal;
  const running = executor.run(async input => { signal = input.signal; return new Promise(() => {}); }, { sessionId: "a", toolCallId: "call" });
  await Promise.resolve();
  assert.equal(executor.abort("b", "call"), false);
  assert.equal(signal.aborted, false);
  assert.equal(executor.abort("a", "call"), true);
  assert.equal((await running).errorCode, "TOOL_ABORTED");
  assert.equal(signal.aborted, true);
});

test("timeout aborts handler before any delayed follow-up mutation", async () => {
  const executor = new LocalToolExecutor(10);
  let resume;
  const waiting = new Promise(resolve => { resume = resolve; });
  let mutations = 0;
  const running = executor.run(async ({ signal }) => {
    await waiting;
    signal.throwIfAborted();
    mutations++;
    return { ok: true, content: "changed" };
  }, { sessionId: "a", toolCallId: "call" });
  assert.equal((await running).errorCode, "TOOL_TIMEOUT");
  resume();
  await Promise.resolve();
  assert.equal(mutations, 0);
});

test("transport close aborts all owned handlers", async () => {
  const executor = new LocalToolExecutor(5000);
  const first = executor.run(async () => new Promise(() => {}), { sessionId: "a", toolCallId: "one" });
  const second = executor.run(async () => new Promise(() => {}), { sessionId: "b", toolCallId: "two" });
  executor.abortAll();
  assert.equal((await first).errorCode, "TOOL_ABORTED");
  assert.equal((await second).errorCode, "TOOL_ABORTED");
});
