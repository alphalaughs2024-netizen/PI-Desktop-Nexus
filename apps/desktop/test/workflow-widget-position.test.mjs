import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_WORKFLOW_POSITION, workflowWidgetBounds, workflowWidgetPoint,
  workflowWidgetPosition, readWorkflowWidgetPosition, rememberWorkflowWidgetPosition,
} from "../src/lib/workflow-widget-position.ts";

test("dragging is bounded by the conversation and excludes the title band", () => {
  const bounds = workflowWidgetBounds(900, 700, 300, 38, 46);
  assert.deepEqual(bounds, { left: 12, right: 588, top: 58, bottom: 650 });
  assert.deepEqual(workflowWidgetPoint(DEFAULT_WORKFLOW_POSITION, bounds), { left: 588, top: 58 });
  assert.deepEqual(workflowWidgetPosition(-999, -999, bounds), { x: 0, y: 0 });
  assert.deepEqual(workflowWidgetPosition(9999, 9999, bounds), { x: 1, y: 1 });
});

test("relative placement survives narrow resize and tall Inspect contents", () => {
  const position = workflowWidgetPosition(300, 354, workflowWidgetBounds(900, 700, 300, 38, 46));
  assert.deepEqual(position, { x: 0.5, y: 0.5 });
  const resized = workflowWidgetBounds(324, 300, 300, 210, 46);
  assert.deepEqual(workflowWidgetPoint(position, resized), { left: 12, top: 68 });
  assert.deepEqual(workflowWidgetPoint(position, workflowWidgetBounds(200, 100, 300, 210, 46)), { left: 0, top: 0 });
});

test("saved positions contain only fractions; malformed or blocked storage cannot break the panel", () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  let saved = null;
  const store = { getItem: () => saved, setItem: (_key, value) => { saved = value; } };
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: store });
  try {
    assert.deepEqual(readWorkflowWidgetPosition(), DEFAULT_WORKFLOW_POSITION);
    rememberWorkflowWidgetPosition({ x: 0.4, y: 0.8 });
    assert.deepEqual(JSON.parse(saved), { x: 0.4, y: 0.8 });
    assert.deepEqual(readWorkflowWidgetPosition(), { x: 0.4, y: 0.8 });
    for (const invalid of ["broken", "{}", '{"x":"1","y":0}', '{"x":null,"y":0}']) {
      saved = invalid;
      assert.deepEqual(readWorkflowWidgetPosition(), DEFAULT_WORKFLOW_POSITION);
    }
    saved = '{"x":-9,"y":99}';
    assert.deepEqual(readWorkflowWidgetPosition(), { x: 0, y: 1 });
    Object.defineProperty(globalThis, "localStorage", { configurable: true, get() { throw new Error("blocked"); } });
    assert.deepEqual(readWorkflowWidgetPosition(), DEFAULT_WORKFLOW_POSITION);
    assert.doesNotThrow(() => rememberWorkflowWidgetPosition(DEFAULT_WORKFLOW_POSITION));
  } finally {
    if (previous) Object.defineProperty(globalThis, "localStorage", previous);
    else delete globalThis.localStorage;
  }
});
