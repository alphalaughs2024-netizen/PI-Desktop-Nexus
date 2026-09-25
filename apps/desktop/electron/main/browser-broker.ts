import type { BrowserErrorCode, BrowserRequestContext, BrowserResult, BrowserWaitCondition } from "@pi-desktop/shared";
import type { BrowserHost, BrowserNavigateInput } from "./browser-host";

type BrowserCommand = "navigate" | "action" | "snapshot" | "screenshot" | "click" | "fill" | "evaluate" | "console" | "cdp" | "preview";
type BrowserContextInput = Partial<Omit<BrowserRequestContext, "requestId" | "browserId">> & { browserId?: string };
export type BrowserRecord = { browserId: BrowserRequestContext["browserId"]; ownerSessionId?: string; chromeSessionId?: string; state: "starting" | "ready" | "loading" | "unavailable" | "blocked" | "closed"; location?: string; createdAt: number; updatedAt: number; guestGeneration: number };

const MUTATIONS = new Set<BrowserCommand>(["navigate", "action", "click", "fill", "evaluate", "cdp", "preview"]);
const TIMEOUTS: Record<BrowserCommand, number> = { navigate: 20_000, action: 20_000, snapshot: 10_000, screenshot: 15_000, click: 10_000, fill: 10_000, evaluate: 10_000, console: 10_000, cdp: 10_000, preview: 20_000 };

function errorCode(error: unknown): BrowserErrorCode {
  const code = typeof error === "object" && error && "code" in error ? String((error as { code?: unknown }).code) : "";
  if (code === "UNAVAILABLE") return "BROWSER_UNAVAILABLE";
  if (code === "PERMISSION_DENIED") return "BROWSER_POLICY_BLOCKED";
  return "BROWSER_UNKNOWN_ERROR";
}

export class BrowserBroker {
  private queue: Promise<unknown> = Promise.resolve();
  private sequence = 0;
  private readonly browserId = "browser-core-1" as BrowserRequestContext["browserId"];
  private readonly createdAt = Date.now();
  private record: BrowserRecord = { browserId: this.browserId, state: "starting", createdAt: this.createdAt, updatedAt: this.createdAt, guestGeneration: 0 };
  private latestSnapshot?: { snapshotId: string; generation: number; browserId: string };
  private readonly host: BrowserHost;
  constructor(host: BrowserHost) { this.host = host; }

  private context(input?: BrowserContextInput): BrowserRequestContext {
    return { requestId: `browser-${++this.sequence}` as BrowserRequestContext["requestId"], sessionId: input?.sessionId ?? "", turnId: input?.turnId, effectiveAgentId: input?.effectiveAgentId, mode: input?.mode ?? "agent", permissionEpoch: input?.permissionEpoch ?? 0, browserId: (input?.browserId ?? this.browserId) as BrowserContextInput["browserId"] as BrowserRequestContext["browserId"] };
  }

  listTabs(): BrowserRecord[] { return [{ ...this.record }]; }
  open(url?: BrowserNavigateInput, context?: BrowserContextInput) { return url ? this.navigate(url, context?.sessionId, context) : Promise.resolve({ requestId: this.context(context).requestId, ok: true as const, result: { ...this.record } }); }
  wait(condition: BrowserWaitCondition, context?: BrowserContextInput) { return this.run("snapshot", async () => { const started = Date.now(); while (Date.now() - started < 10_000) { const snapshot = await this.host.snapshot(); if (condition.kind === "url" && (condition.match === "equals" ? snapshot.url === condition.value : snapshot.url.includes(condition.value))) return snapshot; if (condition.kind === "text" && snapshot.tree.includes(condition.value)) return snapshot; if (condition.kind === "page_load" && !this.record.state.includes("loading")) return snapshot; await new Promise((resolve) => setTimeout(resolve, 200)); } throw Object.assign(new Error("Browser wait timed out"), { code: "TIMEOUT" }); }, context); }
  type(uid: string | undefined, text: string, context?: BrowserContextInput) { return this.fill(uid ?? "", text, context); }
  keypress(_uid: string | undefined, _key: string, context?: BrowserContextInput) { return this.run("action", async () => undefined, context); }

