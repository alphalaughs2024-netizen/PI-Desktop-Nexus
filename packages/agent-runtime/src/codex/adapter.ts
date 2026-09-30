import { createHash, randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { APP_VERSION } from "@pi-desktop/shared";
import type { AgentEvent, AgentEventEnvelope, AgentStatus, AskToolResolution, EngineAdapter, EngineEvent, EngineItem, EngineOutcome, EngineSnapshot, ThinkingLevel, UiMessage } from "@pi-desktop/shared";
import { ExecutionContract } from "./contract.js";
import { CodexSessionStore } from "./store.js";
import { nativeEffort, nativePolicy, prepareLaunch, sessionDescriptor, type CodexConfig, type CodexLaunch } from "./config.js";
import { needsOpenRouterBridge, startOpenRouterBridge, type ProviderBridge } from "./openrouter-bridge.js";
import { AppServerTransport, type CodexRpc, type NativeEvent, type NativeRequest } from "./transport.js";
export const CODEX_APPROVAL_TIMEOUT_MS = 120_000;
type Dependencies = {
  launch?: (config: CodexConfig, directory: string) => Promise<CodexLaunch>;
  transport?: (launch: CodexLaunch, callbacks: { event: (event: NativeEvent) => void; request: (request: NativeRequest) => void; exit: () => void }) => CodexRpc;
};
type Approval = { nativeId: string | number; itemId: string; timer?: NodeJS.Timeout; questions?: any[] };
const stableId = (id: string) => {
  const hash = createHash("sha256").update(id).digest("hex");
  return hash.slice(0, 8) + "-" + hash.slice(8, 12) + "-4" + hash.slice(13, 16) + "-a" + hash.slice(17, 20) + "-" + hash.slice(20, 32);
};
/** A native Codex process per Nexus session. No pi or endpoint fallback. */
export class CodexAdapter implements EngineAdapter {
  private contract: ExecutionContract;
  private store: CodexSessionStore;
  private rpc?: CodexRpc;
  private providerBridge?: ProviderBridge;
  private sequence = 0;
  private processGeneration = 0;
  private turnGeneration?: string;
  private cancelled = false;
  private ending?: Promise<void>;
  private starting?: Promise<void>;
  private checkpointTimer?: NodeJS.Timeout;
  private approvals = new Map<string, Approval>();
  private rawCalls = new Map<string, { name: string; args: unknown }>();
  private restored = false;
  private reconstructing = false;
  private retiredTurns = new Set<string>();
  private disposed = false;
  private admission?: { id: string; startedAt: number };
  constructor(readonly config: CodexConfig, private emit: (event: AgentEventEnvelope) => void, private dependencies: Dependencies = {}) {
    this.contract = new ExecutionContract(sessionDescriptor(config));
    this.store = new CodexSessionStore(config.dataDir, config.sessionId);
  }
  snapshot(): EngineSnapshot { return this.contract.snapshot(); }
  getStatus(): AgentStatus {
    const state = this.snapshot();
    const turn = state.turn;
    if (this.admission) return { sessionId: this.config.sessionId, modelId: this.config.provider.modelId, isRunning: true, currentTurnId: this.admission.id, pendingToolConfirmations: this.approvals.size, activity: { phase: "recovering", since: this.admission.startedAt }, execution: { session: state.session, sequence: state.sequence } };
    return { execution: { session: state.session, turn: state.turn, sequence: state.sequence }, sessionId: this.config.sessionId, modelId: this.config.provider.modelId,
      isRunning: !!turn && !turn.outcome, currentTurnId: turn && !turn.outcome ? turn.id : undefined,
      pendingToolConfirmations: this.approvals.size,
      activity: turn && !turn.outcome && ["preparing", "recovering", "waiting-model"].includes(turn.phase) ? { phase: turn.phase as "preparing" | "recovering" | "waiting-model", since: turn.startedAt } : undefined,
    };
  }
  private event(event: AgentEvent): void {
    const turn = this.snapshot().turn;
    this.emit({ sessionId: this.config.sessionId, turnId: this.admission?.id ?? turn?.id, ts: Date.now(), event });
  }
  private status(): void { this.event({ type: "status", status: this.getStatus() }); }
  private apply(payload: any): boolean {
    const turn = this.snapshot().turn;
    if (!turn || turn.outcome) return false;
    const event: EngineEvent = { ...payload, sessionId: this.config.sessionId, runId: turn.runId, sequence: ++this.sequence, ts: Date.now() };
    const applied = this.contract.apply(event);
    if (applied && !this.checkpointTimer) this.checkpointTimer = setTimeout(() => {
      this.checkpointTimer = undefined;
      void this.store.save(this.snapshot()).catch(() => this.end("failed", "CODEX_RECOVERY_WRITE_FAILED"));
    }, 150);
    return applied;
  }
  private async checkpoint(): Promise<void> {
    clearTimeout(this.checkpointTimer); this.checkpointTimer = undefined;
    await this.store.save(this.snapshot());
  }
  async recover(): Promise<EngineSnapshot> {
    if (this.starting || (!this.admission && this.getStatus().isRunning)) throw new Error("AGENT_BUSY");
    if (this.restored) return this.snapshot();
    const restored = await this.store.read();
    if (restored) {
      const expected = sessionDescriptor(this.config);
      if (restored.session.sessionId !== expected.sessionId || restored.session.workspace !== expected.workspace || restored.session.modelId !== expected.modelId || restored.session.providerId !== expected.providerId || restored.session.version !== expected.version) throw new Error("CODEX_SESSION_BINDING_CHANGED: start a new chat for a different workspace, provider or model");
      this.contract = new ExecutionContract(expected, restored);
      this.sequence = restored.sequence;
    }
    await this.connect();
    const state = this.snapshot();
    if (restored?.session.nativeHandle) {
      const result = restored.turn?.nativeTurnId
        ? await this.rpc!.request("thread/read", { threadId: state.session.nativeHandle, includeTurns: true })
        : { thread: { turns: [] } };
      if (state.turn && !state.turn.outcome) {
        const native = result.thread?.turns?.find((turn: any) => turn.id === state.turn!.nativeTurnId);
        // Native snapshots are read-only reconstruction; never restart an uncertain tool.
        this.reconstructing = true;
        try { for (const item of native?.items ?? []) this.nativeItem(item, true); }
        finally { this.reconstructing = false; }
        const outcome: EngineOutcome = native?.status === "completed" ? "completed" : native?.status === "failed" ? "failed" : "interrupted";
        this.apply({ type: "terminal", outcome, error: outcome === "completed" ? undefined : "Recovered after engine interruption; no actions replayed." });
        await this.checkpoint();
      }
    }
    this.restored = true;
    return this.snapshot();
  }
  private async connect(): Promise<void> {
    if (this.rpc) return;
    const preparationGeneration = this.processGeneration;
    await mkdir(this.config.workspace, { recursive: true });
    const bridge = !this.dependencies.launch && needsOpenRouterBridge(this.config.provider) ? await startOpenRouterBridge(this.config.provider) : undefined;
    this.providerBridge = bridge;
    let launch: CodexLaunch;
    try {
      const launchConfig = bridge ? { ...this.config, provider: { ...this.config.provider, baseUrl: bridge.url, apiKey: bridge.token, headers: undefined } } : this.config;
      launch = await (this.dependencies.launch ?? prepareLaunch)(launchConfig, this.store.directory);
    } catch (error) { await bridge?.close(); if (this.providerBridge === bridge) this.providerBridge = undefined; throw error; }
    if (preparationGeneration !== this.processGeneration || this.disposed) {
      await bridge?.close(); if (this.providerBridge === bridge) this.providerBridge = undefined;
      throw Object.assign(new Error("CODEX_CONNECT_INTERRUPTED"), { errorCode: "TURN_ABORTED" });
    }
    const generation = ++this.processGeneration;
    const callbacks = {
      event: (event: NativeEvent) => { if (generation === this.processGeneration) this.nativeEvent(event); },
      request: (request: NativeRequest) => { if (generation === this.processGeneration) this.nativeRequest(request); },
      exit: () => {
        if (generation !== this.processGeneration) return;
        this.rpc = undefined;
        void bridge?.close(); if (this.providerBridge === bridge) this.providerBridge = undefined;
        if (!this.admission && this.getStatus().isRunning) void this.end(this.cancelled ? "interrupted" : "failed", "CODEX_PROCESS_EXITED");
      },
    };
    const rpc = this.dependencies.transport ? this.dependencies.transport(launch, callbacks) : new AppServerTransport(launch.command, launch.args, { cwd: launch.cwd, env: launch.env }, callbacks);
    this.rpc = rpc;
    try {
      await rpc.request("initialize", { clientInfo: { name: "nexus", version: APP_VERSION }, capabilities: { experimentalApi: true } });
      rpc.notify("initialized");
      const handle = this.snapshot().session.nativeHandle;
      const result = await rpc.request(handle ? "thread/resume" : "thread/start", {
        ...(handle ? { threadId: handle } : {}), cwd: this.config.workspace,
        model: this.config.provider.modelId, modelProvider: "nexus", ...nativePolicy(this.config.permissionMode),
        ephemeral: false, experimentalRawEvents: true,
      });
      if (generation !== this.processGeneration || this.disposed) throw new Error("CODEX_CONNECT_INTERRUPTED");
      this.contract.bind(result.thread.id);
      await this.checkpoint();
    } catch (error) {
      ++this.processGeneration; this.rpc = undefined; await rpc.close(); await bridge?.close(); if (this.providerBridge === bridge) this.providerBridge = undefined; throw error;
    }
  }
  async start(input: { turnId: string; text: string; thinkingLevel?: ThinkingLevel; images?: Array<{ mimeType: string; data: string }> }): Promise<{ accepted: boolean; turnId: string }> {
    if (this.disposed || this.starting || this.getStatus().isRunning) throw new Error("AGENT_BUSY");
    this.admission = { id: input.turnId, startedAt: Date.now() };
    this.cancelled = false;
    this.status();
    try { await this.recover(); }
    catch (error) { this.admission = undefined; throw error; }
    const acceptedAt = this.admission.startedAt;
    this.admission = undefined;
    if (this.cancelled || this.disposed) throw Object.assign(new Error("Turn interrupted during preparation"), { errorCode: "TURN_ABORTED" });
    const previous = this.snapshot().turn?.nativeTurnId;
    if (previous) this.retiredTurns.add(previous);
    const turn = this.contract.accept(input.turnId, acceptedAt);
    this.sequence = 0; this.cancelled = false; this.ending = undefined; this.turnGeneration = turn.runId; this.rawCalls.clear();
    await this.checkpoint();
    this.event({ type: "agent_start" }); this.event({ type: "turn_start" }); this.status();
    this.starting = this.begin(input).finally(() => { this.starting = undefined; });
    void this.starting.catch(error => this.end(this.cancelled ? "interrupted" : "failed", String(error.message ?? error)));
    return { accepted: true, turnId: input.turnId };
  }
  private async begin(input: { turnId: string; text: string; thinkingLevel?: ThinkingLevel; images?: Array<{ mimeType: string; data: string }> }): Promise<void> {
    const run = this.turnGeneration;
    await this.connect();
    if (this.cancelled || run !== this.turnGeneration) return;
    const effort = nativeEffort(this.config.provider, input.thinkingLevel);
    const images = input.images ?? [];
    if (images.length && !this.snapshot().session.capabilities.imageInput) throw new Error("CODEX_IMAGE_UNSUPPORTED: selected model is not configured for image input");
    this.apply({ type: "phase", phase: "waiting-model" }); this.status();
    const result = await this.rpc!.request("turn/start", {
      threadId: this.snapshot().session.nativeHandle,
      ...(effort !== undefined ? { effort } : {}),
      input: [{ type: "text", text: input.text }, ...images.map(image => ({ type: "image", url: "data:" + image.mimeType + ";base64," + image.data }))],
    });
    if (run !== this.turnGeneration || this.snapshot().turn?.outcome) return;
    if (result.turn?.id && !this.snapshot().turn?.nativeTurnId) this.apply({ type: "phase", phase: "waiting-model", nativeTurnId: result.turn.id });
    if (this.cancelled) await this.interrupt();
  }
  private belongs(params: any): boolean {
    const state = this.snapshot();
    if (!state.turn || state.turn.outcome || (params.threadId && params.threadId !== state.session.nativeHandle)) return false;
    const nativeTurn = params.turnId ?? params.turn?.id;
    return !nativeTurn || (!this.retiredTurns.has(nativeTurn) && (!state.turn.nativeTurnId || nativeTurn === state.turn.nativeTurnId));
  }
  private nativeEvent({ method, params: p }: NativeEvent): void {
    if (!this.belongs(p)) return;
    if (method === "turn/started") { this.apply({ type: "phase", phase: "waiting-model", nativeTurnId: p.turn.id }); this.status(); }
    else if (method === "turn/completed") void this.end(p.turn.status === "completed" ? "completed" : p.turn.status === "interrupted" ? "interrupted" : "failed", p.turn.error?.message);
    else if (method === "error") {
      if (p.willRetry) { this.event({ type: "lifecycle", lifecycle: { id: randomUUID(), kind: "retry_started", ts: Date.now(), turnId: this.snapshot().turn?.id, reason: p.error?.message } }); }
      else void this.end("failed", p.error?.message ?? "CODEX_PROVIDER_FAILED");
    } else if (method === "item/started" || method === "item/completed") this.nativeItem(p.item, method === "item/completed");
    else if (method === "item/agentMessage/delta" || /reasoning\/.*Delta$/.test(method) || method === "item/commandExecution/outputDelta") {
      const old = this.contract.item(p.itemId);
      const kind = method.includes("reasoning") ? "reasoning" : method.includes("commandExecution") ? "tool" : "assistant";
      const item = old ?? this.newItem(p.itemId, kind, kind === "tool" ? "exec_command" : kind);
      if (item.status !== "running") return;
      this.update({ ...item, text: item.text + (p.delta ?? "") });
    } else if (method === "rawResponseItem/completed") this.raw(p.item ?? p.responseItem);
  }
  private newItem(nativeId: string, kind: EngineItem["kind"], label: string): EngineItem {
    return { id: stableId(this.snapshot().turn!.id + ":" + nativeId), nativeId, kind, label, text: "", status: "running", startedAt: Date.now() };
  }
  private nativeItem(native: any, completed: boolean): void {
    if (!native?.id || ["userMessage", "contextCompaction"].includes(native.type)) return;
    const kind: EngineItem["kind"] = native.type === "agentMessage" ? "assistant" : native.type === "reasoning" ? "reasoning" : "tool";
    const label = native.type === "commandExecution" ? "exec_command" : native.type === "fileChange" ? "apply_patch" : native.tool ?? native.type;
    const old = this.contract.item(native.id);
    if (old?.status !== "running") { if (old) return; }
    const base = old ?? this.newItem(native.id, kind, label);
    const text = kind === "reasoning" ? [...(native.summary ?? []), ...(native.content ?? [])].map((x: any) => typeof x === "string" ? x : x.text ?? "").join("\n") : native.text ?? native.aggregatedOutput ?? base.text;
    const failed = native.status === "failed" || native.status === "declined" || native.error || (typeof native.exitCode === "number" && native.exitCode !== 0);
    this.update({ ...base, text, args: native.command ? { command: native.command, cwd: native.cwd } : native.changes ?? native.arguments ?? base.args,
      result: native.aggregatedOutput ?? native.error ?? native.result ?? native.changes ?? text,
      status: completed ? failed ? "failed" : "completed" : "running", ...(completed ? { completedAt: Date.now() } : {}) });
  }
  private raw(native: any): void {
    if (!native) return;
    if (["custom_tool_call", "function_call"].includes(native.type)) {
      const name = native.name;
      if (!["apply_patch", "write_stdin"].includes(name)) return;
      this.rawCalls.set(native.call_id, { name, args: native.input ?? native.arguments });
      if (!this.contract.item(native.call_id)) this.update({ ...this.newItem(native.call_id, "tool", name), args: native.input ?? native.arguments });
    } else if (["custom_tool_call_output", "function_call_output"].includes(native.type)) {
      const call = this.rawCalls.get(native.call_id); if (!call) return;
      const old = this.contract.item(native.call_id); if (!old || old.status !== "running") return;
      const text = typeof native.output === "string" ? native.output : JSON.stringify(native.output);
      const failed = /apply_patch verification failed|Failed to|Error:|exited with code [1-9]|exit code: [1-9]/i.test(text);
      this.update({ ...old, text, result: native.output, status: failed ? "failed" : "completed", completedAt: Date.now() });
    }
  }
  private update(item: EngineItem): void {
    const old = this.contract.item(item.nativeId);
    if (!this.apply({ type: "item", item }) || this.reconstructing) return;
    if (item.kind === "assistant" || item.kind === "reasoning") {
      const message: UiMessage = { id: item.id, role: "assistant", content: item.kind === "assistant" ? item.text : "", thinking: item.kind === "reasoning" ? item.text : undefined,
        createdAt: new Date(item.startedAt).toISOString(), status: item.status === "running" ? "streaming" : item.status === "interrupted" ? "aborted" : item.status === "failed" ? "error" : "complete", modelId: this.config.provider.modelId, providerId: this.config.provider.id };
      if (!old) this.event({ type: "message_start", message });
      if (item.status === "running") this.event({ type: "message_update", message, ...(item.kind === "reasoning" ? { deltaThinking: item.text.slice(old?.text.length ?? 0) } : { deltaText: item.text.slice(old?.text.length ?? 0) }) });
      else this.event({ type: "message_end", message });
    } else if (item.kind === "tool" || item.kind === "approval") {
      if (!old) this.event({ type: "tool_start", toolCallId: item.id, toolName: item.label, args: item.args });
      if (item.status === "running") this.event({ type: "tool_update", toolCallId: item.id, partialResult: item.text });
      else this.event({ type: "tool_end", toolCallId: item.id, result: item.result ?? item.text, isError: item.status !== "completed" });
    }
  }
  private nativeRequest(request: NativeRequest): void {
    const p = request.params;
    if (!this.belongs(p)) { this.rpc?.reject(request.id, "Stale or inactive turn"); return; }
    if (!["item/commandExecution/requestApproval", "item/fileChange/requestApproval", "item/tool/requestUserInput"].includes(request.method)) {
      this.rpc?.reject(request.id, "Unsupported Codex request: " + request.method); return;
    }
    const requestId = "codex:" + this.config.sessionId + ":" + randomUUID();
    const nativeId = "approval:" + String(request.id);
    const item = this.newItem(nativeId, "approval", request.method);
    this.update(item);
    const approval: Approval = { nativeId: request.id, itemId: nativeId, timer: request.method === "item/tool/requestUserInput" ? undefined : setTimeout(() => this.resolveApproval(requestId, "deny"), CODEX_APPROVAL_TIMEOUT_MS) };
    if (request.method === "item/tool/requestUserInput") {
      if ((p.questions ?? []).some((q: any) => q.isSecret)) { this.rpc?.reject(request.id, "Secret input is not supported by this prototype"); clearTimeout(approval.timer); this.update({ ...item, status: "failed", result: "Secret input is unsupported", completedAt: Date.now() }); return; }
      approval.questions = p.questions ?? [];
      this.approvals.set(requestId, approval);
      this.event({ type: "asktool_request", request: { requestId, sessionId: this.config.sessionId, toolCallId: item.id, questions: approval.questions!.map((q: any) => ({ question: q.question, options: (q.options ?? []).map((o: any) => o.label) })) } });
    } else {
      this.approvals.set(requestId, approval);
      this.event({ type: "tool_permission_request", request: { requestId, allowedDecisions: ["allow-once", "deny"], sessionId: this.config.sessionId, toolCallId: item.id,
        toolName: request.method.includes("commandExecution") ? "exec_command" : "apply_patch", argsPreview: { command: p.command, cwd: p.cwd, reason: p.reason, grantRoot: p.grantRoot }, risk: "high", reason: p.reason ?? "Codex requests permission beyond the current sandbox. Allow once; session-wide escalation is not supported in this prototype." } });
    }
    this.status();
  }
  resolveApproval(requestId: string, decision: string): boolean {
    const approval = this.approvals.get(requestId); if (!approval) return false;
    clearTimeout(approval.timer); this.approvals.delete(requestId);
    const allowed = decision === "allow-once";
    try { this.rpc?.reply(approval.nativeId, approval.questions ? { answers: {} } : { decision: allowed ? "accept" : "decline" }); } catch { /* engine may have exited */ }
    const item = this.contract.item(approval.itemId);
    if (item) this.update({ ...item, status: allowed ? "completed" : "failed", completedAt: Date.now(), result: allowed ? "Allowed once" : "Denied" });
    this.status(); return true;
  }
  resolveQuestion(resolution: AskToolResolution): boolean {
    const approval = this.approvals.get(resolution.requestId);
    if (!approval?.questions || resolution.sessionId !== this.config.sessionId) return false;
    clearTimeout(approval.timer); this.approvals.delete(resolution.requestId);
    const answers: Record<string, { answers: string[] }> = {};
    approval.questions.forEach((q, index) => { answers[q.id] = { answers: resolution.answers[index] ?? [] }; });
    this.rpc?.reply(approval.nativeId, { answers });
    const item = this.contract.item(approval.itemId);
    if (item) this.update({ ...item, status: "completed", completedAt: Date.now(), result: "Question answered" });
    this.status(); return true;
  }
  private end(outcome: EngineOutcome, error?: string): Promise<void> {
    if (this.ending) return this.ending;
    if (!this.getStatus().isRunning) return Promise.resolve();
    this.ending = (async () => {
      for (const id of [...this.approvals.keys()]) this.resolveApproval(id, "deny");
      // Emit final partial item states before the terminal signal.
      for (const item of this.snapshot().items) if (item.status === "running" && item.kind !== "approval") this.update({ ...item, status: outcome === "completed" ? "failed" : outcome, completedAt: Date.now() });
      this.apply({ type: "terminal", outcome, error });
      let persistenceFailed = false;
      try { await this.checkpoint(); } catch { persistenceFailed = true; }
      this.status();
      if (outcome === "completed" && !persistenceFailed) { this.event({ type: "turn_end" }); this.event({ type: "agent_end", messageIds: this.snapshot().items.filter(item => ["assistant", "reasoning"].includes(item.kind)).map(item => item.id) }); }
      else this.event({ type: "error", error: { code: outcome === "interrupted" ? "TURN_ABORTED" : "CODEX_RUNTIME_FAILED", message: persistenceFailed ? "Engine recovery metadata could not be saved; partial chat output is retained." : error ?? (outcome === "interrupted" ? "Turn interrupted" : "Codex execution failed"), retriable: false } });
    })();
    return this.ending;
  }
  async interrupt(): Promise<void> {
    this.cancelled = true;
    if (this.admission) { await this.closeProcess(); return; }
    for (const id of [...this.approvals.keys()]) this.resolveApproval(id, "deny");
    const state = this.snapshot();
    if (this.rpc && state.turn?.nativeTurnId && !state.turn.outcome) {
      try { await this.rpc.request("turn/interrupt", { threadId: state.session.nativeHandle, turnId: state.turn.nativeTurnId }); }
      catch { await this.closeProcess(); }
    } else if (this.starting || this.admission) await this.closeProcess();
    await this.end("interrupted", "Turn interrupted by user");
    // Closing the session-owned engine ensures native commands cannot outlive cancel.
    await this.closeProcess();
  }
  private async closeProcess(): Promise<void> {
    ++this.processGeneration; const rpc = this.rpc; const bridge = this.providerBridge; this.rpc = undefined; this.providerBridge = undefined;
    try { if (rpc) await rpc.close(); } finally { await bridge?.close(); }
  }
  async shutdown(): Promise<void> {
    this.disposed = true;
    await this.interrupt();
    await this.closeProcess();
    clearTimeout(this.checkpointTimer);
  }
}
