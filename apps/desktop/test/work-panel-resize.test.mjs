import assert from "node:assert/strict";
import test from "node:test";
import {
  WORK_PANEL_CHAT_MAX_WIDTH,
  WORK_PANEL_CHAT_MIN_WIDTH,
  WORK_PANEL_DEFAULT_WIDTH,
  WORK_PANEL_MAX_WIDTH,
  WORK_PANEL_MIN_WIDTH,
  clampWorkPanelChatWidth,
  clampWorkPanelWidth,
  committedWorkPanelChatWidth,
  parseWorkPanelChatWidth,
  workPanelChatWidthFromPointer,
  workPanelDockMaxWidth,
  browserResizeRequestsFullView,
} from "../src/lib/work-panel-resize.ts";

test("clamps the work panel to its fixed width range", () => {
  assert.equal(clampWorkPanelWidth(900), WORK_PANEL_MAX_WIDTH);
  assert.equal(clampWorkPanelWidth(500), 500);
  assert.equal(clampWorkPanelWidth(200), WORK_PANEL_MIN_WIDTH);
});

test("browser dock limit leaves room for chat and follows the sidebar and viewport", () => {
  assert.equal(workPanelDockMaxWidth(1200, 260), 460);
  assert.equal(workPanelDockMaxWidth(1200, 64), 656);
  assert.equal(workPanelDockMaxWidth(1800, 260), WORK_PANEL_MAX_WIDTH);
  assert.equal(workPanelDockMaxWidth(600, 260), WORK_PANEL_MIN_WIDTH);
});

test("browser expansion requires intentional overshoot and a completed gesture", () => {
  assert.equal(browserResizeRequestsFullView(460, 460, false), false);
  assert.equal(browserResizeRequestsFullView(491, 460, false), false);
  assert.equal(browserResizeRequestsFullView(492, 460, false), true);
  assert.equal(browserResizeRequestsFullView(900, 460, true), false);
  assert.equal(browserResizeRequestsFullView(440, 460, false), false);
  assert.equal(browserResizeRequestsFullView(751, 720, false), false);
  assert.equal(browserResizeRequestsFullView(752, 720, false), true);
});

test("clamps the conversation area to its bounded native resize range", () => {
  assert.equal(clampWorkPanelChatWidth(900), WORK_PANEL_CHAT_MIN_WIDTH);
  assert.equal(clampWorkPanelChatWidth(1200), 1200);
  assert.equal(clampWorkPanelChatWidth(20000), WORK_PANEL_CHAT_MAX_WIDTH);
});

test("anchors inner-divider resizing to the conversation width at gesture start", () => {
  const gesture = { startClientX: 800, startWidth: 1200 };

  assert.equal(workPanelChatWidthFromPointer(gesture, 800), 1200);
  assert.equal(workPanelChatWidthFromPointer(gesture, 880), 1280);
  assert.equal(workPanelChatWidthFromPointer(gesture, 720), 1120);
});

test("inner-divider resizing respects the conversation limits", () => {
  assert.equal(
    workPanelChatWidthFromPointer(
      { startClientX: 800, startWidth: WORK_PANEL_CHAT_MIN_WIDTH },
      300,
    ),
    WORK_PANEL_CHAT_MIN_WIDTH,
  );
  assert.equal(
    workPanelChatWidthFromPointer(
      { startClientX: 800, startWidth: WORK_PANEL_CHAT_MAX_WIDTH },
      1300,
    ),
    WORK_PANEL_CHAT_MAX_WIDTH,
  );
});

test("commits only a changed conversation preview after a completed gesture", () => {
  const gesture = { startClientX: 800, startWidth: WORK_PANEL_DEFAULT_WIDTH + 920 };

  assert.equal(
    committedWorkPanelChatWidth(gesture, gesture.startWidth, true),
    null,
  );
  assert.equal(committedWorkPanelChatWidth(gesture, 1400, false), null);
  assert.equal(committedWorkPanelChatWidth(gesture, 1400, true), 1400);
});

test("accepts only bounded integer conversation widths over IPC", () => {
  assert.equal(parseWorkPanelChatWidth({ width: 1040 }), 1040);
  assert.equal(parseWorkPanelChatWidth({ width: 10000 }), 10000);
  assert.equal(parseWorkPanelChatWidth({ width: 1039 }), null);
  assert.equal(parseWorkPanelChatWidth({ width: 10000.5 }), null);
  assert.equal(parseWorkPanelChatWidth({ width: "1200" }), null);
  assert.equal(parseWorkPanelChatWidth(null), null);
});
