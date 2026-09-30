import type { BrowserErrorCode, BrowserRequestContext, BrowserResult, BrowserWaitCondition } from "@pi-desktop/shared";
import type { BrowserHost, BrowserNavigateInput, BrowserTarget } from "./browser-host";
import { decideCapability, decideCdp, decideMode, decideNavigation } from "./browser-policy";

type BrowserCommand = "navigate" | "action" | "snapshot" | "screenshot" | "click" | "fill" | "evaluate" | "console" | "cdp" | "preview";
type BrowserContextInput = Partial<Omit<BrowserRequestContext, "requestId" | "browserId">> & { browserId?: string; snapshotId?: string };
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
  if (code === "PERMISSION_DENIED") return "BROWSER_POLICY_BLOCKED";
  return "BROWSER_UNKNOWN_ERROR";
}

export class BrowserBroker {
  private readonly mutationQueues = new Map<string, Promise<void>>();
  private sequence = 0;
  private readonly browserId = "browser-core-1" as BrowserRequestContext["browserId"];
  private readonly createdAt = Date.now();
  private record: BrowserRecord = { browserId: this.browserId, state: "starting", createdAt: this.createdAt, updatedAt: this.createdAt, guestGeneration: 0 };
  private readonly snapshots = new Map<string, { snapshotId: string; generation: number }>();
  private readonly host: BrowserHost;
  private readonly isCapabilityEnabled: () => boolean;
  private lastError?: { code: BrowserErrorCode; reason: string; at: number };
  constructor(host: BrowserHost, isCapabilityEnabled: () => boolean = () => true) { this.host = host; this.isCapabilityEnabled = isCapabilityEnabled; }

  private context(input?: BrowserContextInput): BrowserRequestContext {
    return { requestId: `browser-${++this.sequence}` as BrowserRequestContext["requestId"], sessionId: input?.sessionId ?? this.host.activeSessionId?.() ?? "", turnId: input?.turnId, effectiveAgentId: input?.effectiveAgentId, mode: input?.mode ?? "agent", permissionEpoch: input?.permissionEpoch ?? 0, browserId: (input?.browserId ?? this.host.activeBrowserId?.(input?.sessionId) ?? this.browserId) as BrowserContextInput["browserId"] as BrowserRequestContext["browserId"] };
  }

