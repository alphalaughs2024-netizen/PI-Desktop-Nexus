import { randomUUID } from "node:crypto";
import type { EngineEvent, EngineItem, EngineSession, EngineSnapshot, EngineTurn } from "@pi-desktop/shared";

/** One accepted turn owns one generation and exactly one terminal outcome. */
export class ExecutionContract {
  private state: EngineSnapshot;
  constructor(session: EngineSession, restored?: EngineSnapshot) {
    this.state = restored ? structuredClone(restored) : { schema: 1, session, sequence: 0, items: [] };
    this.state.session = { ...session, nativeHandle: restored?.session.nativeHandle };
  }
  snapshot(): EngineSnapshot { return structuredClone(this.state); }
  bind(handle: string): void { this.state.session.nativeHandle = handle; }
  accept(id: string, now = Date.now()): EngineTurn {
    if (this.state.turn && !this.state.turn.outcome) throw new Error("AGENT_BUSY");
    const turn: EngineTurn = { id, runId: randomUUID(), startedAt: now, phase: "preparing" };
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
    } else if (event.type === "item") {
      const index = this.state.items.findIndex(item => item.id === event.item.id);
      const old = this.state.items[index];
      // Late running states must not resurrect a closed item.
      if (old && old.status !== "running" && event.item.status === "running") return false;
      if (index < 0) this.state.items.push(structuredClone(event.item));
      else this.state.items[index] = structuredClone(event.item);
      turn.phase = event.item.kind === "approval" && event.item.status === "running" ? "waiting-approval" : "running";
    } else {
      turn.phase = "terminal";
      turn.outcome = event.outcome;
      turn.completedAt = event.ts;
      if (event.error) turn.error = event.error;
      for (const item of this.state.items) {
        if (item.status === "running") {
          item.status = event.outcome === "completed" ? "failed" : event.outcome;
          item.completedAt = event.ts;
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
