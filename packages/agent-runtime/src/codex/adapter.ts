import { createHash, randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { APP_VERSION, nativeReviewChanges } from "@pi-desktop/shared";
import type { AgentEvent, AgentEventEnvelope, AgentStatus, AskToolResolution, SteerOutcome, EngineAdapter, EngineEvent, EngineItem, EngineOutcome, EngineSnapshot, ThinkingLevel, UiMessage } from "@pi-desktop/shared";
import { ExecutionContract } from "./contract.js";
import { CodexSessionStore, recoveryWriteError } from "./store.js";
import { nativeEffort, nativePolicy, prepareLaunch, sessionDescriptor, type CodexConfig, type CodexLaunch } from "./config.js";
import { needsOpenRouterBridge, startProviderBridge, type ProviderBridge } from "./openrouter-bridge.js";
import { priceWireUsage } from "./billing.js";
import { nexusToolDiagnostics, type NexusToolBridge } from "./nexus-tools.js";
import { AppServerTransport, type CodexRpc, type NativeEvent, type NativeRequest } from "./transport.js";
import { nativeContextUsage } from "./usage.js";
export const CODEX_APPROVAL_TIMEOUT_MS = 120_000;
export type CodexDependencies = {
  recordUsage?: (request: import("@pi-desktop/shared").UsageRequest) => Promise<unknown>;
  tools?: (snapshot: () => EngineSnapshot) => Promise<NexusToolBridge>;
  steeringTimeoutMs?: number;
  launch?: (config: CodexConfig, directory: string) => Promise<CodexLaunch>;
  transport?: (launch: CodexLaunch, callbacks: { event: (event: NativeEvent) => void; request: (request: NativeRequest) => void; exit: () => void }) => CodexRpc;
  beforeComplete?: (signal: AbortSignal) => Promise<string | undefined>;
  stopOwnedWork?: () => Promise<void>;
};
type Approval = { nativeId: string | number; itemId: string; timer?: NodeJS.Timeout; questions?: any[]; resolveLocal?: (answers: Array<string[] | null>) => void };
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
  private nexusToolBridge?: NexusToolBridge;
  private sequence = 0;
  private processGeneration = 0;
  private turnGeneration?: string;
  private cancelled = false;
  private ending?: Promise<void>;
  private starting?: Promise<void>;
  private checkpointTimer?: NodeJS.Timeout;
  private approvals = new Map<string, Approval>();
  private steeringMessages = new Map<string, Promise<SteerOutcome>>();
  private steeringQueue: Promise<void> = Promise.resolve();
  private turnEffort?: string;
  private steeringTransition?: { nativeTurnId: string; resolve: (status: string) => void; reject: (error: Error) => void };
  private rawCalls = new Map<string, { name: string; args: unknown }>();
  private restored = false;
  private reconstructing = false;
  private retiredTurns = new Set<string>();
  private disposed = false;
  private admission?: { id: string; startedAt: number };
  private turnLifetime = new AbortController();
  private usageWrites = new Set<Promise<void>>();
  private requestWrites = new Map<string, Promise<void>>();
  private usageWriteFailed = false;
  private claimedTools = new Set<string>();
  private toolItemWaiters = new Set<() => void>();
  private delegationActivity?: { phase: "waiting-subagents"; since: number; subagentCount: number };
  constructor(readonly config: CodexConfig, private emit: (event: AgentEventEnvelope) => void, private dependencies: CodexDependencies = {}) {
    this.contract = new ExecutionContract(sessionDescriptor(config));
    this.store = new CodexSessionStore(config.dataDir, config.sessionId);
  }
  snapshot(): EngineSnapshot { return this.contract.snapshot(); }
  executionSignal(): AbortSignal { return this.turnLifetime.signal; }
  async askQuestions(args: any, toolCallId: string): Promise<{ ok: boolean; content: unknown; isError?: boolean }> {
    const questions = args?.questions;
    if (!Array.isArray(questions) || !questions.length || questions.length > 20 || questions.some(q => !q || typeof q.question !== "string" || !q.question.trim() ||
      !Array.isArray(q.options) || !q.options.length || q.options.some((option: unknown) => typeof option !== "string" || !option.trim()))) return { ok: false, isError: true, content: "ASKTOOL_INVALID_ARGUMENT" };
    if (!this.activeTurnId()) return { ok: false, isError: true, content: "NEXUS_TOOL_TURN_INACTIVE" };
    const requestId = "codex:" + this.config.sessionId + ":" + randomUUID();
    const item = this.newItem("question:" + requestId, "approval", "asktool"); this.update(item);
    const answers = await new Promise<Array<string[] | null>>(resolve => {
      this.approvals.set(requestId, { nativeId: requestId, itemId: item.id, resolveLocal: resolve,
        questions: questions.map((q, index) => ({ ...q, id: String(index), options: q.options.map((label: string) => ({ label })) })) });
      this.event({ type: "asktool_request", request: { requestId, sessionId: this.config.sessionId, toolCallId, questions } }); this.status();
    });
    return { ok: !this.turnLifetime.signal.aborted, content: { questions, answers } };
  }
  activeTurnId(): string | undefined { const turn = this.snapshot().turn; return this.cancelled || this.disposed || turn?.outcome ? undefined : turn?.id; }
  setDelegationActivity(count: number): void {
    this.delegationActivity = count ? { phase: "waiting-subagents", since: this.delegationActivity?.since ?? Date.now(), subagentCount: count } : undefined;
    this.apply({ type: "phase", phase: "running", progressPhase: count ? "waiting-subagents" : this.contract.currentProgress() });
    this.status();
  }
  completeTask(itemId: string, result: unknown, failed: boolean): void {
    const item = this.snapshot().items.find(item => item.id === itemId && item.label === "Task");
    if (item) this.update({ ...item, result: { details: result }, status: failed ? "failed" : "completed", completedAt: Date.now() });
  }
  /** Stop all old execution before committing a durable mode/approval boundary. */
  async controlBoundary(itemId: string, prepare: () => Promise<{ result: unknown; text?: string; config?: Partial<CodexConfig> }>): Promise<void> {
    const turn = this.snapshot().turn;
    if (!turn?.nativeTurnId || !this.rpc || this.cancelled || this.ending || this.steeringTransition) throw new Error("CODEX_CONTROL_BOUNDARY_BUSY");
    let timer: NodeJS.Timeout | undefined;
    let transition!: NonNullable<CodexAdapter["steeringTransition"]>;
    const terminal = new Promise<string>((resolve, reject) => {
      transition = { nativeTurnId: turn.nativeTurnId!, resolve, reject };
      timer = setTimeout(() => reject(new Error("CODEX_CONTROL_INTERRUPT_TIMEOUT")), this.dependencies.steeringTimeoutMs ?? 30_000);
    });
    void terminal.catch(() => undefined);
    this.steeringTransition = transition;
    const check = () => { if (this.cancelled || this.disposed || this.snapshot().turn?.runId !== turn.runId || this.snapshot().turn?.outcome) throw new Error("CODEX_CONTROL_CANCELLED"); };
    try {
      await this.dependencies.stopOwnedWork?.();
      check();
      await this.rpc.request("turn/interrupt", { threadId: this.snapshot().session.nativeHandle, turnId: turn.nativeTurnId });
      const outcome = await terminal;
      if (outcome !== "interrupted" && outcome !== "completed") throw new Error("CODEX_CONTROL_NATIVE_FAILED");
      check();
      for (const item of this.snapshot().items) if (item.status === "running") this.update({ ...item, status: "interrupted", completedAt: Date.now() });
      this.retiredTurns.add(turn.nativeTurnId);
      if (!this.apply({ type: "native-segment", expectedNativeTurnId: turn.nativeTurnId, outcome })) throw new Error("CODEX_CONTROL_STALE_SEGMENT");
      this.steeringTransition = undefined;
      this.turnLifetime.abort();
      for (const id of [...this.approvals.keys()]) this.resolveApproval(id, "deny");
      await this.closeProcess();
      check();
      const prepared = await prepare();
      check();
      Object.assign(this.config, prepared.config);
      this.turnLifetime = new AbortController();
      this.contract = new ExecutionContract(sessionDescriptor(this.config), this.snapshot());
      const item = this.snapshot().items.find(item => item.id === itemId);
      if (item) this.update({ ...item, result: prepared.result, status: "completed", completedAt: Date.now() });
      await this.checkpoint();
      check();
      if (!prepared.text) { await this.end("completed"); return; }
      await this.connect();
      check();
      this.status();
      const started = await this.rpc!.request("turn/start", { threadId: this.snapshot().session.nativeHandle, model: this.config.provider.modelId,
        ...(this.turnEffort !== undefined ? { effort: this.turnEffort } : {}), input: [{ type: "text", text: prepared.text }] });
      check();
      if (!started.turn?.id) throw new Error("CODEX_CONTROL_START_ACK_INVALID");
      if (!this.snapshot().turn?.nativeTurnId) this.apply({ type: "phase", phase: "waiting-model", nativeTurnId: started.turn.id });
    } catch (error) {
      this.steeringTransition = undefined;
      await this.closeProcess();
      await this.end(this.cancelled ? "interrupted" : "failed", error instanceof Error ? error.message : "CODEX_CONTROL_FAILED");
      throw error;
    } finally { clearTimeout(timer); if (this.steeringTransition === transition) this.steeringTransition = undefined; }
  }
  claimToolItem(name: string, args: unknown): string {
    const normalized = (value: any): any => Array.isArray(value) ? value.map(normalized) : value && typeof value === "object"
      ? Object.fromEntries(Object.keys(value).sort().map(key => [key, normalized(value[key])])) : value;
    const canonical = (value: any): string => JSON.stringify(normalized(value));
    const item = this.snapshot().items.find(item => item.kind === "tool" && item.label === name && !this.claimedTools.has(item.id) &&
      canonical(typeof item.args === "string" ? JSON.parse(item.args) : item.args) === canonical(args));
    if (!item) throw new Error("CODEX_TOOL_ITEM_UNBOUND");
    this.claimedTools.add(item.id); return item.id;
  }
  async awaitToolItem(name: string, args: unknown): Promise<string> {
    const runId = this.snapshot().turn?.runId;
    const signal = this.executionSignal();
    // MCP HTTP and app-server notifications travel independently.
    return new Promise((resolve, reject) => {
      const finish = (id?: string, error?: Error) => {
        clearTimeout(timer);
        this.toolItemWaiters.delete(check);
        signal.removeEventListener("abort", check);
        if (error) reject(error); else resolve(id!);
      };
      const check = () => {
        if (signal.aborted || !this.activeTurnId() || this.snapshot().turn?.runId !== runId) {
          finish(undefined, new Error("NEXUS_TOOL_TURN_INACTIVE")); return;
        }
        try { finish(this.claimToolItem(name, args)); }
        catch (error) {
          if (!(error instanceof Error) || error.message !== "CODEX_TOOL_ITEM_UNBOUND") finish(undefined, error as Error);
        }
      };
      const timer = setTimeout(() => finish(undefined, new Error("CODEX_TOOL_ITEM_UNBOUND")), 5000);
      this.toolItemWaiters.add(check);
      signal.addEventListener("abort", check, { once: true });
      check();
    });
  }
  getStatus(): AgentStatus {
    const state = this.snapshot();
    const turn = state.turn;
    if (this.admission) return { sessionId: this.config.sessionId, modelId: this.config.provider.modelId, isRunning: true, currentTurnId: this.admission.id, pendingToolConfirmations: this.approvals.size, activity: { phase: "recovering", since: this.admission.startedAt }, execution: { session: state.session, sequence: 0,
      turn: { id: this.admission.id, runId: `${this.admission.id}:admission`, startedAt: this.admission.startedAt, phase: "recovering", progressPhase: "recovering" } } };
    return { execution: { session: state.session, turn: state.turn, sequence: state.sequence }, sessionId: this.config.sessionId, modelId: this.config.provider.modelId,
      isRunning: !!turn && !turn.outcome, currentTurnId: turn && !turn.outcome ? turn.id : undefined,
      pendingToolConfirmations: this.approvals.size,
      activity: this.delegationActivity ?? (turn && !turn.outcome && ["preparing", "recovering", "waiting-model"].includes(turn.phase) ? { phase: turn.phase as "preparing" | "recovering" | "waiting-model", since: turn.startedAt } : undefined),
    };
  }
  private event(event: AgentEvent): void {
    this.emit({ sessionId: this.config.sessionId, turnId: this.admission?.id ?? this.contract.turnId, ts: Date.now(), event });
  }
  private status(): void {
    this.event({ type: "status", status: this.getStatus() });
    const turn = this.getStatus().execution?.turn;
    if (!turn) return;
    const message: UiMessage = { id: `${turn.id}:execution`, turnId: turn.id, role: "assistant", content: "",
      createdAt: new Date().toISOString(), status: "complete", execution: turn,
      modelId: this.config.provider.modelId, providerId: this.config.provider.id };
    this.event({ type: turn.outcome ? "message_end" : "message_update", message });
  }
  private apply(payload: any): boolean {
    const runId = this.contract.activeRunId;
    if (!runId) return false;
    const event: EngineEvent = { ...payload, sessionId: this.config.sessionId, runId, sequence: ++this.sequence, ts: Date.now() };
    const applied = this.contract.apply(event);
    if (applied && !this.checkpointTimer) this.checkpointTimer = setTimeout(() => {
      this.checkpointTimer = undefined;
      const checkpoint = this.snapshot();
      void this.store.save(checkpoint).catch(async error => {
        const current = this.snapshot().turn;
        if (!current || current.outcome || current.runId !== checkpoint.turn?.runId) return;
        const failure = recoveryWriteError(error);
        // Stop owned execution before failing its visible turn; never leave hidden tools running.
        await this.closeProcess();
        await this.end("failed", failure.message, failure);
      });
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
      if (restored.session.sessionId !== expected.sessionId || restored.session.workspace !== expected.workspace || restored.session.engine !== expected.engine || restored.session.version !== expected.version) throw new Error("CODEX_SESSION_BINDING_CHANGED: start a new chat for a different workspace or engine version");
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
    let toolBridge: NexusToolBridge | undefined;
    let bridge: ProviderBridge | undefined;
    let rpc: CodexRpc | undefined;
    const checkPreparation = () => {
      if (preparationGeneration !== this.processGeneration || this.disposed) {
        throw Object.assign(new Error("CODEX_CONNECT_INTERRUPTED"), { errorCode: "TURN_ABORTED" });
      }
    };
    try {
      await mkdir(this.config.workspace, { recursive: true });
      checkPreparation();
      toolBridge = await this.dependencies.tools?.(() => this.snapshot());
      this.nexusToolBridge = toolBridge;
      checkPreparation();
      bridge = this.config.restrictedTools || !this.dependencies.launch
        ? await startProviderBridge(this.config.provider, {
          patchCompatibility: needsOpenRouterBridge(this.config.provider),
          ...(this.config.restrictedTools ? { allowedTools: new Set(this.config.restrictedTools.map(name => "mcp__nexus__" + name)) } : {}), maxRequests: this.config.maxModelRequests,
          maxOutputTokens: this.config.provider.modelConfig?.maxTokens,
          onPolicyFailure: code => { void this.end("failed", code).finally(() => this.closeProcess()); },
          usageSink: () => {
            const turnId = this.activeTurnId();
            if (!turnId || !this.dependencies.recordUsage) return undefined;
            return wire => {
              const previous = this.requestWrites.get(wire.id);
              const write = (async () => {
                await previous;
                const cost = await priceWireUsage(wire, this.config.provider);
                await this.dependencies.recordUsage!({ ...wire, ...cost, sessionId: this.config.sessionId, turnId,
                  providerId: this.config.provider.id, modelId: this.config.provider.modelId });
              })().catch(() => { this.usageWriteFailed = true; }).finally(() => {
                this.usageWrites.delete(write);
                if (wire.outcome !== "running" && this.requestWrites.get(wire.id) === write) this.requestWrites.delete(wire.id);
              });
              this.requestWrites.set(wire.id, write);
              this.usageWrites.add(write);
            };
          },
        })
        : undefined;
      this.providerBridge = bridge;
      checkPreparation();
      const launchConfig = { ...this.config, ...(toolBridge ? { toolBridge } : {}), ...(bridge ? { provider: { ...this.config.provider, baseUrl: bridge.url, apiKey: bridge.token, headers: undefined } } : {}) };
      const launch = await (this.dependencies.launch ?? prepareLaunch)(launchConfig, this.store.directory);
      checkPreparation();
      const generation = ++this.processGeneration;
      const callbacks = {
        event: (event: NativeEvent) => { if (generation === this.processGeneration) this.nativeEvent(event); },
        request: (request: NativeRequest) => { if (generation === this.processGeneration) this.nativeRequest(request); },
        exit: () => {
          if (generation !== this.processGeneration) return;
          this.rpc = undefined;
          void Promise.allSettled([bridge?.close(), toolBridge?.close()]);
          if (this.nexusToolBridge === toolBridge) this.nexusToolBridge = undefined;
          if (this.providerBridge === bridge) this.providerBridge = undefined;
          if (!this.admission && this.getStatus().isRunning) void this.end(this.cancelled ? "interrupted" : "failed", "CODEX_PROCESS_EXITED");
        },
      };
      rpc = this.dependencies.transport ? this.dependencies.transport(launch, callbacks) : new AppServerTransport(launch.command, launch.args, { cwd: launch.cwd, env: launch.env }, callbacks);
      this.rpc = rpc;
      await rpc.request("initialize", { clientInfo: { name: "nexus", version: APP_VERSION }, capabilities: { experimentalApi: true } });
      rpc.notify("initialized");
      const handle = this.snapshot().session.nativeHandle;
      const result = await rpc.request(handle ? "thread/resume" : "thread/start", {
        ...(handle ? { threadId: handle } : {}), cwd: this.config.workspace,
        model: this.config.provider.modelId, modelProvider: "nexus", ...nativePolicy(this.config.permissionMode),
        ...(this.config.developerInstructions ? { developerInstructions: this.config.developerInstructions } : {}),
        ephemeral: false, experimentalRawEvents: true,
      });
      if (generation !== this.processGeneration || this.disposed) throw new Error("CODEX_CONNECT_INTERRUPTED");
      this.contract.bind(result.thread.id);
      await this.checkpoint();
    } catch (error) {
      if (rpc && this.rpc === rpc) { ++this.processGeneration; this.rpc = undefined; }
      await Promise.allSettled([rpc?.close(), bridge?.close(), toolBridge?.close()]);
      if (this.nexusToolBridge === toolBridge) this.nexusToolBridge = undefined;
      if (this.providerBridge === bridge) this.providerBridge = undefined;
      throw error;
    }
  }
  async start(input: { turnId: string; text: string; acceptedAt?: number; thinkingLevel?: ThinkingLevel; images?: Array<{ mimeType: string; data: string }> }): Promise<{ accepted: boolean; turnId: string }> {
    if (this.disposed || this.starting || this.getStatus().isRunning) throw new Error("AGENT_BUSY");
    this.admission = { id: input.turnId, startedAt: input.acceptedAt ?? Date.now() };
    const recoveringAt = Date.now();
    this.cancelled = false;
    this.status();
    try {
      await this.recover();
      if (this.cancelled || this.disposed) throw Object.assign(new Error("Turn interrupted during preparation"), { errorCode: "TURN_ABORTED" });
    }
    catch (error) {
      const turn = this.getStatus().execution?.turn;
      if (turn) this.event({ type: "message_end", message: { id: `${turn.id}:execution`, turnId: turn.id, role: "assistant", content: "", status: "complete",
        createdAt: new Date().toISOString(), execution: { ...turn, phase: "terminal", outcome: this.cancelled ? "interrupted" : "failed", completedAt: Date.now() } } });
      this.admission = undefined; throw error;
    }
    const acceptedAt = this.admission.startedAt;
    this.admission = undefined;
    const previous = this.snapshot().turn?.nativeTurnId;
    if (previous) this.retiredTurns.add(previous);
    const turn = this.contract.accept(input.turnId, acceptedAt, recoveringAt);
    this.sequence = 0; this.cancelled = false; this.ending = undefined; this.turnGeneration = turn.runId; this.rawCalls.clear(); this.steeringMessages.clear(); this.steeringQueue = Promise.resolve();
    this.turnLifetime = new AbortController(); this.claimedTools.clear(); this.usageWriteFailed = false;
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
    this.turnEffort = effort;
    const images = input.images ?? [];
    if (images.length && !this.snapshot().session.capabilities.imageInput) throw new Error("CODEX_IMAGE_UNSUPPORTED: selected model is not configured for image input");
    this.apply({ type: "phase", phase: "waiting-model" }); this.status();
    const result = await this.rpc!.request("turn/start", {
      threadId: this.snapshot().session.nativeHandle, model: this.config.provider.modelId,
      ...(effort !== undefined ? { effort } : {}),
      input: [{ type: "text", text: input.text }, ...images.map(image => ({ type: "image", url: "data:" + image.mimeType + ";base64," + image.data }))],
    });
    if (run !== this.turnGeneration || this.snapshot().turn?.outcome) return;
    if (result.turn?.id && !this.retiredTurns.has(result.turn.id) && !this.snapshot().turn?.nativeTurnId) this.apply({ type: "phase", phase: "waiting-model", nativeTurnId: result.turn.id });
    if (this.cancelled) await this.interrupt();
  }
  steeringContext(expectedTurnId: string): { projectPath: string; supportsVision: boolean } {
    const state = this.snapshot();
    if (this.disposed) throw Object.assign(new Error("Nexus execution session unavailable"), { errorCode: "MISSING_SESSION" });
    if (state.turn?.id !== expectedTurnId) throw Object.assign(new Error("The response being updated is no longer active"), { errorCode: "STALE_TURN" });
    if (!this.rpc || this.cancelled || this.ending || this.steeringTransition || !state.turn.nativeTurnId || state.turn.outcome) throw Object.assign(new Error("No native turn available to steer"), { errorCode: "NOT_RUNNING" });
    // Text-only until attachment preparation is shared with native steering.
    return { projectPath: this.config.workspace, supportsVision: false };
  }
  steer(input: { expectedTurnId: string; text: string; messageId?: string }): Promise<SteerOutcome> {
    if (!input.text.trim()) return Promise.resolve({ state: "rejected", reason: "invalid" });
    const messageId = input.messageId ?? randomUUID();
    const key = input.expectedTurnId + ":" + messageId;
    const existing = this.steeringMessages.get(key); if (existing) return existing;
    const state = this.snapshot();
    if (this.disposed) return Promise.resolve({ state: "unavailable", reason: "missing_session" });
    if (state.turn?.id !== input.expectedTurnId) return Promise.resolve({ state: "rejected", reason: "stale_turn" });
    if (this.cancelled || this.ending || state.turn.outcome || !this.rpc) return Promise.resolve({ state: "rejected", reason: "not_running" });
    // Register before dispatch so terminal events can drain every admitted request.
    const pending = this.steeringQueue.then(() => this.sendSteer(input, messageId));
    this.steeringQueue = pending.then(() => undefined, () => undefined);
    this.steeringMessages.set(key, pending);
    return pending;
  }
  private async sendSteer(input: { expectedTurnId: string; text: string }, messageId: string): Promise<SteerOutcome> {
    try { this.steeringContext(input.expectedTurnId); }
    catch (error: any) { return error.errorCode === "STALE_TURN" ? { state: "rejected", reason: "stale_turn" } : error.errorCode === "NOT_RUNNING" ? { state: "rejected", reason: "not_running" } : { state: "unavailable", reason: "missing_session" }; }
    const turn = this.snapshot().turn!;
    const createdAt = new Date().toISOString();
    this.event({ type: "lifecycle", lifecycle: { id: randomUUID(), kind: "steering_requested", ts: Date.now(), turnId: turn.id } });
    try {
      const runningTool = this.snapshot().items.some(item => ["tool", "approval"].includes(item.kind) && item.status === "running");
      if (runningTool) {
        const result = await this.rpc!.request("turn/steer", { threadId: this.snapshot().session.nativeHandle, expectedTurnId: turn.nativeTurnId,
          clientUserMessageId: messageId, input: [{ type: "text", text: input.text }] });
        if (result.turnId !== turn.nativeTurnId) throw new Error("CODEX_STEERING_ACK_INVALID");
      } else await this.steerGeneration(input.text, messageId);
      if (this.snapshot().turn?.runId !== turn.runId) return { state: "rejected", reason: "stale_turn" };
      if (this.cancelled || this.snapshot().turn?.outcome) return { state: "failed", reason: "The turn ended before steering was recorded. No steering request was replayed." };
      const message: UiMessage = { id: messageId, turnId: turn.id, role: "user", content: input.text, createdAt, status: "complete", steering: true };
      this.event({ type: "message_start", message }); this.event({ type: "message_end", message });
      this.event({ type: "lifecycle", lifecycle: { id: randomUUID(), kind: "steering_accepted", ts: Date.now(), turnId: turn.id } });
      return { state: "accepted", sessionId: this.config.sessionId, expectedTurnId: turn.id };
    } catch (error: any) {
      this.event({ type: "lifecycle", lifecycle: { id: randomUUID(), kind: "steering_failed", ts: Date.now(), turnId: turn.id, reason: "Native steering failed; no request replayed." } });
      return { state: "failed", reason: this.getStatus().isRunning && !this.ending
        ? "Native steering was not confirmed. The current response may still be running; no request was replayed."
        : "Native steering was not confirmed. This response has stopped; no request was replayed." };
    }
  }
  /** Interrupt sampling only; native tools retain boundary steering above. */
  private async steerGeneration(text: string, messageId: string): Promise<void> {
    const turn = this.snapshot().turn!;
    const rpc = this.rpc!;
    let timer: NodeJS.Timeout | undefined;
    let transition!: NonNullable<CodexAdapter["steeringTransition"]>;
    let ended = false;
    let terminalStatus: string | undefined;
    const terminal = new Promise<string>((resolve, reject) => {
      transition = { nativeTurnId: turn.nativeTurnId!, resolve: status => { terminalStatus = status; resolve(status); }, reject };
      timer = setTimeout(() => reject(new Error("CODEX_STEERING_INTERRUPT_TIMEOUT")), this.dependencies.steeringTimeoutMs ?? 30_000);
    });
    // A failed interrupt acknowledgement must not leave an unhandled waiter.
    void terminal.catch(() => undefined);
    this.steeringTransition = transition;
    try {
      await rpc.request("turn/interrupt", { threadId: this.snapshot().session.nativeHandle, turnId: turn.nativeTurnId });
      const status = await terminal;
      ended = true;
      if (!["interrupted", "completed"].includes(status)) throw new Error("CODEX_STEERING_NATIVE_TURN_FAILED");
      if (this.cancelled || this.disposed || this.snapshot().turn?.runId !== turn.runId) throw new Error("CODEX_STEERING_CANCELLED");
      // Preserve partial output and any tool that raced interruption. Never replay it.
      for (const item of this.snapshot().items) if (item.status === "running") this.update({ ...item, status: "interrupted", completedAt: Date.now() });
      this.retiredTurns.add(turn.nativeTurnId!);
      if (!this.apply({ type: "native-segment", expectedNativeTurnId: turn.nativeTurnId, outcome: status })) throw new Error("CODEX_STEERING_STALE_SEGMENT");
      await this.checkpoint();
      this.steeringTransition = undefined;
      this.status();
      const result = await rpc.request("turn/start", { threadId: this.snapshot().session.nativeHandle, model: this.config.provider.modelId,
        ...(this.turnEffort !== undefined ? { effort: this.turnEffort } : {}),
        clientUserMessageId: messageId, input: [{ type: "text", text }] });
      if (this.cancelled || this.disposed || this.snapshot().turn?.runId !== turn.runId) throw new Error("CODEX_STEERING_CANCELLED");
      if (!result.turn?.id) throw new Error("CODEX_STEERING_START_ACK_INVALID");
      if (!this.snapshot().turn?.nativeTurnId) this.apply({ type: "phase", phase: "waiting-model", nativeTurnId: result.turn.id });
      if (this.snapshot().turn?.nativeTurnId !== result.turn.id) throw new Error("CODEX_STEERING_START_ACK_INVALID");
    } catch (error: any) {
      if ((ended || terminalStatus) && !this.cancelled) void this.end("failed", "Steering could not start the corrected response; no instruction or tool was replayed.");
      throw error;
    } finally {
      clearTimeout(timer);
      if (this.steeringTransition === transition) this.steeringTransition = undefined;
    }
  }
  private belongs(params: any): boolean {
    const nativeTurn = params.turnId ?? params.turn?.id;
    return (!nativeTurn || !this.retiredTurns.has(nativeTurn)) && this.contract.ownsNativeEvent(params.threadId, nativeTurn);
  }
  private nativeEvent({ method, params: p }: NativeEvent): void {
    if (!this.belongs(p)) return;
    if (method === "turn/started") { this.apply({ type: "phase", phase: "waiting-model", nativeTurnId: p.turn.id }); this.status(); }
    else if (method === "thread/tokenUsage/updated") {
      const contextUsage = nativeContextUsage(p.tokenUsage);
      if (contextUsage && this.apply({ type: "context-usage", contextUsage })) this.status();
    }
    else if (method === "turn/completed") {
      const transition = this.steeringTransition;
      if (transition && transition.nativeTurnId === p.turn.id) transition.resolve(p.turn.status);
      else void this.end(p.turn.status === "completed" ? "completed" : p.turn.status === "interrupted" ? "interrupted" : "failed", p.turn.error?.message);
    }
    else if (method === "error") {
      if (p.willRetry) { this.apply({ type: "phase", phase: "waiting-model", progressPhase: "retrying" }); this.status(); this.event({ type: "lifecycle", lifecycle: { id: randomUUID(), kind: "retry_started", ts: Date.now(), turnId: this.snapshot().turn?.id, reason: p.error?.message } }); }
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
    return { id: stableId(this.contract.turnId! + ":" + nativeId), nativeId, kind, label, text: "", status: "running", startedAt: Date.now() };
  }
  private nativeItem(native: any, completed: boolean): void {
    if (!native?.id || native.type === "userMessage") return;
    if (native.type === "contextCompaction") {
      this.apply({ type: "phase", phase: "running", progressPhase: completed ? "waiting-model" : "compacting" }); this.status(); return;
    }
    const kind: EngineItem["kind"] = native.type === "agentMessage" ? "assistant" : native.type === "reasoning" ? "reasoning" : "tool";
    const label = native.type === "commandExecution" ? "exec_command" : native.type === "fileChange" ? "apply_patch" : native.tool ?? native.type;
    const old = this.contract.item(native.id);
    if (old?.status !== "running") { if (old) return; }
    const base = old ?? this.newItem(native.id, kind, label);
    const text = kind === "reasoning" ? [...(native.summary ?? []), ...(native.content ?? [])].map((x: any) => typeof x === "string" ? x : x.text ?? "").join("\n") : native.text ?? native.aggregatedOutput ?? base.text;
    const failed = native.status === "failed" || native.status === "declined" || native.error || native.result?.isError === true || (typeof native.exitCode === "number" && native.exitCode !== 0);
    let toolResult = native.result;
    if (["Task", "TaskWait", "TaskList", "TaskStop"].includes(label) && toolResult?.content?.[0]?.type === "text") {
      try {
        const details = JSON.parse(toolResult.content[0].text);
        if (details && typeof details === "object" && (details.delegationId || Array.isArray(details.delegations) || Array.isArray(details.stopped))) toolResult = { ...toolResult, details };
      } catch { /* Failed tool text is not a delegation payload. */ }
    }
    // A reconstructed in-progress command is not evidence of process exit.
    if (native.type === "commandExecution" && native.status === "inProgress") completed = false;
    const processId = native.processId ?? base.command?.processId;
    this.update({ ...base, text, ...(processId ? { command: { ...base.command, processId: String(processId), ...(completed ? { exitedAt: Date.now(), ...(typeof native.exitCode === "number" ? { exitCode: native.exitCode } : {}) } : {}) } } : {}), args: native.command ? { command: native.command, cwd: native.cwd } : native.changes ?? native.arguments ?? base.args,
      result: native.type === "fileChange" && completed && !failed
        ? { details: { nativeFileChanges: nativeReviewChanges(native.changes) } }
        : nexusToolDiagnostics(native.aggregatedOutput ?? native.error ?? toolResult ?? native.changes ?? text),
      status: completed ? failed ? "failed" : "completed" : "running", ...(completed ? { completedAt: Date.now() } : {}) });
  }
  private raw(native: any): void {
    if (!native) return;
    if (["custom_tool_call", "function_call"].includes(native.type)) {
      const name = native.name;
      if (!["apply_patch", "write_stdin", "exec_command"].includes(name)) return;
      this.rawCalls.set(native.call_id, { name, args: native.input ?? native.arguments });
      // Native commandExecution owns command starts; raw exec events only identify returns.
      if (name !== "exec_command" && !this.contract.item(native.call_id)) this.update({ ...this.newItem(native.call_id, "tool", name), args: native.input ?? native.arguments });
    } else if (["custom_tool_call_output", "function_call_output"].includes(native.type)) {
      const call = this.rawCalls.get(native.call_id); if (!call) return;
      const old = this.contract.item(native.call_id); if (!old || old.status !== "running") return;
      const text = typeof native.output === "string" ? native.output : JSON.stringify(native.output);
      if (call.name === "exec_command") {
        // Match the engine's header, never process-looking text in command stdout.
        const header = text.split(/\r?\nOutput:\r?\n/, 1)[0];
        const yielded = /^Chunk ID: [^\r\n]+\r?\nWall time: [\d.]+ seconds\r?\nProcess running with session ID (\d+)(?:\r?\n|$)/.exec(header);
        if (yielded) this.update({ ...old, command: { processId: yielded[1], yieldedAt: Date.now() }, result: native.output });
        return;
      }
      const failed = /apply_patch verification failed|Failed to|Error:|exited with code [1-9]|exit code: [1-9]/i.test(text);
      this.update({ ...old, text, result: native.output, status: failed ? "failed" : "completed", completedAt: Date.now() });
    }
  }
  private update(item: EngineItem): void {
    const old = this.contract.item(item.nativeId);
    const phase = this.contract.progressPhase;
    if (!this.apply({ type: "item", item }) || this.reconstructing) return;
    for (const check of this.toolItemWaiters) check();
    if (phase !== this.contract.progressPhase) this.status();
    if (item.kind === "assistant" || item.kind === "reasoning") {
      const message: UiMessage = { id: item.id, role: "assistant", content: item.kind === "assistant" ? item.text : "", thinking: item.kind === "reasoning" ? item.text : undefined,
        turnId: this.contract.turnId, createdAt: new Date(item.startedAt).toISOString(), status: item.status === "running" ? "streaming" : item.status === "interrupted" ? "aborted" : item.status === "failed" ? "error" : "complete", modelId: this.config.provider.modelId, providerId: this.config.provider.id };
      if (!old) this.event({ type: "message_start", message });
      if (item.status === "running") this.event({ type: "message_update", message, ...(item.kind === "reasoning" ? { deltaThinking: item.text.slice(old?.text.length ?? 0) } : { deltaText: item.text.slice(old?.text.length ?? 0) }) });
      else this.event({ type: "message_end", message });
    } else if (item.kind === "tool" || item.kind === "approval") {
      if (!old) this.event({ type: "tool_start", toolCallId: item.id, toolName: item.label, args: item.args });
      if (item.status === "running") this.event({ type: "tool_update", toolCallId: item.id, partialResult: item.text });
      else this.event({ type: "tool_end", toolCallId: item.id, toolName: item.label, args: item.args, startedAt: item.startedAt, result: item.result ?? item.text, isError: item.status !== "completed" });
    }
  }
  private nativeRequest(request: NativeRequest): void {
    const p = request.params;
    if (!this.belongs(p)) { this.rpc?.reject(request.id, "Stale or inactive turn"); return; }
    if (!["item/commandExecution/requestApproval", "item/fileChange/requestApproval", "item/tool/requestUserInput"].includes(request.method)) {
      this.rpc?.reject(request.id, "Unsupported execution request: " + request.method); return;
    }
    const requestId = "codex:" + this.config.sessionId + ":" + randomUUID();
    const nativeId = "approval:" + String(request.id);
    const item = this.newItem(nativeId, "approval", request.method);
    this.update(item);
    const approval: Approval = { nativeId: request.id, itemId: nativeId, timer: request.method === "item/tool/requestUserInput" ? undefined : setTimeout(() => this.resolveApproval(requestId, "deny"), CODEX_APPROVAL_TIMEOUT_MS) };
    if (request.method === "item/tool/requestUserInput") {
      if ((p.questions ?? []).some((q: any) => q.isSecret)) { this.rpc?.reject(request.id, "Secret input is not supported in this question interface"); clearTimeout(approval.timer); this.update({ ...item, status: "failed", result: "Secret input is unsupported", completedAt: Date.now() }); return; }
      approval.questions = p.questions ?? [];
      this.approvals.set(requestId, approval);
      this.event({ type: "asktool_request", request: { requestId, sessionId: this.config.sessionId, toolCallId: item.id, questions: approval.questions!.map((q: any) => ({ question: q.question, options: (q.options ?? []).map((o: any) => o.label) })) } });
    } else {
      this.approvals.set(requestId, approval);
      const nativeArgs = this.contract.item(p.itemId)?.args;
      const commandArgs = nativeArgs && typeof nativeArgs === "object" && !Array.isArray(nativeArgs) ? nativeArgs as Record<string, unknown> : {};
      const edits = nativeReviewChanges(nativeArgs).map(({ path, oldPath, operation }) => ({ path, oldPath, operation }));
      this.event({ type: "tool_permission_request", request: { requestId, allowedDecisions: ["allow-once", "deny"], sessionId: this.config.sessionId, toolCallId: item.id,
        toolName: request.method.includes("commandExecution") ? "exec_command" : "apply_patch", argsPreview: { command: p.command ?? commandArgs.command, cwd: p.cwd ?? commandArgs.cwd, grantRoot: p.grantRoot, ...(edits.length ? { files: edits } : {}) }, risk: "high", reason: p.reason ?? "This action needs your approval under the current permission settings. Allow once applies only to this request." } });
    }
    this.status();
  }
  resolveApproval(requestId: string, decision: string): boolean {
    const approval = this.approvals.get(requestId); if (!approval) return false;
    if (decision !== "allow-once" && decision !== "deny" || approval.questions && decision !== "deny") throw new Error("NEXUS_APPROVAL_DECISION_UNSUPPORTED: answer using the actions offered by this request");
    clearTimeout(approval.timer); this.approvals.delete(requestId);
    const allowed = decision === "allow-once";
    try {
      if (approval.resolveLocal) approval.resolveLocal(approval.questions!.map(() => null));
      else this.rpc?.reply(approval.nativeId, approval.questions ? { answers: {} } : { decision: allowed ? "accept" : "decline" });
    } catch { /* engine may have exited */ }
    const item = this.contract.item(approval.itemId);
    if (item) this.update({ ...item, status: allowed ? "completed" : "failed", completedAt: Date.now(), result: allowed ? "Allowed once" : "Denied" });
    this.status(); return true;
  }
  resolveQuestion(resolution: AskToolResolution): boolean {
    const approval = this.approvals.get(resolution.requestId);
    if (!approval?.questions || resolution.sessionId !== this.config.sessionId) return false;
    if (!Array.isArray(resolution.answers) || resolution.answers.length !== approval.questions.length || resolution.answers.some((answer, index) =>
      answer !== null && (!Array.isArray(answer) || answer.some(value => typeof value !== "string") || !approval.questions![index].multiSelect && answer.length > 1))) throw new Error("ASKTOOL_INVALID_ARGUMENT");
    clearTimeout(approval.timer); this.approvals.delete(resolution.requestId);
    const answers: Record<string, { answers: string[] }> = {};
    approval.questions.forEach((q, index) => { answers[q.id] = { answers: resolution.answers[index] ?? [] }; });
    if (approval.resolveLocal) approval.resolveLocal(resolution.answers);
    else this.rpc?.reply(approval.nativeId, { answers });
    const item = this.contract.item(approval.itemId);
    if (item) this.update({ ...item, status: "completed", completedAt: Date.now(), result: "Question answered" });
    this.status(); return true;
  }
  private end(outcome: EngineOutcome, error?: string, recoveryFailure?: ReturnType<typeof recoveryWriteError>): Promise<void> {
    if (this.ending) return this.ending;
    if (!this.getStatus().isRunning) return Promise.resolve();
    this.ending = (async () => {
      // Keep the host turn owned until accepted steering messages are persisted.
      // Cancellation must remain prompt; transport shutdown rejects pending RPCs.
      if (outcome === "completed") await Promise.allSettled([...this.steeringMessages.values()]);
      if (outcome === "completed" && !this.cancelled && this.dependencies.beforeComplete) {
        try {
          const continuation = await this.dependencies.beforeComplete(this.turnLifetime.signal);
          if (continuation && !this.cancelled && !this.disposed) {
            const turn = this.snapshot().turn!;
            for (const item of this.snapshot().items) if (item.status === "running") this.update({ ...item, status: item.command?.yieldedAt !== undefined ? "completed" : "failed", completedAt: item.command?.yieldedAt ?? Date.now() });
            this.retiredTurns.add(turn.nativeTurnId!);
            if (!this.apply({ type: "native-segment", expectedNativeTurnId: turn.nativeTurnId, outcome: "completed" })) throw new Error("CODEX_DELEGATION_STALE_SEGMENT");
            await this.checkpoint();
            if (this.cancelled || this.disposed) throw new Error("CODEX_DELEGATION_CANCELLED");
            this.ending = undefined; this.status();
            const result = await this.rpc!.request("turn/start", { threadId: this.snapshot().session.nativeHandle, model: this.config.provider.modelId,
              ...(this.turnEffort !== undefined ? { effort: this.turnEffort } : {}), input: [{ type: "text", text: continuation }] });
            if (!this.snapshot().turn?.outcome && !this.snapshot().turn?.nativeTurnId && result.turn?.id && !this.retiredTurns.has(result.turn.id)) this.apply({ type: "phase", phase: "waiting-model", nativeTurnId: result.turn.id });
            return;
          }
        } catch (cause) { outcome = this.cancelled ? "interrupted" : "failed"; error = cause instanceof Error ? cause.message : "CODEX_DELEGATION_FAILED"; }
      }
      if (outcome === "completed" && this.cancelled) { outcome = "interrupted"; error = "Turn interrupted by user"; }
      if (outcome !== "completed") { this.turnLifetime.abort(); await this.dependencies.stopOwnedWork?.(); }
      if (outcome !== "completed") await this.closeProcess();
      await Promise.all([...this.usageWrites]);
      if (this.usageWriteFailed) this.event({ type: "message_end", message: { id: "usage-warning:" + this.snapshot().turn!.id, role: "system", content: "Some request usage could not be saved. Spend totals may be incomplete.", createdAt: new Date().toISOString(), status: "complete" } });
      for (const id of [...this.approvals.keys()]) this.resolveApproval(id, "deny");
      // Emit final partial item states before the terminal signal.
      for (const item of this.snapshot().items) if (item.status === "running" && item.kind !== "approval") this.update({ ...item, status: outcome === "completed" ? item.command?.yieldedAt !== undefined ? "completed" : "failed" : outcome, completedAt: item.command?.yieldedAt ?? Date.now() });
      if (!this.apply({ type: "terminal", outcome, error })) return;
      let persistenceError = recoveryFailure;
      try { await this.checkpoint(); } catch (cause) { persistenceError = recoveryWriteError(cause); }
      this.status();
      if (outcome === "completed" && !persistenceError) { this.event({ type: "turn_end" }); this.event({ type: "agent_end", messageIds: this.snapshot().items.filter(item => ["assistant", "reasoning"].includes(item.kind)).map(item => item.id) }); }
      else this.event({ type: "error", error: { code: persistenceError?.code ?? (outcome === "interrupted" ? "TURN_ABORTED" : "CODEX_RUNTIME_FAILED"), message: persistenceError?.message ?? error ?? (outcome === "interrupted" ? "Turn interrupted" : "Nexus execution failed"), ...(persistenceError ? { details: persistenceError.details } : {}), retriable: false } });
    })();
    return this.ending;
  }
  async interrupt(): Promise<void> {
    this.cancelled = true;
    this.turnLifetime.abort();
    await this.dependencies.stopOwnedWork?.();
    if (this.admission) { await this.closeProcess(); return; }
    for (const id of [...this.approvals.keys()]) this.resolveApproval(id, "deny");
    const state = this.snapshot();
    if (this.rpc && state.turn?.nativeTurnId && !state.turn.outcome) {
      try { await this.rpc.request("turn/interrupt", { threadId: state.session.nativeHandle, turnId: state.turn.nativeTurnId }); }
      catch { await this.closeProcess(); }
    } else if (this.starting || this.admission) await this.closeProcess();
    // A completing turn may be draining steering acknowledgements; close rejects
    // those waiters immediately rather than delaying cancellation until timeout.
    if (this.ending) await this.closeProcess();
    await this.end("interrupted", "Turn interrupted by user");
    // Closing the session-owned engine ensures native commands cannot outlive cancel.
    await this.closeProcess();
  }
  private async closeProcess(): Promise<void> {
    this.steeringTransition?.reject(new Error("CODEX_STEERING_TRANSPORT_CLOSED"));
    ++this.processGeneration; const rpc = this.rpc; const bridge = this.providerBridge; this.rpc = undefined; this.providerBridge = undefined;
    const tools = this.nexusToolBridge; this.nexusToolBridge = undefined;
    try { if (rpc) await rpc.close(); } finally { await Promise.allSettled([bridge?.close(), tools?.close()]); }
  }
  async shutdown(): Promise<void> {
    this.disposed = true;
    await this.interrupt();
    await this.closeProcess();
    clearTimeout(this.checkpointTimer);
  }
}
