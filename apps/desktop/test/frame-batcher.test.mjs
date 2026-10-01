import assert from "node:assert/strict";
import test from "node:test";
import { createFrameBatcher } from "../src/lib/frame-batcher.ts";

test("frame batcher keeps the latest value for each stream target", () => {
  const batches = [];
  const batcher = createFrameBatcher((values) => {
    batches.push([...values]);
  });

  batcher.enqueue("message:a", "first");
  batcher.enqueue("message:a", "latest");
  batcher.enqueue("tool:b", "tool");
  assert.equal(batches.length, 0);

  batcher.flushNow();

  assert.deepEqual(batches, [["latest", "tool"]]);
  assert.equal(batcher.size, 0);
});

test("frame batcher flushes immediately without leaving a timer", () => {
  const batches = [];
  const batcher = createFrameBatcher((values) => batches.push([...values]));

  batcher.enqueue("message:a", 1);
  batcher.flushNow();
  batcher.flushNow();

  assert.deepEqual(batches, [[1]]);
  assert.equal(batcher.size, 0);
});

test("leading update paints immediately and sustained output coalesces", () => {
  const batches = [];
  const batcher = createFrameBatcher(values => batches.push([...values]), { leading: true });
  batcher.enqueue("a", "first");
  assert.deepEqual(batches, [["first"]]);
  batcher.enqueue("a", "middle");
  batcher.enqueue("a", "latest");
  batcher.flushNow();
  assert.deepEqual(batches, [["first"], ["latest"]]);
});

test("a suspended animation frame cannot indefinitely hold output", async () => {
  const oldRequest = globalThis.requestAnimationFrame;
  const oldCancel = globalThis.cancelAnimationFrame;
  globalThis.requestAnimationFrame = () => 42;
  const cancelled = [];
  globalThis.cancelAnimationFrame = id => cancelled.push(id);
  try {
    const batches = [];
    const batcher = createFrameBatcher(values => batches.push([...values]), { maxWaitMs: 20 });
    batcher.enqueue("a", "output");
    await new Promise(resolve => setTimeout(resolve, 50));
    assert.deepEqual(batches, [["output"]]);
    assert.deepEqual(cancelled, [42]);
    assert.equal(batcher.size, 0);
  } finally {
    globalThis.requestAnimationFrame = oldRequest;
    globalThis.cancelAnimationFrame = oldCancel;
  }
});
