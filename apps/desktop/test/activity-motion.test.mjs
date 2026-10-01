import assert from "node:assert/strict";
import test from "node:test";
import { toolActivityIcon, turnActivityIcon } from "../src/lib/activity-motion.ts";

test("quiet preparation and provider waits never imply supplied reasoning", () => {
  for (const phase of ["preparing", "recovering", "waiting-model", "retrying", "compacting"]) {
    assert.equal(turnActivityIcon(phase), "waiting");
  }
  assert.equal(turnActivityIcon("reasoning"), "reasoning");
});

test("terminal and approval states outrank lingering tools", () => {
  for (const [phase, icon] of [["completed", "completed"], ["failed", "failed"],
    ["interrupted", "paused"], ["unavailable", "paused"], ["waiting-approval", "paused"], ["waiting-input", "paused"]]) {
    assert.equal(turnActivityIcon(phase, "run"), icon);
  }
});

test("tool status uses the current action instead of a reasoning indicator", () => {
  assert.equal(turnActivityIcon("tool", "run"), "terminal");
  assert.equal(turnActivityIcon("tool", "search"), "search");
  assert.equal(turnActivityIcon("tool", "delegate"), "delegate");
  assert.equal(turnActivityIcon("tool"), "tool");
  assert.equal(toolActivityIcon("read"), "file");
  assert.equal(turnActivityIcon("waiting-subagents"), "delegate");
});
