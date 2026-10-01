import type { BrowserErrorCode, BrowserRequestContext, BrowserResult, BrowserWaitCondition, BrowserInteraction, BrowserScreenshotOptions } from "@pi-desktop/shared";
import type { BrowserHost, BrowserNavigateInput, BrowserTarget } from "./browser-host";
import { decideMode, decideNavigation } from "./browser-policy";

type BrowserCommand = "navigate" | "action" | "snapshot" | "screenshot" | "click" | "fill" | "evaluate" | "console" | "cdp" | "preview";
type BrowserContextInput = Partial<Omit<BrowserRequestContext, "requestId" | "browserId">> & { browserId?: string; snapshotId?: string; signal?: AbortSignal };
export type BrowserRecord = { browserId: BrowserRequestContext["browserId"]; ownerSessionId?: string; chromeSessionId?: string; state: "starting" | "ready" | "loading" | "unavailable" | "blocked" | "closed"; location?: string; createdAt: number; updatedAt: number; guestGeneration: number };

const MUTATIONS = new Set<BrowserCommand>(["navigate", "action", "click", "fill", "evaluate", "cdp", "preview"]);
const TIMEOUTS: Record<BrowserCommand, number> = { navigate: 20_000, action: 20_000, snapshot: 10_000, screenshot: 30_000, click: 10_000, fill: 10_000, evaluate: 10_000, console: 10_000, cdp: 10_000, preview: 20_000 };

function errorCode(error: unknown): BrowserErrorCode {
  const code = typeof error === "object" && error && "code" in error ? String((error as { code?: unknown }).code) : "";
  if (code === "UNAVAILABLE") return "BROWSER_UNAVAILABLE";
  if (code === "BROWSER_TAB_NOT_FOUND") return "BROWSER_TAB_NOT_FOUND";
  if (code === "BROWSER_STALE_REF" || code === "INVALID_ARGUMENT") return "BROWSER_STALE_REF";
  if (code === "BROWSER_INVALID_INPUT") return "BROWSER_INVALID_INPUT";
  if (code === "TIMEOUT") return "BROWSER_TIMEOUT";
  if (error instanceof Error && error.name === "TimeoutError") return "BROWSER_TIMEOUT";
  if (code === "PERMISSION_DENIED") return "BROWSER_POLICY_BLOCKED";
  return "BROWSER_UNKNOWN_ERROR";
}

export class BrowserBroker {
  private readonly mutationQueues = new Map<string, Promise<void>>();
  private readonly agentOperations = new Map<string, Set<AbortController>>();
  private sequence = 0;
  private pendingRequestCount = 0;
  private readonly browserId = "browser-core-1" as BrowserRequestContext["browserId"];
  private readonly createdAt = Date.now();
  private record: BrowserRecord = { browserId: this.browserId, state: "starting", createdAt: this.createdAt, updatedAt: this.createdAt, guestGeneration: 0 };
  private readonly snapshots = new Map<string, { snapshotId: string; generation: number; tree: string }>();
  private readonly host: BrowserHost;
  private readonly isCapabilityEnabled: () => boolean;
  private lastError?: { code: BrowserErrorCode; reason: string; at: number };
  constructor(host: BrowserHost, isCapabilityEnabled: () => boolean = () => true) { this.host = host; this.isCapabilityEnabled = isCapabilityEnabled; }

  private context(input?: BrowserContextInput): BrowserRequestContext {
    return { requestId: `browser-${++this.sequence}` as BrowserRequestContext["requestId"], sessionId: input?.sessionId ?? this.host.activeSessionId?.() ?? "", turnId: input?.turnId, effectiveAgentId: input?.effectiveAgentId, mode: input?.mode ?? "agent", permissionEpoch: input?.permissionEpoch ?? 0, actor: input?.actor ?? "agent", browserId: (input?.browserId ?? this.host.activeBrowserId?.(input?.sessionId) ?? this.browserId) as BrowserContextInput["browserId"] as BrowserRequestContext["browserId"] };
  }

