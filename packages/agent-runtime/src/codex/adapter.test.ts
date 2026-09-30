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
async function fixture(dataDir?: string, nativeTurns: any[] = []) {
  const dir = dataDir ?? await mkdtemp(join(tmpdir(), "nexus-contract-")); if (!dataDir) directories.push(dir);
  const config: CodexConfig = { sessionId: "s", dataDir: dir, workspace: join(dir, "workspace"), permissionMode: "ask", provider: { id: "p", name: "test", modelId: "m", apiKey: "transient-only", baseUrl: "http://127.0.0.1/v1", supportsReasoning: false, supportedThinkingLevels: [], modelConfig: { source: "generic", name: "m", baseUrl: "", reasoning: false, contextWindow: 32768, maxTokens: 8192, input: ["text", "image"] } } };
  let callbacks: any;
  const calls: Array<{ method: string; params: any }> = [];
  const replies: Array<{ id: any; result: any }> = [];
  let turnCounter = 0;
  const rpc: CodexRpc = { request: async (method, params) => {
    calls.push({ method, params });
    if (method === "thread/start" || method === "thread/resume") return { thread: { id: "native-s" } } as any;
    if (method === "thread/read") return { thread: { id: "native-s", turns: nativeTurns } } as any;
    if (method === "turn/start") { const id = "native-" + ++turnCounter; callbacks.event({ method: "turn/started", params: { threadId: "native-s", turn: { id } } }); return { turn: { id } } as any; }
    return {} as any;
  }, notify: () => undefined, reply: (id, result) => { replies.push({ id, result }); }, reject: (id, message) => { replies.push({ id, result: { error: message } }); }, close: async () => undefined };
  const events: AgentEventEnvelope[] = [];
  const adapter = new CodexAdapter(config, e => events.push(e), { launch: async () => ({ command: "fixture", args: [], cwd: config.workspace, env: {} }), transport: (_, cb) => { callbacks = cb; return rpc; } });
  adapters.push(adapter);
  const event = (method: string, params: any) => callbacks.event({ method, params: { threadId: "native-s", turnId: adapter.snapshot().turn?.nativeTurnId, ...params } });
  return { adapter, dir, config, calls, replies, events, rpc, event, request: (method: string, params: any) => callbacks.request({ id: "approval-1", method, params: { threadId: "native-s", turnId: adapter.snapshot().turn?.nativeTurnId, ...params } }), exit: () => callbacks.exit() };
}
const settle = async () => { await new Promise(resolve => setTimeout(resolve, 30)); };
describe("Codex adapter lifecycle", () => {
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
