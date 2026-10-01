import type { WebContents } from "electron";
import { createHash } from "node:crypto";
import type { BrowserScreenshotOptions } from "@pi-desktop/shared";
import { normalizeBrowserKey } from "../../common/browser-keys";

/** Chrome DevTools Protocol revision attached to the work-panel guest. */
export const BROWSER_CDP_PROTOCOL = "1.3";

/**
 * Deny-by-default CDP methods the public `pi.browser.cdp` API may send.
 * Cookie, storage, target, and network-interception methods stay off this list.
 */
export const BROWSER_CDP_ALLOWLIST = new Set([
  "Page.enable",
  "Page.reload",
  "Page.captureScreenshot",
  "Page.getLayoutMetrics",
  "Page.bringToFront",
  "DOM.enable",
  "DOM.getDocument",
  "DOM.querySelector",
  "DOM.querySelectorAll",
  "DOM.getBoxModel",
  "DOM.describeNode",
  "DOM.scrollIntoViewIfNeeded",
  "DOM.getOuterHTML",
  "DOM.getAttributes",
  "Runtime.enable",
  "Runtime.evaluate",
  "Runtime.callFunctionOn",
  "Runtime.getProperties",
  "Runtime.awaitPromise",
  "Input.dispatchMouseEvent",
  "Input.dispatchKeyEvent",
  "Input.insertText",
  "Accessibility.enable",
  "Accessibility.getFullAXTree",
  "Accessibility.getPartialAXTree",
  "Console.enable",
]);

const MAX_EVALUATE_CHARS = 64 * 1024;
const MAX_CONSOLE_MESSAGES = 100;
const SCREENSHOT_MAX_WIDTH = 1280;
export const BROWSER_SNAPSHOT_LIMITS = { maxNodes: 2000, maxDepth: 64, maxTextLength: 4000, maxBytes: 512 * 1024, maxScreenshotHeight: 4096, maxScreenshotBytes: 4 * 1024 * 1024, maxConsoleBytes: 256 * 1024 } as const;

export type BrowserConsoleMessage = {
  type: string;
  text: string;
  timestamp: number;
  count?: number;
  firstTimestamp?: number;
};

export type AxNode = {
  nodeId?: string;
  ignored?: boolean;
  role?: { value?: string };
  name?: { value?: string };
  value?: { value?: unknown };
  properties?: Array<{ name: string; value?: { value?: unknown } }>;
  backendDOMNodeId?: number;
  childIds?: string[];
};

export type SnapshotResult = {
  tree: string;
  url: string;
  title: string;
  contentHash?: string;
  snapshotId?: string;
  documentGeneration?: number;
  unchanged?: boolean;
  nodeCount?: number;
  truncation?: { nodes?: boolean; depth?: boolean; text?: boolean; bytes?: boolean };
};