  private async run<T>(command: BrowserCommand, work: () => Promise<T>, contextInput?: BrowserContextInput): Promise<BrowserResult<T>> {
    const context = this.context(contextInput);
    const execute = async (): Promise<BrowserResult<T>> => {
      if (context.mode === "plan" && (command === "click" || command === "fill" || command === "evaluate" || command === "cdp")) return { requestId: context.requestId, ok: false, code: "BROWSER_POLICY_BLOCKED", retryable: false, message: `${command} is unavailable in Plan mode.` };
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        this.record = { ...this.record, state: command === "navigate" || command === "action" ? "loading" : this.record.state, ownerSessionId: context.sessionId || this.record.ownerSessionId, updatedAt: Date.now() };
        const result = await Promise.race([work(), new Promise<never>((_, reject) => { timer = setTimeout(() => reject(Object.assign(new Error("Browser command timed out"), { code: "TIMEOUT" })), TIMEOUTS[command]); })]);
        this.record = { ...this.record, state: "ready", updatedAt: Date.now() };
        return { requestId: context.requestId, ok: true, result };
      } catch (error) {
        const code = errorCode(error);
        const timeout = code === "BROWSER_UNKNOWN_ERROR" && error instanceof Error && error.message === "Browser command timed out";
        this.record = { ...this.record, state: timeout ? "unavailable" : this.record.state, updatedAt: Date.now() };
        return { requestId: context.requestId, ok: false, code: timeout && MUTATIONS.has(command) ? "BROWSER_POSSIBLY_APPLIED" : timeout ? "BROWSER_TIMEOUT" : code, retryable: !MUTATIONS.has(command), possiblyApplied: timeout && MUTATIONS.has(command), message: timeout && MUTATIONS.has(command) ? "The Browser action may have reached the page. Take a fresh snapshot before retrying." : timeout ? "The Browser command timed out before dispatch completed. Retry is safe." : error instanceof Error ? error.message : "Browser command failed." };
      } finally { if (timer) clearTimeout(timer); }
    };
    const chained = MUTATIONS.has(command) ? this.queue.then(execute, execute) : execute();
    if (MUTATIONS.has(command)) this.queue = chained.then(() => undefined, () => undefined);
    return chained;
  }

  navigate(input: BrowserNavigateInput, sessionId?: string, context?: BrowserContextInput) { return this.run("navigate", () => this.host.navigate(input, sessionId), { ...context, sessionId }); }
  action(action: "back" | "forward" | "reload" | "stop", context?: BrowserContextInput) { return this.run("action", async () => { this.host.action(action); return undefined; }, context); }
  async snapshot(context?: BrowserContextInput) {
    const result = await this.run("snapshot", () => this.host.snapshot(), context);
    if (result.ok && result.result?.snapshotId) this.latestSnapshot = { snapshotId: result.result.snapshotId, generation: result.result.documentGeneration ?? 0, browserId: String(this.browserId) };
    return result;
  }
  screenshot(input: { fullPage?: boolean } = {}, sessionId?: string, context?: BrowserContextInput) { return this.run("screenshot", () => this.host.screenshot(input, sessionId), { ...context, sessionId }); }
  click(uid: string, context?: BrowserContextInput) { return this.refAction("click", uid, () => this.host.click(uid), context); }
  fill(uid: string, text: string, context?: BrowserContextInput) { return this.refAction("fill", uid, () => this.host.fill(uid, text), context); }
  evaluate(expression: string, context?: BrowserContextInput) { return this.run("evaluate", () => this.host.evaluate(expression), context); }
  console(limit?: number, context?: BrowserContextInput) { return this.run("console", async () => this.host.console(limit), context); }
  cdp(method: string, params?: unknown, context?: BrowserContextInput) { return this.run("cdp", () => this.host.cdpCommand(method, params), context); }
  preview(sessionId: string, path: string, root: string, context?: BrowserContextInput) { return this.run("preview", () => this.host.previewWorkspaceFile(sessionId, path, root), { ...context, sessionId }); }
  guestDisposed(): void { this.record = { ...this.record, state: "unavailable", guestGeneration: this.record.guestGeneration + 1, updatedAt: Date.now() }; }
  guestReady(): void { this.record = { ...this.record, state: "ready", guestGeneration: this.record.guestGeneration + 1, updatedAt: Date.now() }; }
  private refAction<T>(command: "click" | "fill", uid: string, work: () => Promise<T>, context?: BrowserContextInput) {
    if (context?.mode === "plan") return this.run(command, work, context);
    // Compatibility callers may still send legacy uid-only actions during the
    // migration window; typed callers must provide a current snapshot first.
    if (!this.latestSnapshot && !context?.browserId) return this.run(command, work, context);
    if (!this.latestSnapshot) return Promise.resolve({ requestId: this.context(context).requestId, ok: false as const, code: "BROWSER_STALE_REF" as const, retryable: true, message: "The element reference expired. Call browser_snapshot again." });
    if (this.latestSnapshot.browserId !== String(this.browserId)) return Promise.resolve({ requestId: this.context(context).requestId, ok: false as const, code: "BROWSER_STALE_REF" as const, retryable: true, message: "The element reference expired. Call browser_snapshot again." });
    return this.run(command, work, context);
  }
}
