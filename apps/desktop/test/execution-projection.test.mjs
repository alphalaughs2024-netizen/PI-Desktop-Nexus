import assert from "node:assert/strict";
import test from "node:test";
import { register } from "node:module";
register(new URL("./helpers/ts-import-hooks.mjs", import.meta.url));
const { executionMessages, reconcileExecutionMessages } = await import("../src/lib/execution-projection.ts");

test("reconnection projects partial output and original timing without inventing reasoning", () => {
  const turn = { id: "t", runId: "run", startedAt: 100, phase: "waiting-model" };
  const snapshot = { schema: 1, session: { modelId: "m", providerId: "p" }, sequence: 5, turn, items: [
    { id: "text", kind: "assistant", status: "interrupted", text: "Partial", startedAt: 200, completedAt: 600 },
    { id: "tool", kind: "tool", label: "exec_command", status: "completed", text: "output", result: { exitCode: 0 }, startedAt: 300, completedAt: 500 },
  ] };
  const rows = executionMessages(snapshot);
  assert.equal(rows[0].execution, turn);
  assert.equal(rows[0].thinking, undefined);
  assert.equal(rows[1].content, "Partial");
  assert.equal(rows[1].status, "aborted");
  assert.equal(rows[2].toolDurationMs, 200);
  assert.equal(rows.every(row => row.turnId === "t"), true);
});

test("terminal snapshot replaces a retained active summary and settles partial output", () => {
  const turn = { id: "t", runId: "run", startedAt: 100, completedAt: 900, phase: "terminal", outcome: "completed" };
  const snapshot = { schema: 1, session: { modelId: "m", providerId: "p" }, sequence: 8, turn, items: [
    { id: "text", kind: "assistant", status: "completed", text: "Final answer", startedAt: 200, completedAt: 800 },
    { id: "tool", kind: "tool", label: "exec_command", status: "completed", text: "done", startedAt: 300, completedAt: 500 },
  ] };
  const current = [
    { id: "user", role: "user", content: "Build", createdAt: new Date(100).toISOString() },
    { ...executionMessages(snapshot)[0], execution: { ...turn, completedAt: undefined, outcome: undefined } },
    { id: "text", role: "assistant", content: "Final", status: "streaming", createdAt: new Date(200).toISOString() },
    { id: "tool", role: "tool", content: "", toolStatus: "running", status: "complete", createdAt: new Date(300).toISOString() },
  ];
  const rows = reconcileExecutionMessages(current, snapshot);
  assert.deepEqual(rows.map(row => row.id), ["user", "t:execution", "text", "tool"]);
  assert.equal(rows[1].execution, turn);
  assert.equal(rows[2].content, "Final answer");
  assert.equal(rows[2].status, "complete");
  assert.equal(rows[3].toolStatus, "success");
});

test("active snapshot preserves newer live text and terminal metadata", () => {
  const turn = { id: "t", runId: "run", startedAt: 100, phase: "waiting-model" };
  const snapshot = { schema: 1, session: { modelId: "m", providerId: "p" }, sequence: 5, turn, items: [
    { id: "text", kind: "assistant", status: "running", text: "Older", startedAt: 200 },
  ] };
  const live = { id: "text", role: "assistant", content: "Newer live text", status: "streaming", createdAt: new Date(200).toISOString() };
  const summary = { ...executionMessages(snapshot)[0], execution: { ...turn, outcome: "interrupted", completedAt: 900 } };
  const rows = reconcileExecutionMessages([live, summary], snapshot);
  assert.equal(rows.find(row => row.id === "text"), live);
  assert.equal(rows.find(row => row.execution), summary);
});