function boundedText(value: unknown, max: number = BROWSER_SNAPSHOT_LIMITS.maxTextLength): string {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

export function isAllowedCdpMethod(method: string): boolean {
  return BROWSER_CDP_ALLOWLIST.has(method.trim());
}

/**
 * Flatten an accessibility tree into indented text with stable `eN` uids.
 * Ignored nodes are skipped; uids map to backend DOM node ids for click/fill.
 */
export function flattenAxTree(nodes: AxNode[]): {
  tree: string;
  uids: Map<string, number>;
  nodeCount: number;
  truncation: { nodes?: boolean; depth?: boolean; text?: boolean; bytes?: boolean };
} {
  const byId = new Map<string, AxNode>();
  for (const node of nodes) {
    if (typeof node.nodeId === "string") byId.set(node.nodeId, node);
  }
  const childIds = new Set<string>();
  for (const node of nodes) {
    for (const id of node.childIds ?? []) childIds.add(id);
  }
  const roots = nodes.filter(
    (node) => typeof node.nodeId === "string" && !childIds.has(node.nodeId),
  );
  const uids = new Map<string, number>();
  const lines: string[] = [];
  let next = 1;
  let bytes = 0;
  const visited = new Set<AxNode>();
  const truncation: { nodes?: boolean; depth?: boolean; text?: boolean; bytes?: boolean } = {};

  const walk = (node: AxNode, depth: number) => {
    if (visited.has(node)) return;
    if (depth > BROWSER_SNAPSHOT_LIMITS.maxDepth) { truncation.depth = true; return; }
    if (next > BROWSER_SNAPSHOT_LIMITS.maxNodes) { truncation.nodes = true; return; }
    if (truncation.bytes) return;
    visited.add(node);
    if (!node.ignored) {
      const role = boundedText(node.role?.value || "Generic", 128);
      const name = boundedText(node.name?.value);
      if (String(node.name?.value ?? "").length > BROWSER_SNAPSHOT_LIMITS.maxTextLength || String(node.value?.value ?? "").length > BROWSER_SNAPSHOT_LIMITS.maxTextLength) truncation.text = true;
      const uid = `e${next}`;
      next += 1;
      if (typeof node.backendDOMNodeId === "number") {
        uids.set(uid, node.backendDOMNodeId);
      }
      const states = (node.properties ?? []).filter(property => ["checked", "disabled", "expanded", "selected", "required", "readonly", "pressed", "level"].includes(property.name)).map(property => `${property.name}=${JSON.stringify(property.value?.value)}`);
      if (node.value?.value !== undefined && role !== "password" && !node.properties?.some(property => property.name === "protected" && property.value?.value)) states.push(`value=${JSON.stringify(boundedText(node.value.value))}`);
      const label = (name ? `${role} ${JSON.stringify(name)}` : role) + (states.length ? ` [${states.join(" ")}]` : "");
      const line = `${"  ".repeat(depth)}- ${uid} ${label}`;
      const size = Buffer.byteLength(line) + 1;
      if (bytes + size > BROWSER_SNAPSHOT_LIMITS.maxBytes) { truncation.bytes = true; uids.delete(uid); next--; return; }
      bytes += size;
      lines.push(line);
    }
    for (const childId of node.childIds ?? []) {
      const child = byId.get(childId);
      if (child) walk(child, node.ignored ? depth : depth + 1);
    }
  };
  for (const root of roots.length ? roots : nodes.slice(0, 1)) walk(root, 0);
  return { tree: lines.join("\n") || "(empty)", uids, nodeCount: next - 1, truncation };
}

function consoleText(args: unknown): string {
  if (!Array.isArray(args)) return String(args ?? "");
  return args
    .map((arg) => {
      if (!arg || typeof arg !== "object") return String(arg);
      const record = arg as { value?: unknown; description?: string; type?: string };
      if (typeof record.value === "string") return record.value;
      if (record.value !== undefined) return String(record.value);
      if (typeof record.description === "string") return record.description;
      return record.type ?? "";
    })
    .filter(Boolean)
    .join(" ");
}

/**
 * CDP session bound to one guest WebContents. Re-attaches when the view is
 * recreated. Snapshot uids are valid only until the next snapshot.
 */
export class BrowserCdp {
  private viewportOverride = false;
  private viewport?: { width: number; height: number; mobile: boolean };
  private attachedId: number | null = null;
  private uids = new Map<string, number>();
  private messages: BrowserConsoleMessage[] = [];
  private snapshotSequence = 0;
  private documentGeneration = 0;
  private lastSnapshotHash: string | undefined;
  private pendingDialog?: { type: string; message: string; defaultPrompt?: string };
  private onDebuggerMessage?: (
    event: unknown,
    method: string,
    params: unknown,
  ) => void;

  isAttached(wc: WebContents): boolean {
    return this.attachedId === wc.id && !wc.isDestroyed() && wc.debugger.isAttached();
  }
  generation(): number { return this.documentGeneration; }
  viewportStatus() { return this.viewport ? { ...this.viewport, reset: false } : { reset: true }; }

  async attach(wc: WebContents): Promise<void> {
    if (wc.isDestroyed()) {
      throw new Error("browser guest is not available");
    }
    if (this.isAttached(wc)) return;
    this.detach();
    if (!wc.debugger.isAttached()) {
      wc.debugger.attach(BROWSER_CDP_PROTOCOL);
    }
    this.attachedId = wc.id;
    this.onDebuggerMessage = (_event, method, params) => {
      if (method === "Page.javascriptDialogOpening") { const input = params as any; this.pendingDialog = { type: String(input.type), message: boundedText(input.message), defaultPrompt: boundedText(input.defaultPrompt) }; return; }
      if (method === "Page.javascriptDialogClosed") { this.pendingDialog = undefined; return; }
      if (method === "Page.frameNavigated") {
        const frame = (params as { frame?: { parentId?: string } } | null)?.frame;
        if (frame && !frame.parentId) {
          this.uids.clear();
          this.documentGeneration += 1;
          this.lastSnapshotHash = undefined;
        }
        return;
      }
      if (method !== "Runtime.consoleAPICalled" && method !== "Console.messageAdded") {
        return;
      }
      const record = params && typeof params === "object" ? (params as Record<string, unknown>) : {};
      const type =
        typeof record.type === "string"
          ? record.type
          : typeof (record.message as { level?: string } | undefined)?.level === "string"
            ? (record.message as { level: string }).level
            : "log";
      const text =
        method === "Console.messageAdded"
          ? String((record.message as { text?: string } | undefined)?.text ?? "")
          : consoleText(record.args);
      const value = boundedText(text);
      const timestamp = Date.now();
      const existing = this.messages.find(message => message.type === type && message.text === value);
      if (existing) { existing.count = (existing.count ?? 1) + 1; existing.timestamp = timestamp; }
      else this.messages.push({ type, text: value, timestamp, firstTimestamp: timestamp, count: 1 });
      if (this.messages.length > MAX_CONSOLE_MESSAGES) this.messages.shift();
    };
    wc.debugger.on("message", this.onDebuggerMessage);
    await wc.debugger.sendCommand("Runtime.enable");
    await wc.debugger.sendCommand("Console.enable");
    await wc.debugger.sendCommand("Page.enable");
    await wc.debugger.sendCommand("DOM.enable");
    await wc.debugger.sendCommand("Accessibility.enable");
  }

  detach(wc?: WebContents): void {
    const target = wc && !wc.isDestroyed() ? wc : null;
    if (target?.debugger.isAttached()) {
      if (this.onDebuggerMessage) {
        target.debugger.off("message", this.onDebuggerMessage);
      }
      try {
        target.debugger.detach();
      } catch {
        // Already detached.
      }
    }
    this.onDebuggerMessage = undefined;
    this.attachedId = null;
    this.uids.clear();
    this.documentGeneration += 1;
    this.lastSnapshotHash = undefined;
  }

  async send(wc: WebContents, method: string, params?: unknown): Promise<unknown> {
    if (!isAllowedCdpMethod(method)) {
      throw Object.assign(new Error(`CDP method not allowed: ${method}`), {
        code: "PERMISSION_DENIED",
      });
    }
    await this.attach(wc);
    return wc.debugger.sendCommand(
      method,
      (params && typeof params === "object" ? params : {}) as Record<string, unknown>,
    );
  }

  async snapshot(wc: WebContents): Promise<SnapshotResult> {
    await this.attach(wc);
    const raw = (await wc.debugger.sendCommand("Accessibility.getFullAXTree")) as {
      nodes?: AxNode[];
    };
    const flattened = flattenAxTree(Array.isArray(raw?.nodes) ? raw.nodes : []);
    const compactTree = flattened.tree;
    const truncation = Object.keys(flattened.truncation).length ? flattened.truncation : undefined;
    const url = wc.getURL();
    const title = wc.getTitle();
    const contentHash = createHash("sha256").update(JSON.stringify({ tree: compactTree, url: new URL(url || "about:blank").origin + new URL(url || "about:blank").pathname, title, generation: this.documentGeneration })).digest("hex");
    const snapshotId = `snapshot-${++this.snapshotSequence}`;
    this.uids = flattened.uids;
    const unchanged = this.lastSnapshotHash === contentHash;
    this.lastSnapshotHash = contentHash;
    return {
      tree: unchanged ? "(unchanged)" : compactTree,
      url,
      title,
      contentHash,
      snapshotId,
      documentGeneration: this.documentGeneration,
      unchanged,
      nodeCount: flattened.nodeCount,
      truncation,
    };
  }

  async setViewport(wc: WebContents, input: { width?: number; height?: number; mobile?: boolean; reset?: boolean }) {
    await this.attach(wc);
    if (input.reset === true) { await wc.debugger.sendCommand("Emulation.clearDeviceMetricsOverride"); this.viewportOverride = false; this.viewport = undefined; this.uids.clear(); this.documentGeneration += 1; this.lastSnapshotHash = undefined; return { reset: true }; }
    const { width, height } = input;
    if (!Number.isInteger(width) || !Number.isInteger(height) || width! < 240 || width! > 3840 || height! < 240 || height! > 2160) throw Object.assign(new Error("Viewport must be 240..3840 by 240..2160 CSS pixels"), { code: "BROWSER_INVALID_INPUT" });
    await wc.debugger.sendCommand("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: input.mobile === true });
    this.viewportOverride = true;
    this.viewport = { width: width!, height: height!, mobile: input.mobile === true };
    this.uids.clear(); this.documentGeneration += 1; this.lastSnapshotHash = undefined;
    return { width, height, mobile: input.mobile === true, coordinateSpace: "css-pixels" };
  }

  /** Native hidden views need a viewport surface; preserve explicit emulation. */
  async withRenderViewport<T>(wc: WebContents, work: () => Promise<T>, captureFrames = false): Promise<T> {
    await this.attach(wc);
    await wc.debugger.sendCommand("Emulation.setFocusEmulationEnabled", { enabled: true });
    // Hidden Windows guests need compositor requests while a full-page
    // screenshot is captured. Ordinary locator actions do not need this loop.
    let capturing = false;
    const capture = () => {
      if (capturing || wc.isDestroyed()) return;
      capturing = true;
      void wc.capturePage({ x: 0, y: 0, width: 1, height: 1 }).catch(() => undefined).finally(() => { capturing = false; });
    };
    if (captureFrames) capture();
    const frames = captureFrames ? setInterval(capture, 100) : undefined;
    try { return await this.renderViewport(wc, work); }
    finally { if (frames) clearInterval(frames); if (!wc.isDestroyed() && wc.debugger.isAttached()) await wc.debugger.sendCommand("Emulation.setFocusEmulationEnabled", { enabled: false }); }
  }
  private async renderViewport<T>(wc: WebContents, work: () => Promise<T>): Promise<T> {
    if (this.viewportOverride) return work();
    const metrics = await wc.debugger.sendCommand("Page.getLayoutMetrics") as { cssLayoutViewport?: { clientWidth?: number; clientHeight?: number } };
    const width = Math.min(3840, Math.max(240, Math.round(metrics.cssLayoutViewport?.clientWidth || 1280)));
    const height = Math.min(2160, Math.max(240, Math.round(metrics.cssLayoutViewport?.clientHeight || 800)));
    await wc.debugger.sendCommand("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false });
    try {
      return await work();
    } finally {
      if (!wc.isDestroyed() && wc.debugger.isAttached()) await wc.debugger.sendCommand("Emulation.clearDeviceMetricsOverride");
    }
  }

  async dialog(wc: WebContents, operation: "status" | "accept" | "dismiss", text?: string) {
    await this.attach(wc);
    if (!this.pendingDialog) return { pending: false };
    const status = { pending: true, ...this.pendingDialog };
    if (operation !== "status") { await wc.debugger.sendCommand("Page.handleJavaScriptDialog", { accept: operation === "accept", promptText: text }); this.pendingDialog = undefined; }
    return { ...status, pending: operation === "status" };
  }

  async screenshot(
    wc: WebContents,
    input: BrowserScreenshotOptions = {},
  ): Promise<{ mimeType: "image/jpeg" | "image/png"; data: string; width: number; height: number; viewportWidth: number; viewportHeight: number; coordinateSpace: "css-pixels"; byteLength: number; truncated?: boolean }> {
    if (input.format !== undefined && !["png", "jpeg"].includes(input.format) || [input.maxWidth, input.maxHeight, input.maxBytes, input.quality].some(value => value !== undefined && (!Number.isFinite(value) || value <= 0))) throw Object.assign(new Error("Invalid screenshot options"), { code: "BROWSER_INVALID_INPUT" });
    await this.attach(wc);
    let clip: { x: number; y: number; width: number; height: number; scale: number } | undefined;
    const metrics = (await wc.debugger.sendCommand("Page.getLayoutMetrics")) as {
      cssVisualViewport?: { clientWidth?: number; clientHeight?: number };
      contentSize?: { width?: number; height?: number };
      cssContentSize?: { width?: number; height?: number };
    };
    const viewportWidth = Math.max(1, Number(metrics.cssVisualViewport?.clientWidth ?? metrics.cssContentSize?.width ?? metrics.contentSize?.width) || 1);
    const viewportHeight = Math.max(1, Number(metrics.cssVisualViewport?.clientHeight ?? metrics.cssContentSize?.height ?? metrics.contentSize?.height) || 1);
    let outputWidth = viewportWidth;
    let outputHeight = viewportHeight;
    let truncated = false;
    if (input.fullPage || input.clip) {
      const size = metrics.cssContentSize ?? metrics.contentSize ?? { width: 0, height: 0 };
      const crop = input.clip;
      if (crop && (![crop.x, crop.y, crop.width, crop.height].every(Number.isFinite) || crop.x < 0 || crop.y < 0 || crop.width <= 0 || crop.height <= 0 || crop.x + crop.width > Number(size.width) || crop.y + crop.height > Number(size.height))) throw Object.assign(new Error("Screenshot crop is outside the document"), { code: "BROWSER_INVALID_INPUT" });
      const width = Math.max(1, crop?.width ?? (Number(size.width) || 1));
      const documentHeight = Math.max(1, crop?.height ?? (Number(size.height) || 1));
      const maxWidth = Math.min(3840, Math.max(240, input.maxWidth ?? SCREENSHOT_MAX_WIDTH));
      const scale = width > maxWidth ? maxWidth / width : 1;
      const maxHeight = Math.min(BROWSER_SNAPSHOT_LIMITS.maxScreenshotHeight, Math.max(240, input.maxHeight ?? BROWSER_SNAPSHOT_LIMITS.maxScreenshotHeight));
      const height = Math.min(documentHeight, maxHeight / scale);
      truncated = height < documentHeight;
      clip = { x: crop?.x ?? 0, y: crop?.y ?? 0, width, height, scale };
      outputWidth = Math.max(1, Math.round(width * scale));
      outputHeight = Math.max(1, Math.round(height * scale));
    }
    const result = (await wc.debugger.sendCommand("Page.captureScreenshot", {
      format: input.format === "png" ? "png" : "jpeg",
      ...(input.format === "png" ? {} : { quality: Math.min(100, Math.max(1, input.quality ?? 70)) }),
      ...(clip ? { clip, captureBeyondViewport: true } : {}),
    })) as { data?: string };
    if (typeof result?.data !== "string" || !result.data) {
      throw new Error("screenshot produced no data");
    }
    const byteLength = Buffer.byteLength(result.data, "base64");
    if (byteLength > Math.min(BROWSER_SNAPSHOT_LIMITS.maxScreenshotBytes, input.maxBytes ?? BROWSER_SNAPSHOT_LIMITS.maxScreenshotBytes)) throw new Error("screenshot exceeds browser payload limit");
    return { mimeType: input.format === "png" ? "image/png" : "image/jpeg", data: result.data, width: outputWidth, height: outputHeight, viewportWidth, viewportHeight, coordinateSpace: "css-pixels" as const, byteLength, ...(truncated ? { truncated: true } : {}) };
  }

  async viewportScreenshot(wc: WebContents) {
    const image = await wc.capturePage();
    const size = image.getSize();
    if (image.isEmpty() || size.width < 1 || size.height < 1) {
      return this.screenshot(wc);
    }
    const bytes = image.toJPEG(70);
    if (bytes.byteLength > BROWSER_SNAPSHOT_LIMITS.maxScreenshotBytes) return this.screenshot(wc);
    return { mimeType: "image/jpeg" as const, data: bytes.toString("base64"), width: size.width, height: size.height, viewportWidth: size.width, viewportHeight: size.height, coordinateSpace: "css-pixels" as const, byteLength: bytes.byteLength };
  }

  async click(wc: WebContents, uid: string, button: "left" | "right" | "middle" = "left"): Promise<void> {
    if (!["left", "right", "middle"].includes(button)) throw Object.assign(new Error("Invalid mouse button"), { code: "BROWSER_INVALID_INPUT" });
    const backendNodeId = this.requireUid(uid);
    await this.attach(wc);
    await wc.debugger.sendCommand("DOM.scrollIntoViewIfNeeded", { backendNodeId });
    const model = (await wc.debugger.sendCommand("DOM.getBoxModel", { backendNodeId })) as {
      model?: { content?: number[] };
    };
    const quad = model.model?.content;
    if (!Array.isArray(quad) || quad.length < 8) {
      throw Object.assign(new Error(`no box model for ${uid}`), { code: "NOT_FOUND" });
    }
    const x = (quad[0] + quad[2] + quad[4] + quad[6]) / 4;
    const y = (quad[1] + quad[3] + quad[5] + quad[7]) / 4;
    await wc.debugger.sendCommand("Input.dispatchMouseEvent", {
      type: "mousePressed",
      x,
      y,
      button,
      clickCount: 1,
    });
    await wc.debugger.sendCommand("Input.dispatchMouseEvent", {
      type: "mouseReleased",
      x,
      y,
      button,
      clickCount: 1,
    });
  }

  async fill(wc: WebContents, uid: string, text: string): Promise<void> {
    const backendNodeId = this.requireUid(uid);
    await this.attach(wc);
    const resolved = (await wc.debugger.sendCommand("DOM.resolveNode", { backendNodeId })) as {
      object?: { objectId?: string };
    };
    const objectId = resolved.object?.objectId;
    if (!objectId) {
      throw Object.assign(new Error(`could not resolve ${uid}`), { code: "NOT_FOUND" });
    }
    await wc.debugger.sendCommand("Runtime.callFunctionOn", {
      objectId,
      functionDeclaration: `function (value) {
        this.focus();
        if ("value" in this) {
          this.value = value;
          this.dispatchEvent(new Event("input", { bubbles: true }));
          this.dispatchEvent(new Event("change", { bubbles: true }));
          return;
        }
        this.textContent = value;
        this.dispatchEvent(new Event("input", { bubbles: true }));
      }`,
      arguments: [{ value: text }],
    });
  }

  private async focus(wc: WebContents, uid: string): Promise<void> {
    const backendNodeId = this.requireUid(uid);
    await this.attach(wc);
    await wc.debugger.sendCommand("DOM.focus", { backendNodeId });
  }

  async type(wc: WebContents, uid: string | undefined, text: string, clearFirst = false): Promise<void> {
    if (typeof uid === "string" && uid.trim()) {
      await this.focus(wc, uid);
      if (clearFirst) await this.fill(wc, uid, "");
    } else if (clearFirst) {
      throw Object.assign(new Error("clearFirst requires a snapshot ref"), { code: "BROWSER_INVALID_INPUT" });
    }
    await this.attach(wc);
    await wc.debugger.sendCommand("Input.insertText", { text: text.slice(0, MAX_EVALUATE_CHARS) });
  }

  async keypress(wc: WebContents, uid: string | undefined, key: string, modifiers: string[] = []): Promise<void> {
    const codes: Record<string, number> = { Enter: 13, Tab: 9, Escape: 27, Backspace: 8, Delete: 46, ArrowLeft: 37, ArrowUp: 38, ArrowRight: 39, ArrowDown: 40, Home: 36, End: 35, PageUp: 33, PageDown: 34, Space: 32 };
    const normalized = normalizeBrowserKey(key);
    if (!(normalized in codes) && !/^[a-z0-9]$/i.test(normalized)) throw Object.assign(new Error("unsupported Browser key"), { code: "BROWSER_INVALID_INPUT" });
    if (uid) await this.focus(wc, uid);
    else await this.attach(wc);
    const mask = modifiers.reduce((value, modifier) => {
      const bit = { Alt: 1, Control: 2, Meta: 4, Shift: 8 }[normalizeBrowserKey(modifier) as "Alt" | "Control" | "Meta" | "Shift"];
      if (!bit) throw Object.assign(new Error("unsupported Browser key modifier"), { code: "BROWSER_INVALID_INPUT" });
      return value | bit;
    }, 0);
    const virtualCode = codes[normalized] ?? normalized.toUpperCase().charCodeAt(0);
    const options = { key: normalized === "Space" ? " " : normalized, code: normalized, windowsVirtualKeyCode: virtualCode, modifiers: mask };
    await wc.debugger.sendCommand("Input.dispatchKeyEvent", { type: "keyDown", ...options });
    await wc.debugger.sendCommand("Input.dispatchKeyEvent", { type: "keyUp", ...options });
  }

  async evaluate(wc: WebContents, expression: string): Promise<unknown> {
    await this.attach(wc);
    const result = (await wc.debugger.sendCommand("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true,
    })) as {
      result?: { value?: unknown; description?: string; type?: string };
      exceptionDetails?: { text?: string; exception?: { description?: string } };
    };
    if (result.exceptionDetails) {
      const message =
        result.exceptionDetails.exception?.description ||
        result.exceptionDetails.text ||
        "evaluation failed";
      throw Object.assign(new Error(message), { code: "TOOL_FAILED" });
    }
    const value = result.result?.value ?? result.result?.description ?? null;
    const serialized = JSON.stringify(value);
    if (serialized && serialized.length > MAX_EVALUATE_CHARS) {
      return {
        truncated: true,
        value: serialized.slice(0, MAX_EVALUATE_CHARS),
      };
    }
    return value;
  }

  console(limit = 50, options: { types?: string[]; contains?: string; since?: number; clear?: boolean } = {}): BrowserConsoleMessage[] {
    const cap = Math.min(MAX_CONSOLE_MESSAGES, Math.max(1, Math.floor(limit) || 50));
    const messages = this.messages.filter(message => (!options.types?.length || options.types.includes(message.type)) && (!options.contains || message.text.includes(options.contains)) && (options.since === undefined || message.timestamp >= options.since)).sort((a, b) => a.timestamp - b.timestamp).slice(-cap);
    if (options.clear) this.messages = [];
    let bytes = 0;
    return messages.reverse().filter((message) => { const size = Buffer.byteLength(message.text, "utf8"); if (bytes + size > BROWSER_SNAPSHOT_LIMITS.maxConsoleBytes) return false; bytes += size; return true; }).reverse();
  }

  private requireUid(uid: string): number {
    const id = this.uids.get(uid.trim());
    if (typeof id !== "number") {
      throw Object.assign(
        new Error(`unknown or stale uid "${uid}"; call snapshot first`),
        { code: "INVALID_ARGUMENT" },
      );
    }
    return id;
  }
}
