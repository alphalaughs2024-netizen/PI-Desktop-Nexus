import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AgentEventEnvelope } from "@pi-desktop/shared";
import { CodexAdapter, CODEX_APPROVAL_TIMEOUT_MS } from "./adapter.js";
import { CodexSessionStore } from "./store.js";
import { nativePolicy, type CodexConfig } from "./config.js";
import type { CodexRpc } from "./transport.js";
const directories: string[] = [];
const adapters: CodexAdapter[] = [];
afterEach(async () => { vi.useRealTimers(); await Promise.all(adapters.splice(0).map(a => a.shutdown())); await Promise.all(directories.splice(0).map(p => rm(p, { recursive: true, force: true }))); });
async function fixture(dataDir?: string, nativeTurns: any[] = [], options: { steeringTimeoutMs?: number } = {}, overrides: Partial<CodexConfig> = {}) {
  const dir = dataDir ?? await mkdtemp(join(tmpdir(), "nexus-contract-")); if (!dataDir) directories.push(dir);
  const config: CodexConfig = { sessionId: "s", dataDir: dir, workspace: join(dir, "workspace"), permissionMode: "ask", provider: { id: "p", name: "test", modelId: "m", apiKey: "transient-only", baseUrl: "http://127.0.0.1/v1", supportsReasoning: false, supportedThinkingLevels: [], modelConfig: { source: "generic", name: "m", baseUrl: "", reasoning: false, contextWindow: 32768, maxTokens: 8192, input: ["text", "image"] } } };
  Object.assign(config, overrides);
  let callbacks: any;
  const calls: Array<{ method: string; params: any }> = [];
  const replies: Array<{ id: any; result: any }> = [];
  let turnCounter = 0;
  const rpc: CodexRpc = { request: async (method, params) => {
    calls.push({ method, params });
    if (method === "thread/start" || method === "thread/resume") return { thread: { id: "native-s" } } as any;
    if (method === "thread/read") return { thread: { id: "native-s", turns: nativeTurns } } as any;
    if (method === "turn/start") { const id = "native-" + ++turnCounter; callbacks.event({ method: "turn/started", params: { threadId: "native-s", turn: { id } } }); return { turn: { id } } as any; }
    if (method === "turn/steer") return { turnId: adapter.snapshot().turn?.nativeTurnId } as any;
    if (method === "turn/interrupt") { callbacks.event({ method: "turn/completed", params: { threadId: "native-s", turn: { id: adapter.snapshot().turn?.nativeTurnId, status: "interrupted" } } }); }
    return {} as any;
  }, notify: () => undefined, reply: (id, result) => { replies.push({ id, result }); }, reject: (id, message) => { replies.push({ id, result: { error: message } }); }, close: async () => undefined };
  const events: AgentEventEnvelope[] = [];
  const adapter = new CodexAdapter(config, e => events.push(e), { ...options, launch: async () => ({ command: "fixture", args: [], cwd: config.workspace, env: {} }), transport: (_, cb) => { callbacks = cb; return rpc; } });
  adapters.push(adapter);
  const event = (method: string, params: any) => callbacks.event({ method, params: { threadId: "native-s", turnId: adapter.snapshot().turn?.nativeTurnId, ...params } });
  return { adapter, dir, config, calls, replies, events, rpc, event, request: (method: string, params: any) => callbacks.request({ id: "approval-1", method, params: { threadId: "native-s", turnId: adapter.snapshot().turn?.nativeTurnId, ...params } }), exit: () => callbacks.exit() };
}
const settle = async () => { await new Promise(resolve => setTimeout(resolve, 30)); };
const runningTool = (f: Awaited<ReturnType<typeof fixture>>) => f.event("item/started", { item: { id: "running-command", type: "commandExecution", command: "long-running fixture" } });
describe("Codex adapter lifecycle", () => {
  it("switches model and provider between turns while resuming the same native history", async () => {
    const first = await fixture(); await first.adapter.start({ turnId: "first", text: "Remember emerald" }); await settle();
    first.event("item/completed", { item: { id: "old-answer", type: "agentMessage", text: "Remembered" } });
    first.event("turn/completed", { turn: { id: "native-1", status: "completed" } }); await settle();
    const handle = first.adapter.snapshot().session.nativeHandle; await first.adapter.shutdown();
    const switched = await fixture(first.dir, [], {}, { provider: { ...first.config.provider, id: "selected-provider", modelId: "selected-model" } });
    await switched.adapter.start({ turnId: "second", text: "What did I ask you to remember?" }); await settle();
    expect(switched.adapter.snapshot().session).toMatchObject({ nativeHandle: handle, providerId: "selected-provider", modelId: "selected-model" });
    expect(switched.calls.find(c => c.method === "thread/resume")?.params).toMatchObject({ threadId: handle, model: "selected-model" });
    expect(switched.calls.some(c => c.method === "thread/start")).toBe(false);
    expect(switched.calls.find(c => c.method === "turn/start")?.params.model).toBe("selected-model");
    expect(switched.events.some(e => e.event.type === "message_start" && e.event.message.content === "Remembered")).toBe(false);
  });
  it("keeps the workspace and engine recovery identity immutable", async () => {
    const first = await fixture(); await first.adapter.recover(); await first.adapter.shutdown();
    const changed = await fixture(first.dir, [], {}, { workspace: join(first.dir, "other-workspace") });
    await expect(changed.adapter.recover()).rejects.toThrow("CODEX_SESSION_BINDING_CHANGED");
    expect(changed.calls).toHaveLength(0);
  });
  it("interrupts active text generation and starts a corrected native segment in the original host turn", async () => {
    const f = await fixture(); await f.adapter.start({ turnId: "host", text: "Write a long answer" }); await settle();
    f.event("item/agentMessage/delta", { itemId: "old-text", delta: "partial old answer" });
    const before = f.adapter.snapshot().turn!;
    expect((await f.adapter.steer({ expectedTurnId: "host", text: "Reply EMERALD now", messageId: "correction" })).state).toBe("accepted");
    const after = f.adapter.snapshot();
    expect(after.turn).toMatchObject({ id: "host", runId: before.runId, startedAt: before.startedAt, nativeTurnId: "native-2" });
    expect(after.turn?.nativeSegments).toMatchObject([{ nativeTurnId: "native-1", outcome: "interrupted" }]);
    expect(after.items[0]).toMatchObject({ text: "partial old answer", status: "interrupted" });
    expect(f.calls.filter(c => c.method === "turn/interrupt")).toHaveLength(1);
    expect(f.calls.filter(c => c.method === "turn/steer")).toHaveLength(0);
    expect(f.calls.filter(c => c.method === "turn/start")[1].params).toMatchObject({ clientUserMessageId: "correction", input: [{ type: "text", text: "Reply EMERALD now" }] });
    f.event("item/agentMessage/delta", { turnId: "native-1", itemId: "old-text", delta: "late old content" });
    expect(f.adapter.snapshot().items[0].text).toBe("partial old answer");
    f.event("item/completed", { item: { id: "new-text", type: "agentMessage", text: "EMERALD" } });
    f.event("turn/completed", { turn: { id: "native-2", status: "completed" } }); await settle();
    expect(f.events.filter(e => e.event.type === "agent_end")).toHaveLength(1);
    expect(f.events.filter(e => e.event.type === "message_end" && e.event.message.id === "correction")).toHaveLength(1);
  });
  it("ignores a delayed initial start acknowledgement after advancing the native segment", async () => {
    const f = await fixture(); const original = f.rpc.request;
    let release!: () => void; let first = true;
    vi.spyOn(f.rpc, "request").mockImplementation(async (method, params) => {
      if (method === "turn/start" && first) {
        first = false; const result = await original(method, params);
        await new Promise<void>(resolve => { release = resolve; }); return result;
      }
      if (method === "turn/start") { release(); await settle(); }
      return original(method, params);
    });
    await f.adapter.start({ turnId: "host", text: "initial" }); await settle();
    expect((await f.adapter.steer({ expectedTurnId: "host", text: "correction" })).state).toBe("accepted");
    expect(f.adapter.snapshot().turn?.nativeTurnId).toBe("native-2");
  });
  it("fails the host once when interruption observes native failure", async () => {
    const f = await fixture(); await f.adapter.start({ turnId: "host", text: "initial" }); await settle();
    const original = f.rpc.request;
    vi.spyOn(f.rpc, "request").mockImplementation(async (method, params) => {
      if (method === "turn/interrupt") { f.event("turn/completed", { turn: { id: "native-1", status: "failed" } }); return {}; }
      return original(method, params);
    });
    expect((await f.adapter.steer({ expectedTurnId: "host", text: "correction" })).state).toBe("failed"); await settle();
    expect(f.adapter.snapshot().turn?.outcome).toBe("failed");
    expect(f.events.filter(e => e.event.type === "error")).toHaveLength(1);
    expect(f.calls.filter(c => c.method === "turn/start")).toHaveLength(1);
  });
  it("fails safely if the interrupt terminal arrives but its acknowledgement is lost", async () => {
    const f = await fixture(); await f.adapter.start({ turnId: "host", text: "initial" }); await settle();
    const original = f.rpc.request;
    vi.spyOn(f.rpc, "request").mockImplementation(async (method, params) => {
      if (method === "turn/interrupt") { await original(method, params); throw new Error("lost ack"); }
      return original(method, params);
    });
    expect((await f.adapter.steer({ expectedTurnId: "host", text: "correction" })).state).toBe("failed"); await settle();
    expect(f.adapter.getStatus().isRunning).toBe(false);
    expect(f.calls.filter(c => c.method === "turn/start")).toHaveLength(1);
  });
  it("retains reasoning effort and accepts a correction even when its native completion races acknowledgement", async () => {
    const f = await fixture(); f.config.provider.supportsReasoning = true; f.config.provider.supportedThinkingLevels = ["max"];
    await f.adapter.start({ turnId: "host", text: "initial", thinkingLevel: "max" }); await settle();
    const original = f.rpc.request;
    vi.spyOn(f.rpc, "request").mockImplementation(async (method, params) => {
      const result = await original(method, params);
      if (method === "turn/start") f.event("turn/completed", { turn: { id: "native-2", status: "completed" } });
      return result;
    });
    expect((await f.adapter.steer({ expectedTurnId: "host", text: "correction", messageId: "raced" })).state).toBe("accepted"); await settle();
    expect(f.calls.filter(c => c.method === "turn/start").map(c => c.params.effort)).toEqual(["max", "max"]);
    expect(f.events.filter(e => e.event.type === "agent_end")).toHaveLength(1);
    expect(f.events.filter(e => e.event.type === "message_end" && e.event.message.id === "raced")).toHaveLength(1);
  });
  it("does not stop a newer run when an older periodic save fails late", async () => {
    const f = await fixture(); await f.adapter.start({ turnId: "old-host", text: "initial" }); await settle();
    await new Promise(resolve => setTimeout(resolve, 170));
    let fail!: (error: Error) => void;
    const save = vi.spyOn(CodexSessionStore.prototype, "save").mockImplementationOnce(() => new Promise<void>((_, reject) => { fail = reject; }));
    const close = vi.spyOn(f.rpc, "close");
    try {
      vi.useFakeTimers(); f.event("item/agentMessage/delta", { itemId: "old-partial", delta: "old" });
      await vi.advanceTimersByTimeAsync(200); vi.useRealTimers();
      f.event("turn/completed", { turn: { id: "native-1", status: "completed" } }); await settle();
      await f.adapter.start({ turnId: "new-host", text: "new" }); await settle();
      fail(Object.assign(new Error("late old save"), { code: "ENOSPC" })); await settle();
      expect(f.adapter.snapshot().turn).toMatchObject({ id: "new-host", nativeTurnId: "native-2" });
      expect(f.adapter.getStatus().isRunning).toBe(true); expect(close).not.toHaveBeenCalled();
    } finally { vi.useRealTimers(); save.mockRestore(); }
  });
  it("stops owned execution after a timed snapshot failure even when the terminal save succeeds", async () => {
    const f = await fixture(); await f.adapter.start({ turnId: "host", text: "initial" }); await settle();
    await new Promise(resolve => setTimeout(resolve, 170));
    const close = vi.spyOn(f.rpc, "close");
    const save = vi.spyOn(CodexSessionStore.prototype, "save").mockRejectedValueOnce(Object.assign(new Error("full"), { code: "ENOSPC" }));
    try {
      vi.useFakeTimers(); f.event("item/agentMessage/delta", { itemId: "partial", delta: "unfinished" });
      await vi.advanceTimersByTimeAsync(200); vi.useRealTimers(); await settle();
      expect(close).toHaveBeenCalledOnce(); expect(f.adapter.snapshot().turn?.outcome).toBe("failed");
      expect(f.events.filter(e => e.event.type === "error")).toHaveLength(1);
      expect(f.events.find(e => e.event.type === "error")?.event).toMatchObject({ error: { code: "CODEX_RECOVERY_STORAGE_FULL" } });
      expect(f.events.some(e => e.event.type === "agent_end")).toBe(false);
    } finally { vi.useRealTimers(); save.mockRestore(); }
  });
  it("reports an explicit storage failure without a successful terminal signal", async () => {
    const f = await fixture(); await f.adapter.start({ turnId: "host", text: "initial" }); await settle();
    const save = vi.spyOn(CodexSessionStore.prototype, "save").mockRejectedValue(Object.assign(new Error("private filesystem detail"), { code: "ENOSPC" }));
    try {
      f.event("turn/completed", { turn: { id: "native-1", status: "completed" } }); await settle();
      const errors = f.events.filter(e => e.event.type === "error");
      expect(errors).toHaveLength(1);
      expect(errors[0].event).toMatchObject({ error: { code: "CODEX_RECOVERY_STORAGE_FULL", details: { filesystemCode: "ENOSPC" } } });
      expect(f.events.some(e => e.event.type === "agent_end")).toBe(false);
      expect(JSON.stringify(errors)).not.toContain("private filesystem detail");
    } finally { save.mockRestore(); }
  });
  it("serializes separate corrections without duplicate dispatch or resetting the user turn", async () => {
    const f = await fixture(); await f.adapter.start({ turnId: "host", text: "initial" }); await settle();
    const first = f.adapter.steer({ expectedTurnId: "host", text: "first", messageId: "one" });
    const second = f.adapter.steer({ expectedTurnId: "host", text: "second", messageId: "two" });
    expect((await first).state).toBe("accepted"); expect((await second).state).toBe("accepted");
    expect(f.calls.filter(c => c.method === "turn/start").map(c => c.params.input[0].text)).toEqual(["initial", "first", "second"]);
    expect(f.adapter.snapshot().turn?.nativeSegments).toHaveLength(2);
    expect(f.events.some(e => e.event.type === "agent_end")).toBe(false);
  });
  it("does not resubmit an instruction when native interruption is uncertain", async () => {
    const f = await fixture(); await f.adapter.start({ turnId: "host", text: "initial" }); await settle();
    const original = f.rpc.request;
    vi.spyOn(f.rpc, "request").mockImplementation((method, params) => method === "turn/interrupt" ? Promise.reject(new Error("lost interrupt acknowledgement")) : original(method, params));
    expect((await f.adapter.steer({ expectedTurnId: "host", text: "correction", messageId: "uncertain" })).state).toBe("failed");
    expect(f.calls.filter(c => c.method === "turn/start")).toHaveLength(1);
    expect(f.adapter.getStatus().isRunning).toBe(true);
  });
  it("requires the native interruption terminal before sending the correction", async () => {
    const f = await fixture(undefined, [], { steeringTimeoutMs: 20 }); await f.adapter.start({ turnId: "host", text: "initial" }); await settle();
    const original = f.rpc.request;
    vi.spyOn(f.rpc, "request").mockImplementation((method, params) => method === "turn/interrupt" ? Promise.resolve({}) : original(method, params));
    expect((await f.adapter.steer({ expectedTurnId: "host", text: "correction" })).state).toBe("failed");
    expect(f.calls.filter(c => c.method === "turn/start")).toHaveLength(1);
  });
  it("cancels during steering interruption without starting another native segment", async () => {
    const f = await fixture(); await f.adapter.start({ turnId: "host", text: "initial" }); await settle();
    const original = f.rpc.request;
    vi.spyOn(f.rpc, "request").mockImplementation((method, params) => method === "turn/interrupt" ? Promise.resolve({}) : original(method, params));
    const pending = f.adapter.steer({ expectedTurnId: "host", text: "correction" }); await settle();
    await f.adapter.interrupt(); expect((await pending).state).toBe("failed");
    expect(f.calls.filter(c => c.method === "turn/start")).toHaveLength(1);
    expect(f.adapter.snapshot().turn?.outcome).toBe("interrupted");
  });
  it("steers the guarded native turn without restarting execution and persists one user message", async () => {
    const f = await fixture(); await f.adapter.start({ turnId: "host-turn", text: "initial" }); await settle(); runningTool(f);
    expect(f.adapter.steeringContext("host-turn")).toMatchObject({ projectPath: f.config.workspace, supportsVision: false });
    const input = { expectedTurnId: "host-turn", text: "Use emerald instead", messageId: "steer-message" };
    const first = f.adapter.steer(input); const duplicate = f.adapter.steer(input);
    expect(await first).toEqual({ state: "accepted", sessionId: "s", expectedTurnId: "host-turn" }); expect(await duplicate).toEqual(await first);
    const calls = f.calls.filter(c => c.method === "turn/steer"); expect(calls).toHaveLength(1);
    expect(calls[0].params).toMatchObject({ threadId: "native-s", expectedTurnId: "native-1", clientUserMessageId: "steer-message", input: [{ type: "text", text: "Use emerald instead" }] });
    expect(f.calls.filter(c => c.method === "turn/start")).toHaveLength(1);
    expect(f.events.filter(e => e.event.type === "message_end" && e.event.message.id === "steer-message")).toHaveLength(1);
    expect(f.adapter.getStatus().isRunning).toBe(true);
  });
  it("flushes an accepted steering instruction before a racing terminal event", async () => {
    const f = await fixture(); await f.adapter.start({ turnId: "current", text: "initial" }); await settle(); runningTool(f);
    let acknowledge!: (value: any) => void;
    const original = f.rpc.request;
    vi.spyOn(f.rpc, "request").mockImplementation((method, params) => method === "turn/steer"
      ? new Promise(resolve => { acknowledge = resolve; }) : original(method, params));
    const pending = f.adapter.steer({ expectedTurnId: "current", text: "amend", messageId: "racing" }); await settle();
    f.event("turn/completed", { turn: { id: "native-1", status: "completed" } }); await settle();
    expect(f.events.some(e => e.event.type === "agent_end")).toBe(false);
    expect(await f.adapter.steer({ expectedTurnId: "current", text: "too late" })).toMatchObject({ state: "rejected", reason: "not_running" });
    acknowledge({ turnId: "native-1" }); expect((await pending).state).toBe("accepted"); await settle();
    const accepted = f.events.findIndex(e => e.event.type === "message_end" && e.event.message.id === "racing");
    const terminal = f.events.findIndex(e => e.event.type === "agent_end");
    expect(accepted).toBeGreaterThanOrEqual(0); expect(terminal).toBeGreaterThan(accepted);
    expect(f.events[accepted].event).toMatchObject({ message: { steering: true } });
    expect(f.events.filter(e => e.event.type === "agent_end")).toHaveLength(1);
  });

  it("cancels while completion waits for an uncertain steering acknowledgement", async () => {
    const f = await fixture(); await f.adapter.start({ turnId: "current", text: "initial" }); await settle(); runningTool(f);
    let rejectSteer!: (error: Error) => void;
    const original = f.rpc.request;
    vi.spyOn(f.rpc, "request").mockImplementation((method, params) => method === "turn/steer"
      ? new Promise((_, reject) => { rejectSteer = reject; }) : original(method, params));
    vi.spyOn(f.rpc, "close").mockImplementation(async () => { rejectSteer(new Error("transport closed")); });
    const pending = f.adapter.steer({ expectedTurnId: "current", text: "amend", messageId: "uncertain" }); await settle();
    f.event("turn/completed", { turn: { id: "native-1", status: "completed" } }); await settle();
    await f.adapter.interrupt(); expect((await pending).state).toBe("failed");
    expect(f.adapter.snapshot().turn?.outcome).toBe("interrupted");
    expect(f.events.some(e => e.event.type === "agent_end")).toBe(false);
    expect(f.events.filter(e => e.event.type === "error")).toHaveLength(1);
  });

  it("does not falsely accept a late steering acknowledgement after interruption", async () => {
    const f = await fixture(); await f.adapter.start({ turnId: "current", text: "initial" }); await settle(); runningTool(f);
    let acknowledge!: (value: any) => void;
    const original = f.rpc.request;
    vi.spyOn(f.rpc, "request").mockImplementation((method, params) => method === "turn/steer"
      ? new Promise(resolve => { acknowledge = resolve; }) : original(method, params));
    const pending = f.adapter.steer({ expectedTurnId: "current", text: "amend", messageId: "late" }); await settle();
    f.event("turn/completed", { turn: { id: "native-1", status: "interrupted" } }); await settle();
    acknowledge({ turnId: "native-1" }); expect((await pending).state).toBe("failed");
    expect(f.events.some(e => e.event.type === "message_end" && e.event.message.id === "late")).toBe(false);
    expect(f.adapter.snapshot().turn?.outcome).toBe("interrupted");
  });

  it("rejects stale, empty and completed steering before any native request", async () => {
    const f = await fixture(); await f.adapter.start({ turnId: "current", text: "initial" }); await settle();
    expect(await f.adapter.steer({ expectedTurnId: "old", text: "stale" })).toEqual({ state: "rejected", reason: "stale_turn" });
    expect(await f.adapter.steer({ expectedTurnId: "current", text: " " })).toEqual({ state: "rejected", reason: "invalid" });
    f.event("turn/completed", { turn: { id: "native-1", status: "completed" } }); await settle();
    expect(await f.adapter.steer({ expectedTurnId: "current", text: "too late" })).toEqual({ state: "rejected", reason: "not_running" });
    expect(f.calls.some(c => c.method === "turn/steer")).toBe(false);
  });
  it("retains uncertain steering failure without replay or a falsely accepted message", async () => {
    const f = await fixture(); await f.adapter.start({ turnId: "current", text: "initial" }); await settle(); runningTool(f);
    const original = f.rpc.request; const request = vi.spyOn(f.rpc, "request").mockImplementation(async (method, params) => {
      if (method === "turn/steer") throw new Error("connection lost after dispatch"); return original(method, params);
    });
    const input = { expectedTurnId: "current", text: "amend", messageId: "uncertain" };
    expect((await f.adapter.steer(input)).state).toBe("failed"); expect((await f.adapter.steer(input)).state).toBe("failed");
    expect(request.mock.calls.filter(c => c[0] === "turn/steer")).toHaveLength(1);
    expect(f.events.some(e => e.event.type === "message_end" && e.event.message.id === "uncertain")).toBe(false);
    expect(f.adapter.getStatus().isRunning).toBe(true);
  });

  it("sends the explicit Full access policy to the native thread", async () => {
    const f = await fixture(); f.config.permissionMode = "full-access";
    await f.adapter.start({ turnId: "full", text: "hi" }); await settle();
    expect(f.calls.find(c => c.method === "thread/start")?.params).toMatchObject({ approvalPolicy: "never", sandbox: "danger-full-access" });
  });
  it("passes the selected effort to each turn without changing session identity", async () => {
    const f = await fixture();
    f.config.provider.supportsReasoning = true;
    f.config.provider.supportedThinkingLevels = ["low", "medium", "max"];
    await f.adapter.start({ turnId: "low", text: "hi", thinkingLevel: "low" }); await settle();
    f.event("turn/completed", { turn: { id: "native-1", status: "completed" } }); await settle();
    await f.adapter.start({ turnId: "max", text: "next", thinkingLevel: "max" }); await settle();
    expect(f.calls.filter(c => c.method === "turn/start").map(c => c.params.effort)).toEqual(["low", "max"]);
    expect(f.adapter.snapshot().session.nativeHandle).toBe("native-s");
  });
  it("emits progress before inference and retains one durable turn identity across items", async () => {
    const f = await fixture(); await f.adapter.start({ turnId: "durable", text: "hello", images: [{ mimeType: "image/png", data: "actual-image" }] }); await settle();
    expect(f.events[0].event.type).toBe("status");
    expect(f.events.some(e => e.event.type === "status" && e.event.status.activity?.phase === "waiting-model")).toBe(true);
    const input = f.calls.find(c => c.method === "turn/start")!.params.input;
    expect(input[1].url).toBe("data:image/png;base64,actual-image");
    f.event("item/started", { item: { id: "answer", type: "agentMessage", text: "" } });
    f.event("item/agentMessage/delta", { itemId: "answer", delta: "part" });
    f.event("item/completed", { item: { id: "answer", type: "agentMessage", text: "complete answer" } });
    f.event("turn/completed", { turn: { id: "native-1", status: "completed" } }); await settle();
    expect(f.events.every(e => e.turnId === "durable")).toBe(true);
    expect(f.events.filter(e => e.event.type === "agent_end")).toHaveLength(1);
    expect(f.events.findIndex(e => e.event.type === "message_end")).toBeLessThan(f.events.findIndex(e => e.event.type === "agent_end"));
    expect(f.adapter.snapshot().items[0].text).toBe("complete answer");
  });
  it("closes unfinished tools clearly and ignores duplicate completion", async () => {
    const f = await fixture(); await f.adapter.start({ turnId: "t", text: "hi" }); await settle();
    f.event("item/started", { item: { id: "tool", type: "commandExecution", command: "run" } });
    f.event("turn/completed", { turn: { id: "native-1", status: "completed" } });
    f.event("turn/completed", { turn: { id: "native-1", status: "completed" } }); await settle();
    expect(f.adapter.snapshot().items[0].status).toBe("failed");
    expect(f.events.filter(e => e.event.type === "agent_end")).toHaveLength(1);
  });
  it("rejects delayed prior-turn events after a new turn starts", async () => {
    const f = await fixture(); await f.adapter.start({ turnId: "t1", text: "hi" }); await settle();
    f.event("turn/completed", { turn: { id: "native-1", status: "completed" } }); await settle();
    await f.adapter.start({ turnId: "t2", text: "next" }); await settle();
    f.event("item/agentMessage/delta", { turnId: "native-1", itemId: "late", delta: "stale" });
    f.event("turn/completed", { turnId: "native-1", turn: { id: "native-1", status: "completed" } });
    expect(f.adapter.snapshot().items).toHaveLength(0); expect(f.adapter.getStatus().isRunning).toBe(true);
  });
  it("maps failed native commands and raw patch failures without claiming success", async () => {
    const f = await fixture(); await f.adapter.start({ turnId: "t", text: "hi" }); await settle();
    f.event("item/completed", { item: { id: "cmd", type: "commandExecution", command: "run", exitCode: 1, aggregatedOutput: "stopped" } });
    f.event("rawResponseItem/completed", { item: { type: "custom_tool_call", call_id: "patch", name: "apply_patch", input: "patch content" } });
    f.event("rawResponseItem/completed", { item: { type: "custom_tool_call_output", call_id: "patch", output: "apply_patch verification failed: stale text" } });
    expect(f.adapter.snapshot().items.every(i => i.status === "failed")).toBe(true);
  });
  it("denies native approvals at the existing 120-second timeout", async () => {
    const f = await fixture(); await f.adapter.start({ turnId: "t", text: "hi" }); await settle(); vi.useFakeTimers();
    f.request("item/commandExecution/requestApproval", { itemId: "cmd", command: "outside" });
    expect(f.adapter.getStatus().pendingToolConfirmations).toBe(1);
    await vi.advanceTimersByTimeAsync(CODEX_APPROVAL_TIMEOUT_MS - 1); expect(f.replies).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1); expect(f.replies[0].result).toEqual({ decision: "decline" });
    expect(f.adapter.getStatus().pendingToolConfirmations).toBe(0);
  });
  it("keeps native user questions open until answered or interrupted", async () => {
    const f = await fixture(); await f.adapter.start({ turnId: "t", text: "hi" }); await settle(); vi.useFakeTimers();
    f.request("item/tool/requestUserInput", { itemId: "question", questions: [{ id: "q", question: "Choose", options: [{ label: "A" }, { label: "B" }] }] });
    await vi.advanceTimersByTimeAsync(CODEX_APPROVAL_TIMEOUT_MS * 2);
    expect(f.replies).toHaveLength(0);
    const e = f.events.find(e => e.event.type === "asktool_request")!.event as any;
    expect(f.adapter.resolveQuestion({ sessionId: "s", requestId: e.request.requestId, answers: [["B"]] })).toBe(true);
    expect(f.replies[0].result).toEqual({ answers: { q: { answers: ["B"] } } });
    expect(f.events.some(e => e.event.type === "tool_end")).toBe(true);
  });
  it("answers a native approval once and rejects stale answers", async () => {
    const f = await fixture(); await f.adapter.start({ turnId: "t", text: "hi" }); await settle();
    f.request("item/fileChange/requestApproval", { itemId: "patch", reason: "write" });
    const e = f.events.find(e => e.event.type === "tool_permission_request")!.event as any;
    expect(f.adapter.resolveApproval(e.request.requestId, "allow-once")).toBe(true);
    expect(f.adapter.resolveApproval(e.request.requestId, "allow-once")).toBe(false);
    expect(f.replies[0].result).toEqual({ decision: "accept" });
  });
  it("interrupts tools, retains partial output and rejects late completion", async () => {
    const f = await fixture(); await f.adapter.start({ turnId: "t", text: "hi" }); await settle();
    f.event("item/agentMessage/delta", { itemId: "answer", delta: "partial" });
    await f.adapter.interrupt(); f.event("turn/completed", { turn: { id: "native-1", status: "completed" } });
    expect(f.adapter.snapshot().turn?.outcome).toBe("interrupted");
    expect(f.adapter.snapshot().items[0].text).toBe("partial");
    expect(f.events.filter(e => e.event.type === "error")).toHaveLength(1);
    expect(f.calls.some(c => c.method === "turn/interrupt")).toBe(true);
  });
  it("preserves partial output when the engine process exits", async () => {
    const f = await fixture(); await f.adapter.start({ turnId: "t", text: "hi" }); await settle();
    f.event("item/agentMessage/delta", { itemId: "answer", delta: "partial" }); f.exit();
    await vi.waitFor(() => expect(f.events.filter(e => e.event.type === "error")).toHaveLength(1));
    expect(f.adapter.snapshot().turn?.outcome).toBe("failed");
    expect(f.adapter.snapshot().items[0].text).toBe("partial");
    expect(f.events.filter(e => e.event.type === "error")).toHaveLength(1);
  });
  it("reconstructs an uncertain snapshot without inference or replay", async () => {
    const f = await fixture(); await f.adapter.start({ turnId: "t", text: "hi" }); await settle();
    f.event("item/agentMessage/delta", { itemId: "answer", delta: "partial" });
    await new CodexSessionStore(f.dir, "s").save(f.adapter.snapshot());
    const recovered = await fixture(f.dir, [{ id: "native-1", status: "interrupted", items: [{ id: "answer", type: "agentMessage", text: "recovered partial" }] }]);
    await recovered.adapter.recover();
    expect(recovered.calls.some(c => c.method === "thread/resume")).toBe(true);
    expect(recovered.calls.some(c => c.method === "turn/start")).toBe(false);
    expect(recovered.events).toHaveLength(0);
    expect(recovered.adapter.snapshot().items[0].text).toBe("recovered partial");
    expect(recovered.adapter.snapshot().turn?.outcome).toBe("interrupted");
  });
  it("shows progress and cancels while initial connection is pending", async () => {
    const f = await fixture();
    const original = f.rpc.request;
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    f.rpc.request = async (method, params) => {
      if (method === "initialize") await gate;
      return original(method, params);
    };
    const pending = f.adapter.start({ turnId: "preparing", text: "hi" });
    await settle();
    expect(f.adapter.getStatus().currentTurnId).toBe("preparing");
    expect(f.events[0].event.type).toBe("status");
    await f.adapter.interrupt(); release();
    await expect(pending).rejects.toThrow("CODEX_CONNECT_INTERRUPTED");
    expect(f.calls.some(c => c.method === "turn/start")).toBe(false);
  });

  it("does not spawn a process after cancellation during local launch preparation", async () => {
    const f = await fixture();
    let release!: (value: any) => void;
    const launch = vi.fn(() => new Promise<any>(resolve => { release = resolve; }));
    const transport = vi.fn(() => f.rpc);
    const adapter = new CodexAdapter(f.config, () => undefined, { launch, transport }); adapters.push(adapter);
    const pending = adapter.start({ turnId: "cancelled", text: "hi" });
    const rejected = expect(pending).rejects.toMatchObject({ errorCode: "TURN_ABORTED" });
    await vi.waitFor(() => expect(launch).toHaveBeenCalledOnce());
    await adapter.interrupt();
    release({ command: "fixture", args: [], cwd: f.config.workspace, env: {} });
    await rejected;
    expect(transport).not.toHaveBeenCalled();
    expect(f.calls.some(c => c.method === "turn/start")).toBe(false);
  });
  it("closes a prepared tool bridge when launch fails without hiding the launch error", async () => {
    const f = await fixture();
    const close = vi.fn(async () => { throw new Error("cleanup failed"); });
    const adapter = new CodexAdapter(f.config, () => undefined, {
      tools: async () => ({ url: "http://127.0.0.1/mcp", token: "fixture", close }),
      launch: async () => { throw new Error("launch failed"); },
    }); adapters.push(adapter);
    await expect(adapter.recover()).rejects.toThrow("launch failed");
    expect(close).toHaveBeenCalledOnce();
  });
  it("closes both transport and tool bridge when initialization fails", async () => {
    const f = await fixture();
    const close = vi.fn(async () => undefined);
    const rpcClose = vi.spyOn(f.rpc, "close");
    vi.spyOn(f.rpc, "request").mockRejectedValue(new Error("initialize failed"));
    const adapter = new CodexAdapter(f.config, () => undefined, {
      tools: async () => ({ url: "http://127.0.0.1/mcp", token: "fixture", close }),
      launch: async () => ({ command: "fixture", args: [], cwd: f.config.workspace, env: {} }),
      transport: () => f.rpc,
    }); adapters.push(adapter);
    await expect(adapter.recover()).rejects.toThrow("initialize failed");
    expect(rpcClose).toHaveBeenCalledOnce();
    expect(close).toHaveBeenCalledOnce();
  });
  it("closes a late tool bridge without launching after preparation is cancelled", async () => {
    const f = await fixture();
    let release!: (value: any) => void;
    const tools = vi.fn(() => new Promise<any>(resolve => { release = resolve; }));
    const launch = vi.fn(async () => ({ command: "fixture", args: [], cwd: f.config.workspace, env: {} }));
    const close = vi.fn(async () => undefined);
    const adapter = new CodexAdapter(f.config, () => undefined, { tools, launch }); adapters.push(adapter);
    const pending = adapter.start({ turnId: "cancelled-bridge", text: "hi" });
    const rejected = expect(pending).rejects.toMatchObject({ errorCode: "TURN_ABORTED" });
    await vi.waitFor(() => expect(tools).toHaveBeenCalledOnce());
    await adapter.interrupt();
    release({ url: "http://127.0.0.1/mcp", token: "fixture", close });
    await rejected;
    expect(close).toHaveBeenCalledOnce();
    expect(launch).not.toHaveBeenCalled();
  });
  it("marks MCP errors failed and keeps encoded screenshots out of diagnostics and recovery", async () => {
    const f = await fixture();
    await f.adapter.start({ turnId: "host", text: "inspect browser" }); await settle();
    f.event("item/completed", { item: { id: "failed-tool", type: "mcpToolCall", tool: "browser_snapshot", status: "completed", result: { isError: true, content: [{ type: "text", text: "guest unavailable" }] } } });
    f.event("item/completed", { item: { id: "image-tool", type: "mcpToolCall", tool: "browser_screenshot", status: "completed", result: { content: [{ type: "image", mimeType: "image/png", data: "encoded-image-fixture" }] } } });
    f.event("turn/completed", { turn: { id: "native-1", status: "completed" } }); await settle();
    expect(f.adapter.snapshot().items.find(item => item.nativeId === "failed-tool")?.status).toBe("failed");
    expect(f.adapter.snapshot().items.find(item => item.nativeId === "image-tool")?.result).toMatchObject({ content: [{ mimeType: "image/png", imageDataOmitted: true }] });
    expect(JSON.stringify(f.events)).not.toContain("encoded-image-fixture");
    expect(JSON.stringify(await new CodexSessionStore(f.dir, "s").read())).not.toContain("encoded-image-fixture");
  });
  it("rejects simultaneous submissions during preparation", async () => {
    const f = await fixture();
    const first = f.adapter.start({ turnId: "first", text: "hi" });
    await expect(f.adapter.start({ turnId: "second", text: "hi" })).rejects.toThrow("AGENT_BUSY");
    await first;
  });
  it("keeps credentials out of recovery snapshots", async () => {
    const f = await fixture(); await f.adapter.recover();
    expect(JSON.stringify(await new CodexSessionStore(f.dir, "s").read())).not.toContain("transient-only");
  });
  it("keeps auto inside workspace sandbox without escalation approvals", () => {
    expect(nativePolicy("ask")).toEqual({ approvalPolicy: "on-request", sandbox: "read-only" });
    expect(nativePolicy("accept-edits")).toEqual({ approvalPolicy: "on-request", sandbox: "workspace-write" });
    expect(nativePolicy("auto")).toEqual({ approvalPolicy: "never", sandbox: "workspace-write" });
  });
});
