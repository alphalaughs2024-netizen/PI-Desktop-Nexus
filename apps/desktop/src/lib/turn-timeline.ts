import type { EngineTurn } from "@pi-desktop/shared";

/** Keep raw execution spans intact; omit only sub-second quiet gaps from display. */
export function visibleTurnTimeline(execution: EngineTurn, now: number) {
  const timeline = execution.timeline ?? [];
  return timeline.filter((span, index) => span.phase !== "waiting-model"
    || (span.completedAt ?? timeline[index + 1]?.startedAt ?? execution.completedAt ?? now) - span.startedAt >= 1000);
}
