import assert from "node:assert/strict";
import test from "node:test";

const { nextWorkPanelPresentation, nextWorkPanelTransition, isMaximizedPresentation } = await import("../src/lib/work-panel-presentation.ts");

test("reservation commits only for a current successful request", async () => {
  let committed = false;
  assert.equal(await (await import("../src/lib/work-panel-presentation.ts")).commitWorkPanelPresentation({ reservation: Promise.resolve(), isCurrent: () => true, commit: () => { committed = true; } }), true);
  assert.equal(committed, true);
});

test("presentation transitions are deterministic", () => {
  assert.equal(nextWorkPanelPresentation("docked", "maximize"), "maximized");
  assert.equal(nextWorkPanelPresentation("maximized", "dock"), "docked");
  assert.equal(nextWorkPanelTransition("docked", "maximize"), "maximizing");
  assert.equal(nextWorkPanelTransition("maximized", "dock"), "docking");
  assert.equal(isMaximizedPresentation("maximized"), true);
  assert.equal(isMaximizedPresentation("docked"), false);
});
