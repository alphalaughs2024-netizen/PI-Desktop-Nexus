import type { WebContents } from "electron";
import { chromium, type Browser, type ConnectOverCDPTransport, type Locator, type Page } from "playwright-core";
import type { BrowserInteraction, BrowserLocator } from "@pi-desktop/shared";
import { normalizeBrowserChord } from "../../common/browser-keys";

type Message = { id?: number; method?: string; params?: Record<string, any>; sessionId?: string };

/** An in-memory CDP endpoint containing exactly one unprivileged guest. */
export class GuestTransport implements ConnectOverCDPTransport {
  onmessage?: (message: object) => void;
  onclose?: (reason?: string) => void;
  private closed = false;
  private announced = false;
  private readonly children = new Set<string>();
  private readonly pageSession = "nexus-page";
  private readonly targetId: string;
  private readonly listener: (_event: unknown, method: string, params: any, sessionId?: string) => void;

  constructor(private readonly wc: WebContents, targetId: string) {
    this.targetId = targetId;
    this.listener = (_event, method, params, sessionId) => {
      if (method === "Target.attachedToTarget") this.children.add(params.sessionId);
      if (method === "Target.detachedFromTarget") this.children.delete(params.sessionId);
      this.deliver({ method, params, sessionId: sessionId || this.pageSession });
    };
    wc.debugger.on("message", this.listener);
    wc.once("destroyed", this.destroyed);
  }

  private destroyed = () => this.close();
  private info() { return { targetId: this.targetId, browserContextId: "nexus-context", type: "page", title: this.wc.getTitle(), url: this.wc.getURL(), attached: true, canAccessOpener: false }; }
  private deliver(message: object) { if (!this.closed) queueMicrotask(() => { if (!this.closed) this.onmessage?.(message); }); }
  send(message: object): void {
    const request = message as Message;
    void this.dispatch(request).then(result => this.deliver({ id: request.id, sessionId: request.sessionId, result }), error => this.deliver({ id: request.id, sessionId: request.sessionId, error: { code: -32000, message: error instanceof Error ? error.message : String(error) } }));
  }
  private async dispatch(request: Message): Promise<unknown> {
    if (this.closed || this.wc.isDestroyed()) throw new Error("Browser guest closed");
    const { method = "", params = {}, sessionId } = request;
    if (!sessionId) {
      if (method === "Browser.getVersion") return this.wc.debugger.sendCommand(method);
      if (method === "Target.getTargetInfo") return { targetInfo: { targetId: "nexus-browser", type: "browser", title: "Nexus", url: "", attached: true } };
      if (method === "Target.getTargets") return { targetInfos: [this.info()] };
      if (method === "Target.setAutoAttach" || method === "Target.setDiscoverTargets") {
        if (!this.announced && params.autoAttach) {
          this.announced = true;
          this.deliver({ method: "Target.attachedToTarget", params: { sessionId: this.pageSession, targetInfo: this.info(), waitingForDebugger: false } });
        }
        return {};
      }
      // Context creation, global downloads, cookie APIs and unrelated targets
      // cannot escape this guest-only transport.
      throw new Error(`Browser-level method unavailable: ${method}`);
    }
    if (sessionId !== this.pageSession && !this.children.has(sessionId)) throw new Error("Unknown guest session");
    if (method === "Target.closeTarget" || method === "Target.createTarget" || method === "Browser.close") throw new Error("Use Nexus tab controls");
    // Popup pages have their own Nexus guest transport. This connection owns
    // only this page's iframe and worker targets, never a second tab's lifetime.
    if (method === "Target.setAutoAttach") return this.wc.debugger.sendCommand(method, { ...params, waitForDebuggerOnStart: false, filter: [{ type: "iframe" }, { type: "worker" }, { exclude: true }] }, sessionId === this.pageSession ? undefined : sessionId);
    return this.wc.debugger.sendCommand(method, params, sessionId === this.pageSession ? undefined : sessionId);
  }
  close(): void {
    if (this.closed) return;
    this.closed = true;
    if (!this.wc.isDestroyed()) this.wc.debugger.off("message", this.listener);
    this.wc.off("destroyed", this.destroyed);
    this.children.clear();
    this.onclose?.();
  }
}

