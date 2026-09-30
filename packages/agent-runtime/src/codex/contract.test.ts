import { describe, expect, it } from "vitest";
import { ExecutionContract } from "./contract.js";
import type { EngineEvent, EngineSession } from "@pi-desktop/shared";
const session: EngineSession = { sessionId: "s", engine: "codex", version: "0.157.1", workspace: "C:/workspace", providerId: "p", modelId: "m", capabilities: { imageInput: true, nativeTools: true, recovery: true, steering: false, browser: false, managedPreview: false } };
const fixture = () => { const contract = new ExecutionContract(session); const turn = contract.accept("t", 100); const event = (sequence: number, payload: any, runId = turn.runId): EngineEvent => ({ sessionId: "s", runId, sequence, ts: 200, ...payload }); return { contract, turn, event }; };
describe("execution contract", () => {
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
