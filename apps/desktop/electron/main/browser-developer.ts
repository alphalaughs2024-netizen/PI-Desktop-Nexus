import type { WebContents } from "electron";

export const BROWSER_DEVELOPER_METHODS = new Set([
  "Network.enable", "Network.disable", "Network.getResponseBody", "Network.getRequestPostData", "Network.setCacheDisabled", "Network.setBypassServiceWorker",
  "Performance.enable", "Performance.disable", "Performance.getMetrics", "Performance.getMetricsWithTimestamps",
  "DOMSnapshot.captureSnapshot", "DOM.getNodeForLocation", "DOM.getContentQuads", "DOM.getComputedStyleForNode",
  "CSS.enable", "CSS.disable", "CSS.getComputedStyleForNode", "CSS.getMatchedStylesForNode", "CSS.getStyleSheetText",
  "Animation.enable", "Animation.disable", "Animation.getPlaybackRate", "Animation.setPlaybackRate",
  "Emulation.setEmulatedMedia", "Emulation.setCPUThrottlingRate", "Emulation.setTouchEmulationEnabled", "Emulation.setPageScaleFactor",
  "Page.getResourceTree", "Page.getResourceContent", "Page.getFrameTree", "Page.getNavigationHistory",
  "Log.enable", "Log.disable", "Audits.enable", "Audits.disable",
]);

export type BrowserEvent = { cursor: number; method: string; params: unknown; timestamp: number };
const EVENT_METHODS = new Set(["Network.requestWillBeSent", "Network.responseReceived", "Network.loadingFinished", "Network.loadingFailed", "Performance.metrics", "Log.entryAdded", "Audits.issueAdded"]);
const RESET_COMMANDS: Array<[string, Record<string, unknown>?]> = [
  ["Network.setCacheDisabled", { cacheDisabled: false }], ["Network.setBypassServiceWorker", { bypass: false }],
  ["Emulation.setEmulatedMedia", { media: "", features: [] }], ["Emulation.setCPUThrottlingRate", { rate: 1 }],
  ["Emulation.setTouchEmulationEnabled", { enabled: false }], ["Emulation.setPageScaleFactor", { pageScaleFactor: 1 }],
  ["Animation.setPlaybackRate", { playbackRate: 1 }], ["CSS.disable"], ["Animation.disable"], ["Log.disable"], ["Audits.disable"], ["Performance.disable"], ["Network.disable"],
];

function redact(value: unknown, depth = 0): unknown {
  if (depth > 8) return "[bounded]";
  if (typeof value === "string") return value.slice(0, 8000);
  if (Array.isArray(value)) return value.slice(0, 100).map(child => redact(child, depth + 1));
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).slice(0, 100).map(([key, child]) => [key, /authorization|cookie|postdata/i.test(key) ? "[redacted]" : redact(child, depth + 1)]));
}