  listTabs(sessionId?: string): BrowserRecord[] {
    const tabs = this.host.listTabs?.();
    if (!tabs) return [{ ...this.record }];
    return tabs.filter((tab) => sessionId === undefined || tab.sessionId === sessionId).map((tab) => ({ browserId: tab.browserId as BrowserRequestContext["browserId"], ownerSessionId: tab.sessionId, state: tab.state?.isLoading ? "loading" : tab.state?.url ? "ready" : "starting", location: tab.state?.url, createdAt: this.createdAt, updatedAt: Date.now(), guestGeneration: tab.generation }));
  }
  diagnostics(): Record<string, unknown> { return { capabilityEnabled: this.isCapabilityEnabled(), readiness: this.record.state, browserId: this.browserId, guestGeneration: this.record.guestGeneration, chromeSessionId: this.record.chromeSessionId, pendingRequestCount: this.pendingRequestCount, activeQueueCount: this.mutationQueues.size, compatibilityAdapter: "available", ...(this.lastError ? { lastErrorCode: this.lastError.code, lastErrorReason: this.lastError.reason, safeSuggestedAction: "Retry or inspect the Browser panel." } : {}) }; }
  private async captureSnapshot(target: BrowserTarget, includeUnchanged = false) {
    const result = await this.host.snapshot(target);
    const key = JSON.stringify([target.sessionId, target.browserId]);
    const tree = result.unchanged ? this.snapshots.get(key)?.tree ?? result.tree : result.tree;
    if (result.snapshotId) this.snapshots.set(key, { snapshotId: result.snapshotId, generation: result.documentGeneration ?? 0, tree });
    return includeUnchanged ? { ...result, tree } : result;
  }
  open(url?: BrowserNavigateInput, context?: BrowserContextInput) { return this.navigate(url ?? { url: "about:blank" }, context?.sessionId, context); }
  wait(condition: BrowserWaitCondition, context?: BrowserContextInput, timeoutMs = 10_000) { return this.run("snapshot", async (target) => {
    if (!condition || !["page_load", "url", "text"].includes(condition.kind) || condition.kind !== "page_load" && (typeof condition.value !== "string" || !condition.value || condition.value.length > 4000) || condition.kind === "url" && !["equals", "contains"].includes(condition.match)) throw Object.assign(new Error("Invalid Browser wait condition"), { code: "BROWSER_INVALID_INPUT" });
    const deadline = Date.now() + Math.min(25_000, Math.max(250, Number(timeoutMs) || 10_000));
    while (Date.now() < deadline) {
      target.signal?.throwIfAborted();
      const state = this.host.getState(target);
      if (condition.kind === "page_load" && state?.url && !state.isLoading) return this.captureSnapshot(target);
      if (condition.kind === "url" && state?.url && (condition.match === "equals" ? state.url === condition.value : state.url.includes(condition.value))) return this.captureSnapshot(target);
      if (condition.kind === "text") { const snapshot = await this.captureSnapshot(target, true); if (snapshot.tree.includes(condition.value)) return snapshot; }
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    throw Object.assign(new Error("Browser wait timed out"), { code: "TIMEOUT" });
  }, context, false, Math.min(25_000, Math.max(250, Number(timeoutMs) || 10_000)) + 1_000); }
  type(uid: string | undefined, text: string, clearFirst = false, context?: BrowserContextInput) { return this.refAction("fill", uid, (target) => this.host.type(uid, text, clearFirst, target), context); }
  keypress(uid: string | undefined, key: string, modifiers: string[] = [], context?: BrowserContextInput) { return this.refAction("click", uid, (target) => this.host.keypress(uid, key, modifiers, target), context); }

  private async run<T>(command: BrowserCommand, work: (target: BrowserTarget) => Promise<T>, contextInput?: BrowserContextInput, serialize = true, timeoutMs = TIMEOUTS[command]): Promise<BrowserResult<T>> {
    const context = this.context(contextInput);
    const controller = new AbortController();
    const signal = contextInput?.signal ? AbortSignal.any([contextInput.signal, controller.signal]) : controller.signal;
    let dispatched = false;
    const cancelled = (): BrowserResult<T> => ({ requestId: context.requestId, ok: false,
      code: dispatched && MUTATIONS.has(command) ? "BROWSER_POSSIBLY_APPLIED" : "BROWSER_CANCELLED",
      retryable: false, possiblyApplied: dispatched && MUTATIONS.has(command),
      message: dispatched && MUTATIONS.has(command) ? "Browser work was cancelled after dispatch. The action may have reached the page; inspect it before retrying." : "Browser work was cancelled." });
    if (signal?.aborted) return cancelled();
    const key = JSON.stringify([context.sessionId, context.browserId]);
    if (!this.isCapabilityEnabled()) return { requestId: context.requestId, ok: false, code: "BROWSER_POLICY_BLOCKED", retryable: false, message: "Browser is disabled by the core capability setting. Re-enable Browser in Settings and retry." };
    const admission = decideMode(context.mode, command);
    if (!admission.allowed) return { requestId: context.requestId, ok: false, code: admission.code, retryable: false, message: admission.message };
    let target: BrowserTarget;
    try {
      target = { ...(this.host.resolveTarget?.(context.sessionId, context.browserId, !contextInput?.browserId) ?? { sessionId: context.sessionId, browserId: context.browserId }), signal };
    } catch (error) {
      const code = errorCode(error);
      const availableBrowserIds = this.listTabs(context.sessionId).map(tab => tab.browserId);
      return { requestId: context.requestId, ok: false, code, retryable: false,
        ...(code === "BROWSER_TAB_NOT_FOUND" ? { availableBrowserIds } : {}),
        message: code === "BROWSER_TAB_NOT_FOUND" ? "The requested Browser tab is unavailable in this chat. Omit browserId to use this chat's active tab, or use an ID from browser_list_tabs." : error instanceof Error ? error.message : "Browser target is unavailable" };
    }
    let completion: Promise<unknown> | undefined;
    const execute = async (): Promise<BrowserResult<T>> => {
      if (signal?.aborted) return cancelled();
      if (!this.isCapabilityEnabled()) return { requestId: context.requestId, ok: false, code: "BROWSER_POLICY_BLOCKED", retryable: false, message: "Browser is disabled by the core capability setting. Re-enable Browser in Settings and retry." };
      const policy = decideMode(context.mode, command); if (!policy.allowed) { this.lastError = { code: policy.code, reason: policy.reason, at: Date.now() }; return { requestId: context.requestId, ok: false, code: policy.code, retryable: false, message: policy.message }; }
      if (context.actor !== "user" && MUTATIONS.has(command) && this.host.isPaused?.(target)) return { requestId: context.requestId, ok: false, code: "BROWSER_POLICY_BLOCKED", retryable: false, message: "The user has taken control of this tab. Wait for them to resume agent control." };
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        this.record = { ...this.record, state: command === "navigate" || command === "action" ? "loading" : this.record.state, ownerSessionId: context.sessionId || this.record.ownerSessionId, updatedAt: Date.now() };
        dispatched = true;
        completion = work(target);
        const result = await Promise.race([completion as Promise<T>, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(Object.assign(new Error("Browser command timed out"), { code: "TIMEOUT" })), timeoutMs); })]);
        this.record = { ...this.record, state: "ready", updatedAt: Date.now() };
        return { requestId: context.requestId, browserId: target.browserId as BrowserRequestContext["browserId"], ok: true, result };
      } catch (error) {
        const code = errorCode(error); this.lastError = { code, reason: error instanceof Error ? error.name : "unknown", at: Date.now() };
        const timeout = code === "BROWSER_TIMEOUT";
        this.record = { ...this.record, state: timeout ? "unavailable" : this.record.state, updatedAt: Date.now() };
        return { requestId: context.requestId, ok: false, code: timeout && MUTATIONS.has(command) ? "BROWSER_POSSIBLY_APPLIED" : timeout ? "BROWSER_TIMEOUT" : code, retryable: !MUTATIONS.has(command), possiblyApplied: timeout && MUTATIONS.has(command), message: timeout && MUTATIONS.has(command) ? `The Browser action may have reached the page. Take a fresh snapshot before retrying. ${error instanceof Error ? error.message.slice(0, 4000) : ""}` : timeout ? "The Browser command timed out before dispatch completed. Retry is safe." : error instanceof Error ? error.message : "Browser command failed." };
      } finally { if (timer) clearTimeout(timer); }
    };
    const raceCancellation = async (operation: Promise<BrowserResult<T>>) => {
      if (!signal) return operation;
      let onAbort!: () => void;
      try {
        return await Promise.race([operation, new Promise<BrowserResult<T>>(resolve => {
          onAbort = () => {
            // Only loads can be stopped; arbitrary page JS may already have applied.
            if (dispatched && ["navigate", "preview", "action"].includes(command)) {
              try { this.host.action("stop", target.sessionId, target.browserId, { ...target, signal: undefined }); } catch { /* The retained tab may have closed. */ }
            }
            resolve(cancelled());
          };
          signal.addEventListener("abort", onAbort, { once: true });
          if (signal.aborted) onAbort();
        })]);
      } finally { signal.removeEventListener("abort", onAbort); }
    };
    this.pendingRequestCount++;
    if (context.actor !== "user") {
      const operations = this.agentOperations.get(key) ?? new Set<AbortController>();
      operations.add(controller); this.agentOperations.set(key, operations);
    }
    const track = async (operation: Promise<BrowserResult<T>>) => {
      try { return await raceCancellation(operation); }
      finally { this.pendingRequestCount--; const operations = this.agentOperations.get(key); operations?.delete(controller); if (!operations?.size) this.agentOperations.delete(key); }
    };
    if (!serialize) return track(execute());
    const previous = this.mutationQueues.get(key) ?? Promise.resolve();
    const chained = previous.then(execute, execute);
    // A deadline returns promptly but does not let later commands overtake an
    // operation whose result is still uncertain. Stop remains immediate.
    const settled = chained.then(() => completion?.then(() => undefined, () => undefined), () => undefined);
    this.mutationQueues.set(key, settled);
    void settled.then(() => { if (this.mutationQueues.get(key) === settled) this.mutationQueues.delete(key); });
    return track(chained);
  }

  navigate(input: BrowserNavigateInput, sessionId?: string, context?: BrowserContextInput) {
    return this.run("navigate", async (target) => {
      if (input.url) {
        const policy = decideNavigation(input.url, null);
        if (!policy.allowed) throw Object.assign(new Error(policy.message), { code: policy.code });
      }
      this.snapshots.delete(JSON.stringify([target.sessionId, target.browserId]));
      const state = await this.host.navigate(input, target.sessionId, target.browserId, target);
      if (!state?.url) throw Object.assign(new Error("Browser navigation did not create a page"), { code: "UNAVAILABLE" });
      this.record = { ...this.record, location: state.url, state: state.isLoading ? "loading" : "ready", ownerSessionId: target.sessionId, updatedAt: Date.now() };
      return state;
    }, { ...context, sessionId });
  }
  action(action: "back" | "forward" | "reload" | "stop", context?: BrowserContextInput) {
    return this.run("action", async (target) => {
      this.snapshots.delete(JSON.stringify([target.sessionId, target.browserId]));
      this.host.action(action, target.sessionId, target.browserId, target);
    }, context, action !== "stop");
  }
  snapshot(context?: BrowserContextInput) {
    return this.run("snapshot", (target) => this.captureSnapshot(target), context, false);
  }
  screenshot(input: BrowserScreenshotOptions = {}, sessionId?: string, context?: BrowserContextInput) { return this.run("screenshot", (target) => this.host.screenshot(input, target.sessionId, target), { ...context, sessionId }); }
  click(uid: string, context?: BrowserContextInput, button: "left" | "right" | "middle" = "left") { return this.refAction("click", uid, (target) => this.host.click(uid, target, button), context); }
  fill(uid: string, text: string, context?: BrowserContextInput) { return this.refAction("fill", uid, (target) => this.host.fill(uid, text, target), context); }
  evaluate(expression: string, context?: BrowserContextInput) { return this.run("evaluate", (target) => this.host.evaluate(expression, target), context); }
  viewport(input: { width?: number; height?: number; mobile?: boolean; reset?: boolean }, context?: BrowserContextInput) { return this.run("evaluate", (target) => this.host.setViewport(input, target), context); }
  console(limit?: number, context?: BrowserContextInput, options?: { types?: string[]; contains?: string; since?: number; clear?: boolean }) { return this.run(options?.clear ? "evaluate" : "console", async (target) => this.host.console(limit, target, options), context, !!options?.clear); }
  cdp(method: string, params?: unknown, context?: BrowserContextInput) { return this.run("cdp", async (target) => { if (params !== undefined && (!params || typeof params !== "object" || JSON.stringify(params).length > 64 * 1024)) throw Object.assign(new Error("Invalid or oversized CDP parameters"), { code: "BROWSER_INVALID_INPUT" }); return this.host.cdpCommand(method, params, target); }, context); }
  interact(input: BrowserInteraction, context?: BrowserContextInput) { return this.run(["inspect", "wait"].includes(input?.action) ? "snapshot" : "click", target => this.host.interact(input, target), context); }
  tabs(operation: string, input: { disposition?: "temporary" | "deliverable" | "handoff" }, context?: BrowserContextInput) { return this.run("action", async target => this.host.tabOperation(operation, target, input), context); }
  service(name: string, input: any = {}, context?: BrowserContextInput) {
    input ??= {};
    const read = ["events", "metrics", "viewport"].includes(name) || name === "console" && !input.clear || name === "page" && (!input.operation || ["content", "assets"].includes(input.operation)) || name === "dialog" && (!input.operation || input.operation === "status") || name === "downloads" && (!input.operation || input.operation === "list") || name === "annotations" && (!input.operation || input.operation === "read") || name === "webmcp" && (!input.operation || input.operation === "list") || name === "developer" && (!input.operation || input.operation === "status");
    const approval = name === "developer" && input.operation === "enable" || name === "upload" || name === "webmcp" && input.operation === "call";
    return this.run(read ? "snapshot" : "evaluate", target => this.host.service(name, input, target), context, !read && !["dialog", "downloads"].includes(name), approval ? 125_000 : name === "page" && input.operation === "export" ? 30_000 : 10_000);
  }
  control(owner: "user" | "agent", context?: BrowserContextInput) {
    if (context?.actor !== "user") throw Object.assign(new Error("Only the user can resume agent control"), { code: "PERMISSION_DENIED" });
    const resolved = this.context(context);
    const target = this.host.resolveTarget(resolved.sessionId, resolved.browserId);
    if (owner === "user") for (const operation of this.agentOperations.get(JSON.stringify([target.sessionId, target.browserId])) ?? []) operation.abort();
    return this.host.setControl(target, owner);
  }
  preview(sessionId: string, path: string, root: string, context?: BrowserContextInput) { return this.run("preview", (target) => this.host.previewWorkspaceFile(sessionId, path, root, target), { ...context, sessionId }); }
  guestDisposed(): void { this.record = { ...this.record, state: "unavailable", guestGeneration: this.record.guestGeneration + 1, updatedAt: Date.now() }; }
  invalidate(): void { this.snapshots.clear(); this.guestDisposed(); }
  guestReady(): void { this.record = { ...this.record, state: "ready", guestGeneration: this.record.guestGeneration + 1, updatedAt: Date.now() }; }
  private refAction<T>(command: "click" | "fill", uid: string | undefined, work: (target: BrowserTarget) => Promise<T>, context?: BrowserContextInput) {
    return this.run(command, async (target) => {
      if (uid) {
        const snapshot = this.snapshots.get(JSON.stringify([target.sessionId, target.browserId]));
        // UID-only legacy callers remain supported. Typed refs require the
        // current snapshot from this exact session and tab.
        if ((context?.browserId || context?.snapshotId) && (!snapshot || (context?.snapshotId && context.snapshotId !== snapshot.snapshotId))) {
          throw Object.assign(new Error("The element reference expired. Call browser_snapshot again."), { code: "BROWSER_STALE_REF" });
        }
      }
      return work(target);
    }, context);
  }
}
