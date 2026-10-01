import { describe, expect, it } from "vitest";
import { ExecutionContract, MAX_TURN_PHASE_SPANS, recordProgressPhase } from "./contract.js";
import type { EngineEvent, EngineSession } from "@pi-desktop/shared";
const session: EngineSession = { sessionId: "s", engine: "codex", version: "0.157.1", workspace: "C:/workspace", providerId: "p", modelId: "m", capabilities: { imageInput: true, nativeTools: true, recovery: true, steering: false, browser: false, managedPreview: false } };
const fixture = () => { const contract = new ExecutionContract(session); const turn = contract.accept("t", 100); const event = (sequence: number, payload: any, runId = turn.runId): EngineEvent => ({ sessionId: "s", runId, sequence, ts: 200, ...payload }); return { contract, turn, event }; };
describe("execution contract", () => {
  it("restores yielded command observations and lets foreground activity own progress", () => {
    const { contract, event } = fixture();
    contract.apply(event(1, { type: "item", item: { id: "server", nativeId: "server", kind: "tool", label: "exec_command", status: "running", text: "server output", startedAt: 101, command: { processId: "123", yieldedAt: 150 } } }));
    const restored = new ExecutionContract(session, contract.snapshot());
    expect(restored.currentProgress()).toBe("waiting-model");
    restored.apply(event(2, { type: "item", item: { id: "answer", nativeId: "answer", kind: "assistant", label: "assistant", status: "running", text: "Checking", startedAt: 160 } }));
    expect(restored.currentProgress()).toBe("answering");
    restored.apply(event(3, { type: "terminal", outcome: "completed" }));
    expect(restored.snapshot().items[0]).toMatchObject({ status: "completed", completedAt: 150, command: { processId: "123", yieldedAt: 150 } });
    expect(restored.snapshot().items[0].command?.exitedAt).toBeUndefined();
  });
  it("reports native reasoning starts before text without inventing content and closes whole-turn timing", () => {
    const { contract, event } = fixture();
    expect(contract.currentProgress()).toBe("waiting-model");
    const item = { id: "reason", nativeId: "reason", kind: "reasoning", label: "reasoning", text: "", startedAt: 110, status: "running" };
    contract.apply(event(1, { type: "item", item }));
    expect(contract.snapshot().turn?.progressPhase).toBe("reasoning");
    expect(contract.snapshot().items[0].text).toBe("");
    contract.apply(event(2, { type: "item", item: { ...item, text: "Inspecting" } }));
    expect(contract.snapshot().turn?.progressPhase).toBe("reasoning");
    contract.apply(event(3, { type: "item", item: { ...item, text: "Inspecting", status: "completed" } }));
    expect(contract.snapshot().turn?.progressPhase).toBe("waiting-model");
    contract.apply(event(4, { type: "terminal", outcome: "interrupted", ts: 800 }));
    const turn = contract.snapshot().turn!;
    expect(turn.startedAt).toBe(100);
    expect(turn.completedAt).toBe(800);
    expect(turn.timeline?.at(-1)?.completedAt).toBe(800);
  });
  it("bounds metadata, retains the beginning and deduplicates sustained phases", () => {
    const { turn } = fixture();
    for (let i = 0; i < 600; i++) recordProgressPhase(turn, i % 2 ? "tool" : "waiting-model", 101 + i);
    expect(turn.timeline).toHaveLength(MAX_TURN_PHASE_SPANS);
    expect(turn.timeline?.[0]).toMatchObject({ phase: "preparing", startedAt: 100 });
    expect(turn.omittedSpans).toBe(601 - MAX_TURN_PHASE_SPANS);
    recordProgressPhase(turn, "retrying", 800, "x".repeat(1000));
    const length = turn.timeline!.length;
    recordProgressPhase(turn, "retrying", 900, "x".repeat(1000));
    expect(turn.timeline).toHaveLength(length);
    expect(turn.timeline!.at(-1)?.detail).toHaveLength(300);
  });
  it("admits exactly one running turn", () => { const { contract } = fixture(); expect(() => contract.accept("other")).toThrow("AGENT_BUSY"); });
  it("rejects stale generations, sessions and repeated or delayed sequence numbers", () => {
    const { contract, event } = fixture();
    expect(contract.apply(event(1, { type: "phase", phase: "running" }, "old"))).toBe(false);
    expect(contract.apply({ ...event(1, { type: "phase", phase: "running" }), sessionId: "other" })).toBe(false);
    expect(contract.apply(event(2, { type: "phase", phase: "running" }))).toBe(true);
    expect(contract.apply(event(2, { type: "phase", phase: "waiting-model" }))).toBe(false);
    expect(contract.apply(event(1, { type: "phase", phase: "waiting-model" }))).toBe(false);
    expect(contract.snapshot().turn?.phase).toBe("running");
  });
  it("rejects a different native turn without consuming its sequence", () => {
    const { contract, event } = fixture();
    contract.apply(event(1, { type: "phase", phase: "running", nativeTurnId: "native" }));
    expect(contract.apply(event(2, { type: "phase", phase: "running", nativeTurnId: "stale" }))).toBe(false);
    expect(contract.apply(event(2, { type: "phase", phase: "waiting-model", nativeTurnId: "native" }))).toBe(true);
  });
  it("advances an explicitly guarded native segment while preserving user turn identity", () => {
    const { contract, turn, event } = fixture();
    contract.apply(event(1, { type: "phase", phase: "running", nativeTurnId: "native-1" }));
    expect(contract.apply(event(2, { type: "native-segment", expectedNativeTurnId: "old", outcome: "interrupted" }))).toBe(false);
    expect(contract.apply(event(2, { type: "native-segment", expectedNativeTurnId: "native-1", outcome: "interrupted" }))).toBe(true);
    expect(contract.apply(event(3, { type: "phase", phase: "waiting-model", nativeTurnId: "native-2" }))).toBe(true);
    expect(contract.snapshot().turn).toMatchObject({ id: "t", runId: turn.runId, startedAt: 100, nativeTurnId: "native-2", nativeSegments: [{ nativeTurnId: "native-1", outcome: "interrupted", completedAt: 200 }] });
  });
  it.each(["completed", "failed", "interrupted"])("seals %s once and preserves partial items", outcome => {
    const { contract, event } = fixture();
    contract.apply(event(1, { type: "item", item: { id: "i", nativeId: "i", kind: "tool", label: "tool", status: "running", text: "partial", startedAt: 101 } }));
    expect(contract.apply(event(2, { type: "terminal", outcome }))).toBe(true);
    expect(contract.apply(event(3, { type: "terminal", outcome: "completed" }))).toBe(false);
    expect(contract.snapshot().items[0].text).toBe("partial");
    expect(contract.snapshot().items[0].status).toBe(outcome === "completed" ? "failed" : outcome);
    expect(contract.snapshot().turn?.completedAt).toBe(200);
  });
  it("does not resurrect a completed item", () => {
    const { contract, event } = fixture();
    const item = { id: "i", nativeId: "i", kind: "tool", label: "tool", text: "done", startedAt: 101 };
    contract.apply(event(1, { type: "item", item: { ...item, status: "completed" } }));
    expect(contract.apply(event(2, { type: "item", item: { ...item, status: "running" } }))).toBe(false);
    expect(contract.snapshot().sequence).toBe(1);
  });
  it("restores a snapshot without sharing mutable data", () => {
    const { contract, event } = fixture(); contract.apply(event(1, { type: "phase", phase: "waiting-model" }));
    const snapshot = contract.snapshot(); const restored = new ExecutionContract(session, snapshot);
    snapshot.turn!.phase = "terminal";
    expect(restored.snapshot().turn?.phase).toBe("waiting-model");
  });
});
