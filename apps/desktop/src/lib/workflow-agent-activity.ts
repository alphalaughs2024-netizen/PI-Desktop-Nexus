import type { AgentStatus, EngineProgressPhase } from "@pi-desktop/shared";

export type WorkflowCoreState = "idle" | "thinking" | "working" | "success" | "error";
type WorkflowActivityPhase = EngineProgressPhase | "completed" | "failed" | "interrupted" | "ready" | "unavailable";

export function workflowAgentActivity({ running, status, activeTurnId, result }: {
  running: boolean;
  status?: AgentStatus;
  activeTurnId?: string;
  result?: { status: "completed" | "failed"; turnId: string };
}): { state: WorkflowCoreState; phase: WorkflowActivityPhase; turnId?: string } {
  const turn = status?.execution?.turn;
  if (!running) {
    const outcome = result?.status ?? turn?.outcome;
    return {
      state: outcome === "completed" ? "success" : outcome === "failed" ? "error" : "idle",
      phase: outcome ?? "ready",
      turnId: result?.turnId ?? turn?.id,
    };
  }
  // A newly accepted run can precede its first engine status; ignore the old turn.
  const current = turn && !turn.outcome && (!activeTurnId || turn.id === activeTurnId) ? turn : undefined;
  const observedTurnId = status?.currentTurnId ?? turn?.id;
  const observed = activeTurnId && observedTurnId && observedTurnId !== activeTurnId
    ? undefined : status?.activity?.phase;
  const phase: WorkflowActivityPhase = current?.progressPhase
    ?? (observed === "starting" ? "preparing" : observed)
    ?? (current?.phase === "running" || current?.phase === "terminal" ? "unavailable" : current?.phase)
    ?? "preparing";
  return {
    state: phase === "reasoning" ? "thinking"
      : ["tool", "answering", "waiting-subagents", "compacting"].includes(phase) ? "working" : "idle",
    phase,
    turnId: activeTurnId ?? current?.id,
  };
}
