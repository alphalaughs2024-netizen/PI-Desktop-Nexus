import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import ts from "typescript";

// Exercise the actual store action in isolation from browser-only store imports.
const source = await readFile(new URL("../src/stores/app-store.ts", import.meta.url), "utf8");
const action = source.match(/steerPrompt: (async [\s\S]*?)\n  refreshQueuedPrompts:/)?.[1]?.replace(/,\s*$/, "");
assert.ok(action, "steering store action must exist");
const executable = ts.transpile("const action = " + action + ";", { target: ts.ScriptTarget.ES2022 });
function fixture(response, cleanupError) {
  const messages = []; const hiddenQueueEntries = new Set(); const queuedDrafts = new Map([["queue", "draft"]]);
  let retracted = 0; let refreshed = 0;
  const state = { activeSessionId: "s", activeTurnIds: { s: "host" }, runningSessions: { s: true }, pendingPlans: {}, queuedPrompts: {},
    refreshQueuedPrompts: async () => { refreshed++; }, showToast: () => {} };
  const api = { steer: async () => response, removeQueuedPrompt: async () => { if (cleanupError) throw cleanupError; } };
  const build = new Function("get", "set", "api", "crypto", "hiddenQueueEntries", "queuedDrafts", "optimisticUserMessage", "insertOptimisticUserMessage", "retractOptimisticUserMessage", "removeQueuedPrompt", "promptAttachmentsFromDraft", executable + "return action;");
  const run = build(() => state, fn => Object.assign(state, fn(state)), api, { randomUUID: () => "correction" }, hiddenQueueEntries, queuedDrafts,
    (id, content) => ({ id, content, role: "user" }), (_, message) => messages.push(message), (_, message) => { retracted++; messages.splice(messages.indexOf(message), 1); }, value => value, () => []);
  return { run, messages, hiddenQueueEntries, get retracted() { return retracted; }, get refreshed() { return refreshed; } };
}
for (const status of ["accepted", "queued"]) {
  test(status + " steering survives a disk failure in later queue cleanup", async () => {
    const response = { state: status, sessionId: "s", expectedTurnId: "host" };
    const f = fixture(response, new Error("database or disk is full"));
    assert.deepEqual(await f.run("EMERALD", undefined, "queue"), response);
    assert.equal(f.messages.length, 1); assert.equal(f.messages[0].content, "EMERALD");
    assert.equal(f.retracted, 0); assert.equal(f.refreshed, 1); assert.equal(f.hiddenQueueEntries.has("queue"), true);
  });
}
test("rejected native steering retracts only the optimistic instruction", async () => {
  const response = { state: "rejected", reason: "stale_turn" }; const f = fixture(response);
  assert.deepEqual(await f.run("EMERALD", undefined, "queue"), response);
  assert.equal(f.retracted, 1); assert.equal(f.messages.length, 0); assert.equal(f.hiddenQueueEntries.size, 0);
});