  listTabs(sessionId?: string): BrowserRecord[] {
    const tabs = this.host.listTabs?.();
    if (!tabs) return [{ ...this.record }];
    return tabs.filter((tab) => sessionId === undefined || tab.sessionId === sessionId).map((tab) => ({ browserId: tab.browserId as BrowserRequestContext["browserId"], ownerSessionId: tab.sessionId, state: tab.state?.isLoading ? "loading" : tab.state?.url ? "ready" : "starting", location: tab.state?.url, createdAt: this.createdAt, updatedAt: Date.now(), guestGeneration: tab.generation }));
  }
  diagnostics(): Record<string, unknown> { return { capabilityEnabled: this.isCapabilityEnabled(), readiness: this.record.state, browserId: this.browserId, guestGeneration: this.record.guestGeneration, chromeSessionId: this.record.chromeSessionId, pendingRequestCount: 0, activeQueueCount: 0, compatibilityAdapter: "available", ...(this.lastError ? { lastErrorCode: this.lastError.code, lastErrorReason: this.lastError.reason, safeSuggestedAction: "Retry or inspect the Browser panel." } : {}) }; }
  open(url?: BrowserNavigateInput, context?: BrowserContextInput) { return this.navigate(url ?? { url: "about:blank" }, context?.sessionId, context); }
  wait(condition: BrowserWaitCondition, context?: BrowserContextInput, timeoutMs = 10_000) { return this.run("snapshot", async (target) => {
    const deadline = Date.now() + Math.min(25_000, Math.max(250, Number(timeoutMs) || 10_000));
    while (Date.now() < deadline) {
      const state = this.host.getState(target);
      if (condition.kind === "page_load" && state?.url && !state.isLoading) return this.host.snapshot(target);
      if (condition.kind === "url" && state?.url && (condition.match === "equals" ? state.url === condition.value : state.url.includes(condition.value))) return this.host.snapshot(target);
      if (condition.kind === "text") { const snapshot = await this.host.snapshot(target); if (snapshot.tree.includes(condition.value)) return snapshot; }
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    throw Object.assign(new Error("Browser wait timed out"), { code: "TIMEOUT" });
  }, context, true, Math.min(25_000, Math.max(250, Number(timeoutMs) || 10_000)) + 1_000); }
  type(uid: string | undefined, text: string, clearFirst = false, context?: BrowserContextInput) { return this.refAction("fill", uid, (target) => this.host.type(uid, text, clearFirst, target), context); }
  keypress(uid: string | undefined, key: string, modifiers: string[] = [], context?: BrowserContextInput) { return this.refAction("click", uid, (target) => this.host.keypress(uid, key, modifiers, target), context); }

  private async run<T>(command: BrowserCommand, work: (target: BrowserTarget) => Promise<T>, contextInput?: BrowserContextInput, serialize = true, timeoutMs = TIMEOUTS[command]): Promise<BrowserResult<T>> {
    const context = this.context(contextInput);
    const key = JSON.stringify([context.sessionId, context.browserId]);
    if (!this.isCapabilityEnabled()) return { requestId: context.requestId, ok: false, code: "BROWSER_POLICY_BLOCKED", retryable: false, message: "Browser is disabled by the core capability setting. Re-enable Browser in Settings and retry." };
    const admission = decideMode(context.mode, command);
    if (!admission.allowed) return { requestId: context.requestId, ok: false, code: admission.code, retryable: false, message: admission.message };
    let target: BrowserTarget;
    try {
      target = this.host.resolveTarget?.(context.sessionId, context.browserId, !contextInput?.browserId) ?? { sessionId: context.sessionId, browserId: context.browserId };
    } catch (error) {
      return { requestId: context.requestId, ok: false, code: errorCode(error), retryable: false, message: error instanceof Error ? error.message : "Browser target is unavailable" };
    }
    let completion: Promise<unknown> | undefined;
    const execute = async (): Promise<BrowserResult<T>> => {
      if (!this.isCapabilityEnabled()) return { requestId: context.requestId, ok: false, code: "BROWSER_POLICY_BLOCKED", retryable: false, message: "Browser is disabled by the core capability setting. Re-enable Browser in Settings and retry." };
      const policy = decideMode(context.mode, command); if (!policy.allowed) { this.lastError = { code: policy.code, reason: policy.reason, at: Date.now() }; return { requestId: context.requestId, ok: false, code: policy.code, retryable: false, message: policy.message }; }
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        this.record = { ...this.record, state: command === "navigate" || command === "action" ? "loading" : this.record.state, ownerSessionId: context.sessionId || this.record.ownerSessionId, updatedAt: Date.now() };
        completion = work(target);
        const result = await Promise.race([completion as Promise<T>, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(Object.assign(new Error("Browser command timed out"), { code: "TIMEOUT" })), timeoutMs); })]);
        this.record = { ...this.record, state: "ready", updatedAt: Date.now() };
        return { requestId: context.requestId, ok: true, result };
      } catch (error) {
        const code = errorCode(error); this.lastError = { code, reason: error instanceof Error ? error.name : "unknown", at: Date.now() };
        const timeout = code === "BROWSER_TIMEOUT";
        this.record = { ...this.record, state: timeout ? "unavailable" : this.record.state, updatedAt: Date.now() };
        return { requestId: context.requestId, ok: false, code: timeout && MUTATIONS.has(command) ? "BROWSER_POSSIBLY_APPLIED" : timeout ? "BROWSER_TIMEOUT" : code, retryable: !MUTATIONS.has(command), possiblyApplied: timeout && MUTATIONS.has(command), message: timeout && MUTATIONS.has(command) ? "The Browser action may have reached the page. Take a fresh snapshot before retrying." : timeout ? "The Browser command timed out before dispatch completed. Retry is safe." : error instanceof Error ? error.message : "Browser command failed." };
      } finally { if (timer) clearTimeout(timer); }
    };
    if (!serialize) return execute();
    const previous = this.mutationQueues.get(key) ?? Promise.resolve();
    const chained = previous.then(execute, execute);
    // A deadline returns promptly but does not let later commands overtake an
    // operation whose result is still uncertain. Stop remains immediate.
    const settled = chained.then(() => completion?.then(() => undefined, () => undefined), () => undefined);
    this.mutationQueues.set(key, settled);
    void settled.then(() => { if (this.mutationQueues.get(key) === settled) this.mutationQueues.delete(key); });
    return chained;
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
    return this.run("snapshot", async (target) => {
      const result = await this.host.snapshot(target);
      if (result.snapshotId) this.snapshots.set(JSON.stringify([target.sessionId, target.browserId]), { snapshotId: result.snapshotId, generation: result.documentGeneration ?? 0 });
      return result;
    }, context);
  }
  screenshot(input: { fullPage?: boolean } = {}, sessionId?: string, context?: BrowserContextInput) { return this.run("screenshot", (target) => this.host.screenshot(input, target.sessionId, target), { ...context, sessionId }); }
  click(uid: string, context?: BrowserContextInput) { return this.refAction("click", uid, (target) => this.host.click(uid, target), context); }
  fill(uid: string, text: string, context?: BrowserContextInput) { return this.refAction("fill", uid, (target) => this.host.fill(uid, text, target), context); }
  evaluate(expression: string, context?: BrowserContextInput) { return this.run("evaluate", (target) => this.host.evaluate(expression, target), context); }
  viewport(input: { width?: number; height?: number; mobile?: boolean; reset?: boolean }, context?: BrowserContextInput) { return this.run("evaluate", (target) => this.host.setViewport(input, target), context); }
  console(limit?: number, context?: BrowserContextInput) { return this.run("console", async (target) => this.host.console(limit, target), context); }
  cdp(method: string, params?: unknown, context?: BrowserContextInput) { return this.run("cdp", async (target) => { const policy = decideCdp(method, params); if (!policy.allowed) throw Object.assign(new Error(policy.message), { code: policy.code }); return this.host.cdpCommand(method, params, target); }, context); }
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