/** Developer events are bounded, origin-bound and never retained after revoke. */
export class BrowserDeveloper {
  private origin?: string;
  private sequence = 0;
  private events: BrowserEvent[] = [];
  private bytes = 0;
  private readonly requests = new Set<string>();
  private cleanup: Promise<void> = Promise.resolve();
  private readonly listener = (_event: unknown, method: string, params: unknown) => {
    if (method === "Page.frameNavigated") {
      const frame = (params as { frame?: { parentId?: string; url?: string } })?.frame;
      if (frame && !frame.parentId && this.origin !== BrowserDeveloper.origin(frame.url ?? "")) void this.revoke();
    }
    if (!this.allowed() || !EVENT_METHODS.has(method)) return;
    const event = { cursor: ++this.sequence, method, params: redact(params), timestamp: Date.now() };
    if (method === "Network.requestWillBeSent" && typeof (params as { requestId?: unknown }).requestId === "string") {
      this.requests.add((params as { requestId: string }).requestId);
      if (this.requests.size > 500) this.requests.delete(this.requests.values().next().value!);
    }
    this.events.push(event); this.bytes += Buffer.byteLength(JSON.stringify(event));
    while (this.events.length > 250 || this.bytes > 1024 * 1024) this.bytes -= Buffer.byteLength(JSON.stringify(this.events.shift()));
  };
  constructor(private readonly wc: WebContents, private readonly onRevoke: () => void = () => {}) { wc.debugger.on("message", this.listener); }
  static origin(url: string): string | undefined { try { const site = new URL(url); return ["http:", "https:"].includes(site.protocol) ? site.origin : undefined; } catch { return undefined; } }
  allowed(): boolean { return !!this.origin && !this.wc.isDestroyed() && this.origin === BrowserDeveloper.origin(this.wc.getURL()); }
  status() { return { enabled: this.allowed(), origin: this.allowed() ? this.origin : undefined }; }
  async grant(origin: string) {
    await this.cleanup;
    if (origin !== BrowserDeveloper.origin(this.wc.getURL())) throw new Error("The page changed during Developer approval. Request approval for its current site.");
    this.origin = origin;
    try {
      await this.wc.debugger.sendCommand("Network.enable", { maxTotalBufferSize: 4 * 1024 * 1024, maxResourceBufferSize: 1024 * 1024, maxPostDataSize: 0 });
      await this.wc.debugger.sendCommand("Performance.enable");
    } catch (error) { await this.revoke(); throw error; }
    return this.status();
  }
  revoke() {
    const granted = !!this.origin;
    this.origin = undefined; this.events = []; this.bytes = 0; this.requests.clear();
    if (granted) {
      this.onRevoke();
      this.cleanup = this.cleanup.then(async () => {
        for (const [method, params] of RESET_COMMANDS) {
          if (this.wc.isDestroyed() || !this.wc.debugger.isAttached()) break;
          await this.wc.debugger.sendCommand(method, params).catch(() => undefined);
        }
      });
    }
    return this.cleanup;
  }
  read(cursor = 0, methods?: string[], limit = 100) {
    if (!Number.isInteger(cursor) || cursor < 0 || !Number.isInteger(limit) || limit < 1 || limit > 100 || methods !== undefined && (!Array.isArray(methods) || methods.some(method => !EVENT_METHODS.has(method)))) throw Object.assign(new Error("Invalid Developer event cursor, filter or limit"), { code: "BROWSER_INVALID_INPUT" });
    if (!this.allowed()) throw Object.assign(new Error("Enable Developer mode for this site before reading events"), { code: "PERMISSION_DENIED" });
    const first = this.events[0]?.cursor ?? this.sequence + 1;
    const events = this.events.filter(event => event.cursor > cursor && (!methods?.length || methods.includes(event.method))).slice(0, Math.min(100, Math.max(1, limit)));
    return { events, cursor: events.at(-1)?.cursor ?? this.sequence, historyLost: cursor > 0 && cursor < first - 1, hasMore: !!events.length && this.events.some(event => event.cursor > events.at(-1)!.cursor && (!methods?.length || methods.includes(event.method))) };
  }
  async send(method: string, params?: Record<string, unknown>) {
    if (!this.allowed() || !BROWSER_DEVELOPER_METHODS.has(method)) throw Object.assign(new Error("CDP requires current-site Developer approval and a supported page-scoped method"), { code: "PERMISSION_DENIED" });
    if (["Network.getResponseBody", "Network.getRequestPostData"].includes(method) && (typeof params?.requestId !== "string" || !this.requests.has(params.requestId))) throw Object.assign(new Error("Request ID is outside this Developer approval's observed requests"), { code: "PERMISSION_DENIED" });
    const origin = this.origin;
    const result = await this.wc.debugger.sendCommand(method, params);
    if (!this.allowed() || origin !== this.origin) throw Object.assign(new Error("Site changed during Developer request"), { code: "BROWSER_STALE_REF" });
    const json = JSON.stringify(result);
    if (Buffer.byteLength(json ?? "") > 1024 * 1024) return { truncated: true, message: "Developer result exceeds 1 MiB. Narrow the request." };
    return result;
  }
  dispose() { void this.revoke(); if (!this.wc.isDestroyed()) this.wc.debugger.off("message", this.listener); }
}