export class BrowserAutomation {
  private connection?: Promise<{ browser: Browser; page: Page; transport: GuestTransport }>;
  private transport?: GuestTransport;

  constructor(private readonly wc: WebContents, private readonly artifactsDir: string) {}
  private async connect() {
    if (!this.connection) {
      this.connection = (async () => {
        const { targetInfo } = await this.wc.debugger.sendCommand("Target.getTargetInfo") as { targetInfo: { targetId: string } };
        // Nexus may already have enabled Runtime for snapshots. Re-enable it
        // through Playwright so existing frame contexts are announced to its
        // new connection before iframe handles are adopted into parent worlds.
        await this.wc.debugger.sendCommand("Runtime.disable");
        const transport = new GuestTransport(this.wc, targetInfo.targetId);
        this.transport = transport;
        const browser = await chromium.connectOverCDP(transport, { noDefaults: true, artifactsDir: this.artifactsDir, timeout: 8000 });
        const page = browser.contexts()[0]?.pages()[0];
        if (!page) { transport.close(); throw new Error("Browser guest did not expose a page"); }
        page.setDefaultTimeout(8000);
        // Nexus handles dialogs through its CDP service; keep Playwright from
        // automatically dismissing a dialog before the agent can inspect it.
        page.on("dialog", () => undefined);
        page.on("close", () => this.dispose());
        return { browser, page, transport };
      })();
      void this.connection.catch(() => this.dispose());
    }
    return this.connection;
  }
  async page() { return (await this.connect()).page; }
  private locator(page: Page, input: BrowserLocator): Locator {
    let root: Page | import("playwright-core").FrameLocator = page;
    for (const selector of input.frames ?? []) root = root.frameLocator(selector);
    let locator: Locator;
    if (input.role) locator = root.getByRole(input.role as Parameters<Page["getByRole"]>[0], { name: input.name, exact: input.exact ?? true });
    else if (input.label !== undefined) locator = root.getByLabel(input.label, { exact: input.exact ?? true });
    else if (input.text !== undefined) locator = root.getByText(input.text, { exact: input.exact ?? true });
    else if (input.placeholder !== undefined) locator = root.getByPlaceholder(input.placeholder, { exact: input.exact ?? true });
    else if (input.testId !== undefined) locator = root.getByTestId(input.testId);
    else if (input.css) locator = root.locator(input.css);
    else throw Object.assign(new Error("A locator requires role, label, text, placeholder, testId or css"), { code: "BROWSER_INVALID_INPUT" });
    if (input.index !== undefined) {
      if (!Number.isInteger(input.index) || input.index < 0) throw new Error("Locator index must be a nonnegative integer");
      locator = locator.nth(input.index);
    }
    return locator;
  }
  async interact(input: BrowserInteraction, signal?: AbortSignal) {
    validateBrowserInteraction(input);
    const page = await this.page();
    signal?.throwIfAborted();
    const abort = () => this.dispose();
    signal?.addEventListener("abort", abort, { once: true });
    try {
      const timeout = Math.min(8000, Math.max(250, input.timeoutMs ?? 8000));
      const locator = input.locator ? this.locator(page, input.locator) : undefined;
      const required = () => { if (!locator) throw new Error("This action requires a locator"); return locator; };
      switch (input.action) {
        case "click": await required().click({ button: input.button ?? "left", clickCount: input.clickCount ?? 1, timeout }); break;
        case "hover": await required().hover({ timeout }); break;
        case "fill": await required().fill(input.text ?? "", { timeout }); break;
        case "type": await required().pressSequentially(input.text ?? "", { timeout }); break;
        case "press": await required().press(normalizeBrowserChord(input.key ?? ""), { timeout }); break;
        case "check": await required().setChecked(input.checked ?? true, { timeout }); break;
        case "select": await required().selectOption(input.values ?? [], { timeout }); break;
        case "drag": if (!input.destination) throw new Error("Drag requires a destination locator"); await required().dragTo(this.locator(page, input.destination), { timeout }); break;
        case "scroll": if (locator) await locator.scrollIntoViewIfNeeded({ timeout }); else await page.mouse.wheel(input.deltaX ?? 0, input.deltaY ?? 0); break;
        case "mouse": {
          if (!Number.isFinite(input.x) || !Number.isFinite(input.y)) throw new Error("Mouse requires finite CSS coordinates");
          await page.mouse.click(input.x!, input.y!, { button: input.button ?? "left", clickCount: input.clickCount ?? 1 }); break;
        }
        case "wait": await required().waitFor({ state: input.state ?? "visible", timeout }); break;
        case "inspect": return { count: await required().count(), text: (await required().allTextContents()).slice(0, 50).map(value => value.slice(0, 4000)), frames: page.frames().map(frame => ({ name: frame.name(), url: frame.url() })).slice(0, 50) };
        default: throw new Error("Unknown Browser interaction");
      }
      return { action: input.action, url: page.url() };
    } finally { signal?.removeEventListener("abort", abort); }
  }
  async upload(locator: BrowserLocator, files: string[], signal?: AbortSignal) {
    validateBrowserInteraction({ action: "inspect", locator });
    const page = await this.page();
    signal?.throwIfAborted();
    const abort = () => this.dispose();
    signal?.addEventListener("abort", abort, { once: true });
    try { await this.locator(page, locator).setInputFiles(files, { timeout: 8000 }); return { count: files.length }; }
    finally { signal?.removeEventListener("abort", abort); }
  }
  dispose() { this.transport?.close(); this.transport = undefined; this.connection = undefined; }
}

