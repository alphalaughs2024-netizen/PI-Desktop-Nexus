import assert from "node:assert/strict";
import test from "node:test";
import { browserSurfaceSessionUpdate } from "../electron/main/browser-surface-session.ts";

test("visible Browser surface moves to the new session", () => {
  assert.deepEqual(browserSurfaceSessionUpdate("old", "new", true), { accept: true, ownerSessionId: "new" });
});

test("late hide from the previous session cannot detach the active guest", () => {
  assert.deepEqual(browserSurfaceSessionUpdate("new", "old", false), { accept: false, ownerSessionId: "new" });
  assert.deepEqual(browserSurfaceSessionUpdate("new", "new", false), { accept: true, ownerSessionId: "new" });
});
