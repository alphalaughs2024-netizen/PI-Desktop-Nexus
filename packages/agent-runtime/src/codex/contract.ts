import { randomUUID } from "node:crypto";
import type { EngineEvent, EngineItem, EngineProgressPhase, EngineSession, EngineSnapshot, EngineTurn } from "@pi-desktop/shared";

export const MAX_TURN_PHASE_SPANS = 256;

function progressPhase(items: readonly EngineItem[]): EngineProgressPhase {
  const running = items.filter(item => item.status === "running");
  if (running.some(item => item.kind === "approval" && (item.label === "asktool" || item.label.endsWith("requestUserInput")))) return "waiting-input";
  if (running.some(item => item.kind === "approval")) return "waiting-approval";
  if (running.some(item => item.kind === "tool" && item.command?.yieldedAt === undefined)) return "tool";
  if (running.some(item => item.kind === "assistant")) return "answering";
  if (running.some(item => item.kind === "reasoning" && item.text.trim())) return "reasoning";
  return "waiting-model";
}

export function recordProgressPhase(turn: EngineTurn, phase: EngineProgressPhase, now: number, detail?: string): void {
  detail = detail?.slice(0, 300);
  const timeline = turn.timeline ??= [];
  const last = timeline.at(-1);
  if (last?.phase === phase && last.detail === detail && last.completedAt === undefined) return;
  const at = Math.max(turn.startedAt, last?.startedAt ?? 0, now);
  if (last && last.completedAt === undefined) last.completedAt = at;
  timeline.push({ phase, startedAt: at, ...(detail ? { detail: detail.slice(0, 300) } : {}) });
  if (timeline.length > MAX_TURN_PHASE_SPANS) {
    timeline.splice(1, timeline.length - MAX_TURN_PHASE_SPANS);
    turn.omittedSpans = (turn.omittedSpans ?? 0) + 1;
  }
  turn.progressPhase = phase;
}

/** One accepted turn owns one generation and exactly one terminal outcome. */
export class ExecutionContract {
  private state: EngineSnapshot;
  constructor(session: EngineSession, restored?: EngineSnapshot) {
    this.state = restored ? structuredClone(restored) : { schema: 1, session, sequence: 0, items: [] };
    this.state.session = { ...session, nativeHandle: restored?.session.nativeHandle };
  }
  snapshot(): EngineSnapshot { return structuredClone(this.state); }
  get progressPhase(): EngineProgressPhase | undefined { return this.state.turn?.progressPhase; }
  get turnId(): string | undefined { return this.state.turn?.id; }
  get activeRunId(): string | undefined { return this.state.turn?.outcome ? undefined : this.state.turn?.runId; }
  ownsNativeEvent(threadId?: string, turnId?: string): boolean {
    const turn = this.state.turn;
    return !!turn && !turn.outcome && (!threadId || threadId === this.state.session.nativeHandle)
      && (!turnId || !turn.nativeTurnId || turnId === turn.nativeTurnId);
  }
  currentProgress(): EngineProgressPhase { return progressPhase(this.state.items); }
  bind(handle: string): void { this.state.session.nativeHandle = handle; }
  accept(id: string, now = Date.now(), recoveringAt?: number): EngineTurn {
    if (this.state.turn && !this.state.turn.outcome) throw new Error("AGENT_BUSY");
    const turn: EngineTurn = { id, runId: randomUUID(), startedAt: now, phase: "preparing" };
    recordProgressPhase(turn, "preparing", now);
    if (recoveringAt !== undefined) recordProgressPhase(turn, "recovering", recoveringAt);
    this.state.turn = turn;
    this.state.items = [];
    this.state.sequence = 0;
    return structuredClone(turn);
  }
  apply(event: EngineEvent): boolean {
    const turn = this.state.turn;
    if (!turn || turn.outcome || event.sessionId !== this.state.session.sessionId || event.runId !== turn.runId || event.sequence <= this.state.sequence) return false;
    if (event.type === "phase") {
      if (event.nativeTurnId && turn.nativeTurnId && event.nativeTurnId !== turn.nativeTurnId) return false;
      turn.phase = event.phase;
      if (event.nativeTurnId) turn.nativeTurnId = event.nativeTurnId;
      recordProgressPhase(turn, event.progressPhase ?? (event.phase === "running" ? progressPhase(this.state.items) : event.phase === "terminal" ? "waiting-model" : event.phase), event.ts, event.detail);
    } else if (event.type === "native-segment") {
      if (turn.nativeTurnId !== event.expectedNativeTurnId) return false;
      (turn.nativeSegments ??= []).push({ nativeTurnId: event.expectedNativeTurnId, outcome: event.outcome, completedAt: event.ts });
      turn.nativeTurnId = undefined;
      turn.phase = "waiting-model";
      recordProgressPhase(turn, "waiting-model", event.ts);
    } else if (event.type === "item") {
      const index = this.state.items.findIndex(item => item.id === event.item.id);
      const old = this.state.items[index];
      // Late running states must not resurrect a closed item.
      if (old && old.status !== "running" && event.item.status === "running") return false;
      if (index < 0) this.state.items.push(structuredClone(event.item));
      else this.state.items[index] = structuredClone(event.item);
      const progress = progressPhase(this.state.items);
      turn.phase = progress === "waiting-approval" ? "waiting-approval" : progress === "waiting-model" ? "waiting-model" : "running";
      recordProgressPhase(turn, progress, event.ts);
    } else {
      turn.phase = "terminal";
      turn.outcome = event.outcome;
      turn.completedAt = Math.max(turn.startedAt, turn.timeline?.at(-1)?.startedAt ?? 0, event.ts);
      const last = turn.timeline?.at(-1);
      if (last && last.completedAt === undefined) last.completedAt = turn.completedAt;
      if (event.error) turn.error = event.error;
      for (const item of this.state.items) {
        if (item.status === "running") {
          item.status = event.outcome === "completed" ? item.command?.yieldedAt !== undefined ? "completed" : "failed" : event.outcome;
          item.completedAt = item.command?.yieldedAt ?? event.ts;
        }
      }
    }
    this.state.sequence = event.sequence;
    return true;
  }
  item(nativeId: string): EngineItem | undefined {
    return this.state.items.find(item => item.nativeId === nativeId);
  }
}
