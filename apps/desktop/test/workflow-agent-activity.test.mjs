import assert from "node:assert/strict";
import test from "node:test";
import { workflowAgentActivity } from "../src/lib/workflow-agent-activity.ts";

function status(progressPhase, overrides = {}) {
  return { sessionId: "a", isRunning: true, pendingToolConfirmations: 0,
    execution: { turn: { id: "turn-a", phase: "running", progressPhase, ...overrides } } };
}

test("only actual reasoning and execution phases animate the core", () => {
  for (const phase of ["tool", "answering", "waiting-subagents", "compacting"]) {
    assert.equal(workflowAgentActivity({ running: true, status: status(phase) }).state, "working");
  }
  assert.equal(workflowAgentActivity({ running: true, status: status("reasoning") }).state, "thinking");
  for (const phase of ["preparing", "recovering", "waiting-model", "waiting-approval", "waiting-input", "retrying"]) {
    const result = workflowAgentActivity({ running: true, status: status(phase) });
    assert.equal(result.state, "idle");
    assert.equal(result.phase, phase);
  }
});

test("fresh runs ignore old outcomes and old reasoning while status catches up", () => {
  for (const old of [status("reasoning"), status("answering", { outcome: "completed" })]) {
    assert.deepEqual(workflowAgentActivity({ running: true, activeTurnId: "new", status: old,
      result: { status: "failed", turnId: "old" } }), { state: "idle", phase: "preparing", turnId: "new" });
  }
  for (const old of [
    { ...status("reasoning"), activity: { phase: "reasoning" } },
    { currentTurnId: "old", activity: { phase: "tool" } },
  ]) {
    assert.deepEqual(workflowAgentActivity({ running: true, activeTurnId: "new", status: old }),
      { state: "idle", phase: "preparing", turnId: "new" });
  }
});

test("terminal results survive status removal without unread notification dependence", () => {
  for (const [outcome, state] of [["completed", "success"], ["failed", "error"]]) {
    assert.deepEqual(workflowAgentActivity({ running: false, result: { status: outcome, turnId: "done" } }),
      { state, phase: outcome, turnId: "done" });
  }
  assert.deepEqual(workflowAgentActivity({ running: false, status: status(undefined, { outcome: "interrupted" }) }),
    { state: "idle", phase: "interrupted", turnId: "turn-a" });
});

test("unknown active phases and inactive sessions never appear to be thinking", () => {
  assert.equal(workflowAgentActivity({ running: true, status: status(undefined) }).phase, "unavailable");
  assert.equal(workflowAgentActivity({ running: false, status: status("reasoning") }).state, "idle");
  assert.equal(workflowAgentActivity({ running: false }).phase, "ready");
  assert.equal(workflowAgentActivity({ running: true, status: { activity: { phase: "starting" } } }).phase, "preparing");
});
