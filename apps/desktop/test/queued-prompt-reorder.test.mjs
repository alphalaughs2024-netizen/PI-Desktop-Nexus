import assert from "node:assert/strict";
import test from "node:test";
import { reorderQueuedPromptTo } from "../src/lib/queued-prompts.ts";

const row = (id, priority) => ({
  id,
  sessionId: "a",
  content: id,
  draft: { text: id, fileReferences: [] },
  createdAt: 0,
  ...(priority === undefined ? {} : { priority }),
});

test("drag reorder moves one row across multiple positions only in its session", () => {
  const queues = { a: [row("one"), row("two"), row("three")], b: [row("other")] };
  const next = reorderQueuedPromptTo(queues, "a", "three", "one");
  assert.deepEqual(next.a.map((item) => item.id), ["three", "one", "two"]);
  assert.equal(next.b, queues.b);
  assert.deepEqual(queues.a.map((item) => item.id), ["one", "two", "three"]);
});

test("drag reorder cannot cross pending or promoted rows", () => {
  const queues = { a: [row("one"), row("pending:two"), row("three"), row("promoted", 0)] };
  assert.equal(reorderQueuedPromptTo(queues, "a", "three", "one"), queues);
  assert.equal(reorderQueuedPromptTo(queues, "a", "three", "promoted"), queues);
  assert.equal(reorderQueuedPromptTo(queues, "a", "missing", "three"), queues);
});
