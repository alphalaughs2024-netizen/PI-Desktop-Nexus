import assert from "node:assert/strict";
import test from "node:test";
import { toolActivityIcon, toolProgressDetail, turnActivityIcon } from "../src/lib/activity-motion.ts";

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

test("current work uses supplied descriptions and useful targets without executable noise", () => {
  assert.equal(toolProgressDetail({ toolName: "exec_command", toolArgs: { command: '"C:\\long\\runtime\\pwsh.exe" -Command Get-Location', description: "Check the working directory" } }), "Check the working directory");
  assert.equal(toolProgressDetail({ toolName: "exec_command", toolArgs: { command: '"C:\\long\\runtime\\pwsh.exe" -Command Get-Location' } }), "Exec Command");
  assert.equal(toolProgressDetail({ toolName: "Grep", toolArgs: { pattern: "activity", path: "src" } }), "activity");
  assert.equal(toolProgressDetail({ toolName: "Read", toolArgs: { path: "src/app.ts" } }), "src/app.ts");
  assert.equal(toolProgressDetail({ toolName: "UseSkill", toolArgs: { id: "nexus/quality/interface-design" } }), "nexus/quality/interface-design");
  assert.equal(toolProgressDetail({ toolName: "Read", toolArgs: { description: "   ", path: "src/app.ts" } }), "src/app.ts");
  assert.equal(toolProgressDetail({ toolName: "Read", toolArgs: { description: "x".repeat(200) } }).length, 100);
});
