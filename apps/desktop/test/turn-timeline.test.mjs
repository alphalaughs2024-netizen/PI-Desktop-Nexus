import assert from "node:assert/strict";
import test from "node:test";
import { visibleTurnTimeline } from "../src/lib/turn-timeline.ts";

test("timeline omits only brief model waits while retaining actual work and timing metadata", () => {
  const execution = { startedAt: 0, completedAt: 3000, timeline: [
    { phase: "preparing", startedAt: 0, completedAt: 10 },
    { phase: "waiting-model", startedAt: 10, completedAt: 50 },
    { phase: "reasoning", startedAt: 50, completedAt: 60 },
    { phase: "waiting-model", startedAt: 60, completedAt: 2500 },
    { phase: "answering", startedAt: 2500, completedAt: 2900 },
    { phase: "waiting-model", startedAt: 2900 },
  ] };
  const before = structuredClone(execution);
  assert.deepEqual(visibleTurnTimeline(execution, 9000).map(span => span.phase), ["preparing", "reasoning", "waiting-model", "answering"]);
  assert.deepEqual(execution, before);
});

test("active waits become visible at one second and older spans use the next start", () => {
  const execution = { timeline: [{ phase: "waiting-model", startedAt: 500 }] };
  assert.equal(visibleTurnTimeline(execution, 1499).length, 0);
  assert.equal(visibleTurnTimeline(execution, 1500).length, 1);
  const older = { completedAt: 9000, timeline: [
    { phase: "waiting-model", startedAt: 0 }, { phase: "tool", startedAt: 999 },
  ] };
  assert.deepEqual(visibleTurnTimeline(older, 9000).map(span => span.phase), ["tool"]);
});