export function validateBrowserInteraction(input: BrowserInteraction): void {
  const invalid = () => { throw Object.assign(new Error("Invalid Browser interaction or locator"), { code: "BROWSER_INVALID_INPUT" }); };
  if (!input || typeof input !== "object" || !["click", "hover", "fill", "type", "press", "check", "select", "drag", "scroll", "mouse", "wait", "inspect"].includes(input.action)) invalid();
  if (input.timeoutMs !== undefined && (!Number.isInteger(input.timeoutMs) || input.timeoutMs < 250 || input.timeoutMs > 8000)) invalid();
  if (input.text !== undefined && (typeof input.text !== "string" || input.text.length > 64 * 1024)) invalid();
  if (input.key !== undefined && (typeof input.key !== "string" || input.key.length > 100)) invalid();
  if (input.button !== undefined && !["left", "right", "middle"].includes(input.button)) invalid();
  if (input.clickCount !== undefined && (!Number.isInteger(input.clickCount) || input.clickCount < 1 || input.clickCount > 3)) invalid();
  if (input.checked !== undefined && typeof input.checked !== "boolean") invalid();
  if (input.state !== undefined && !["attached", "detached", "visible", "hidden"].includes(input.state)) invalid();
  if (input.values !== undefined && (!Array.isArray(input.values) || input.values.length > 100 || input.values.some(value => typeof value !== "string" || value.length > 4000))) invalid();
  for (const key of ["x", "y", "deltaX", "deltaY"] as const) if (input[key] !== undefined && (!Number.isFinite(input[key]) || Math.abs(input[key]!) > 100_000)) invalid();
  if (input.action === "mouse" && (input.x === undefined || input.y === undefined)) invalid();
  for (const locator of [input.locator, input.destination]) {
    if (locator === undefined) continue;
    if (!locator || typeof locator !== "object") invalid();
    for (const key of ["role", "name", "label", "text", "placeholder", "testId", "css"] as const) if (locator[key] !== undefined && (typeof locator[key] !== "string" || locator[key]!.length > 4000)) invalid();
    if (![locator.role, locator.label, locator.text, locator.placeholder, locator.testId, locator.css].some(value => value !== undefined)) invalid();
    if (locator.index !== undefined && (!Number.isInteger(locator.index) || locator.index < 0 || locator.index > 10_000)) invalid();
    if (locator.exact !== undefined && typeof locator.exact !== "boolean") invalid();
    if (locator.frames !== undefined && (!Array.isArray(locator.frames) || locator.frames.length > 8 || locator.frames.some(value => typeof value !== "string" || !value || value.length > 4000))) invalid();
  }
  if (!["scroll", "mouse"].includes(input.action) && !input.locator) invalid();
  if (input.action === "drag" && !input.destination) invalid();
}
