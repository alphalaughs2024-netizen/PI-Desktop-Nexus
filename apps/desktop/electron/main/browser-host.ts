import type { BrowserState, BrowserInteraction, BrowserLocator, BrowserScreenshotOptions } from "@pi-desktop/shared";
import type { SnapshotResult } from "./browser-cdp";
import type { BrowserTabsPane } from "./browser-tabs-pane";
import { BrowserCdp } from "./browser-cdp";
import { BrowserRenderHost } from "./browser-render-host";
import { convertBrowserSurfaceMeasurement, type BrowserSurfaceMeasurement } from "./browser-surface-geometry";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { BrowserAutomation } from "./browser-automation";
import { BrowserDeveloper } from "./browser-developer";
import { BrowserPageServices } from "./browser-page";
import { BROWSER_CDP_ALLOWLIST } from "./browser-cdp";
import { BrowserSitePermissions } from "./browser-permissions";

export const BROWSER_VIEW_ID = "browser";

export type BrowserRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type BrowserTarget = { sessionId: string; browserId: string; incarnation?: number; signal?: AbortSignal };

export type BrowserNavigateInput = {
  url?: string;
  path?: string;
};

/**
 * Translate a plugin-page hole into window coordinates and clamp it so the
 * guest cannot cover chat/composer outside the calling plugin view.
 */
export function clampGuestBounds(
  view: BrowserRect,
  hole: BrowserRect,
): BrowserRect | null {
  const x = Math.max(view.x, view.x + hole.x);
  const y = Math.max(view.y, view.y + hole.y);
  const right = Math.min(view.x + view.width, view.x + hole.x + hole.width);
  const bottom = Math.min(view.y + view.height, view.y + hole.y + hole.height);
  const width = Math.floor(right - x);
  const height = Math.floor(bottom - y);
  if (width < 1 || height < 1) return null;
  return {
    x: Math.floor(x),
    y: Math.floor(y),
    width,
    height,
  };
}

function asRect(value: unknown): BrowserRect | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const x = Number(record.x);
  const y = Number(record.y);
  const width = Number(record.width);
  const height = Number(record.height);
  if (![x, y, width, height].every((n) => Number.isFinite(n))) return null;
  return { x, y, width, height };
}

export type BrowserHostDeps = {
  onGuestPresented?: () => void;
  pane: BrowserTabsPane;
  isCapabilityEnabled?: () => boolean;
  getFileRoot: (sessionId?: string) => Promise<string | null>;
  getScratchDir?: (sessionId?: string) => string | null;
  onState: (state: BrowserState) => void;
  approveSite?: (origin: string, capability: string, signal?: AbortSignal) => Promise<boolean>;
  selectUploadFiles?: () => Promise<string[]>;
};

type ChromeSurface = {
  visible: boolean;
  bounds: BrowserRect;
};

/**
 * Public `pi.browser.*` implementation: host-owned tab guests driven by
 * plugin chrome through a clamped hole, plus CDP for the agent.
 */
export class BrowserHost {
  private readonly pane: BrowserTabsPane;
  private readonly clients = new Map<number, { cdp: BrowserCdp; automation: BrowserAutomation; developer: BrowserDeveloper; services: BrowserPageServices; permissions: BrowserSitePermissions; wc: NonNullable<ReturnType<BrowserTabsPane["getWebContents"]>> }>();
  private readonly paused = new Set<string>();
  private renderHost = new BrowserRenderHost();
  private readonly preparations = new WeakMap<object, Promise<void>>();
  private readonly deps: BrowserHostDeps;
  private chrome: ChromeSurface | null = null;
  private coreSurfaceTarget: { sessionId: string; browserId: string } | null = null;
  private hole: BrowserRect | null = null;
  private holePluginId: string | null = null;
  private readonly locations = new Map<string, string>();
  private chromeSessionId: string | null = null;
  private started = false;

  constructor(deps: BrowserHostDeps) {
    this.deps = deps;
    this.pane = deps.pane;
    this.pane.onGuestCreated = (sessionId, wc) => {
      if (this.deps.getScratchDir?.(sessionId)) this.ensureClient(wc, sessionId);
    };
  }

  setChromeSurface(surface: ChromeSurface | null): void {
    this.chrome = surface;
    this.applyGuest();
  }

  setCoreSurface(surface: { visible: boolean; bounds: BrowserRect; measurement?: BrowserSurfaceMeasurement; sessionId?: string; browserId?: string } | null, contentBounds?: BrowserRect): void {
    // Geometry is observation, not selection. Late reports cannot revive old tabs.
    if (surface?.sessionId !== undefined && surface.sessionId !== this.pane.activeSession()) return;
    if (surface?.browserId && surface.browserId !== this.pane.activeBrowserId()) return;
    this.coreSurfaceTarget = surface ? { sessionId: this.pane.activeSession(), browserId: this.pane.activeBrowserId() } : null;
    const converted = surface?.measurement && contentBounds ? convertBrowserSurfaceMeasurement(surface.measurement, contentBounds) : surface?.bounds;
    if (converted && "ok" in converted && !converted.ok) { this.chrome = null; this.applyGuest(); return; }
    this.chrome = surface && converted ? { visible: surface.visible, bounds: converted as BrowserRect } : null;
    this.hole = surface ? { x: 0, y: 0, width: surface.bounds.width, height: surface.bounds.height } : null;
    this.holePluginId = surface ? "core" : null;
    this.applyGuest();
  }

  setChromeSession(sessionId: string | undefined, restoreLocation = true): void {
    const next = sessionId?.trim() || null;
    if (this.chromeSessionId === next) return;
    this.chromeSessionId = next;
    if (next) {
      this.pane.activateSession(next);
      if (restoreLocation && this.pane.activeBrowserId() === "browser-core-1" && !this.pane.getState()) void this.rebindSession(next).catch(() => undefined);
    }
  }

  activateTab(sessionId: string, browserId: string): BrowserState | null {
    const next = sessionId.trim() || null;
    const sessionChanged = this.chromeSessionId !== next;
    this.chromeSessionId = next;
    this.pane.activate(sessionId, browserId);
    if (sessionChanged && next && browserId === "browser-core-1" && !this.pane.getState()) void this.rebindSession(next).catch(() => undefined);
    this.applyGuest();
    return this.pane.getState();
  }

  closeTab(sessionId: string, browserId: string): void {
    this.paused.delete(JSON.stringify([sessionId, browserId]));
    this.pane.close(sessionId, browserId);
    if (!this.pane.listTabs().some((tab) => tab.sessionId === sessionId)) this.locations.delete(sessionId);
    this.applyGuest();
  }

  activeBrowserId(sessionId?: string): string { return this.pane.activeBrowserId(sessionId); }
  activeSessionId(): string { return this.pane.activeSession(); }
  resolveTarget(sessionId?: string, browserId?: string, createDefault = false): BrowserTarget {
    const { sessionId: owner, browserId: id, incarnation } = this.pane.resolveTab(sessionId, browserId, createDefault);
    return { sessionId: owner, browserId: id, incarnation };
  }
  hasTab(sessionId: string, browserId: string): boolean { return this.pane.hasTab(sessionId, browserId); }
  listTabs() { return this.pane.listTabs(); }
  tabsState(sessionId: string) { return { sessionId, revision: this.pane.revision(sessionId), activeBrowserId: this.pane.activeBrowserId(sessionId), tabs: this.listTabs().filter(tab => tab.sessionId === sessionId) }; }
  tabOperation(operation: string, target: BrowserTarget, input: { disposition?: "temporary" | "deliverable" | "handoff" } = {}) {
    if (operation === "create") return { browserId: this.pane.createTab(target.sessionId, input) };
    if (operation === "select") this.pane.selectTab(target.sessionId, target.browserId);
    else if (operation === "close") this.closeTab(target.sessionId, target.browserId);
    else if (operation === "mark" && input.disposition) this.pane.markTab(target.sessionId, target.browserId, input.disposition);
    else throw Object.assign(new Error("Unknown tab operation"), { code: "BROWSER_INVALID_INPUT" });
    this.applyGuest();
    return this.tabsState(target.sessionId);
  }
  isPaused(target: BrowserTarget) { return this.paused.has(JSON.stringify([target.sessionId, target.browserId])); }
  async setControl(target: BrowserTarget, owner: "user" | "agent") {
    this.targetTab(target);
    const key = JSON.stringify([target.sessionId, target.browserId]);
    if (owner === "user") {
      this.paused.add(key);
      const wc = this.targetTab(target).pane.getWebContents();
      if (wc) this.clients.get(wc.id)?.automation.dispose();
    } else {
      const wc = this.targetTab(target).pane.getWebContents();
      if (wc) await this.clients.get(wc.id)?.services.annotations("clear");
      this.targetTab(target);
      this.paused.delete(key);
    }
    return { owner, browserId: target.browserId };
  }
  stateForSession(sessionId: string): BrowserState | null {
    const selectedId = this.activeBrowserId(sessionId);
    return this.listTabs().find((tab) => tab.sessionId === sessionId && tab.browserId === selectedId)?.state ?? null;
  }

  /**
   * Content-relative hole inside the calling plugin view. Last writer wins.
   */
  setGuestHole(_pluginId: string, hole: unknown): BrowserRect | null {
    const rect = asRect(hole);
    if (!rect) {
      this.hole = null;
      this.holePluginId = "core";
      this.applyGuest();
      return null;
    }
    this.hole = rect;
    this.holePluginId = "core";
    this.applyGuest();
    return this.guestBounds();
  }

  setGuestVisible(_pluginId: string, visible: boolean): void {
    if (!visible) {
      this.pane.setVisible(false);
      return;
    }
    if (visible) this.applyGuest();
  }

  rememberLocation(sessionId: string | undefined, location: string): void {
    const id = sessionId?.trim();
    const value = location.trim();
    if (!id || !value) return;
    this.locations.set(id, value);
  }

  async navigate(
    input: BrowserNavigateInput,
    sessionId?: string,
    browserId?: string,
    expected?: BrowserTarget,
  ): Promise<BrowserState | null> {
    const location = String(input.path ?? input.url ?? "").trim();
    if (!location) throw Object.assign(new Error("Browser navigation requires a target"), { code: "BROWSER_INVALID_INPUT" });
    const target = this.targetTab(expected ?? this.resolveTarget(sessionId, browserId));
    const root = await this.deps.getFileRoot(target.sessionId || undefined);
    expected?.signal?.throwIfAborted();
    // A close/reopen while the root is resolving must not navigate a new guest.
    if (this.pane.resolveTab(target.sessionId, target.browserId).pane !== target.pane) {
      throw Object.assign(new Error("Browser tab was replaced"), { code: "BROWSER_TAB_NOT_FOUND" });
    }
    const state = await target.pane.navigateAndWait(location, root);
    if (!state?.url) throw Object.assign(new Error("Browser navigation did not create a page"), { code: "UNAVAILABLE" });
    if (target.browserId === "browser-core-1") this.rememberLocation(target.sessionId, location);
    this.started = true;
    this.applyGuest();
    return state;
  }

  action(action: "back" | "forward" | "reload" | "stop", sessionId?: string, browserId?: string, expected?: BrowserTarget): void {
    this.targetTab(expected ?? this.resolveTarget(sessionId, browserId)).pane.action(action);
  }

  getState(target?: BrowserTarget): BrowserState | null {
    return target ? this.targetTab(target).pane.getState() : this.pane.getState();
  }

  openExternal(): void {
    this.pane.openExternal();
  }

  async snapshot(target?: BrowserTarget): Promise<SnapshotResult> {
    const { wc, cdp } = await this.client(target);
    return cdp.snapshot(wc);
  }

  async screenshot(input: BrowserScreenshotOptions = {}, sessionId?: string, target?: BrowserTarget): Promise<{ mimeType: string; data: string; path?: string }> {
    const { wc, cdp } = await this.client(target);
    const pane = this.targetTab(target).pane;
    const shot = await this.renderHost.run(pane, () => cdp.withRenderViewport(wc, () => {
      target?.signal?.throwIfAborted();
      return cdp.screenshot(wc, input);
    }, true));
    target?.signal?.throwIfAborted();
    const scratch = this.deps.getScratchDir?.(target?.sessionId ?? sessionId ?? this.chromeSessionId ?? undefined);
    if (!scratch) throw new Error("Browser screenshot requires a session scratch directory");
    try {
      mkdirSync(scratch, { recursive: true });
      const path = join(scratch, `browser-screenshot-${wc.id}-${Date.now()}.${shot.mimeType === "image/png" ? "png" : "jpg"}`);
      writeFileSync(path, Buffer.from(shot.data, "base64"));
      return { ...shot, path };
    } catch {
      throw new Error("Browser screenshot could not be saved");
    }
  }

  async click(uid: string, target?: BrowserTarget, button: "left" | "right" | "middle" = "left"): Promise<void> {
    const { wc, cdp } = await this.client(target);
    await this.renderHost.run(this.targetTab(target).pane, () => cdp.withRenderViewport(wc, async () => {
      target?.signal?.throwIfAborted();
      // Capture commits a compositor frame so reparented guests have hit-test data.
      await cdp.screenshot(wc);
      target?.signal?.throwIfAborted();
      await cdp.click(wc, uid, button);
    }, true));
  }

  async fill(uid: string, text: string, target?: BrowserTarget): Promise<void> {
    const { wc, cdp } = await this.client(target);
    target?.signal?.throwIfAborted();
    await cdp.fill(wc, uid, text);
  }

  async type(uid: string | undefined, text: string, clearFirst: boolean, target?: BrowserTarget): Promise<void> {
    const { wc, cdp } = await this.client(target);
    await this.renderHost.run(this.targetTab(target).pane, () => cdp.withRenderViewport(wc, () => {
      target?.signal?.throwIfAborted();
      return cdp.type(wc, uid, text, clearFirst);
    }));
  }

  async keypress(uid: string | undefined, key: string, modifiers: string[], target?: BrowserTarget): Promise<void> {
    const { wc, cdp } = await this.client(target);
    await this.renderHost.run(this.targetTab(target).pane, () => cdp.withRenderViewport(wc, () => {
      target?.signal?.throwIfAborted();
      return cdp.keypress(wc, uid, key, modifiers);
    }));
  }

  async setViewport(input: { width?: number; height?: number; mobile?: boolean; reset?: boolean }, target?: BrowserTarget) {
    const { wc, cdp } = await this.client(target);
    return cdp.setViewport(wc, input);
  }

  async evaluate(expression: string, target?: BrowserTarget): Promise<unknown> {
    const { wc, cdp } = await this.client(target);
    target?.signal?.throwIfAborted();
    return cdp.evaluate(wc, expression);
  }

  async console(limit?: number, target?: BrowserTarget, options?: { types?: string[]; contains?: string; since?: number; clear?: boolean }): Promise<{ messages: ReturnType<BrowserCdp["console"]> }> {
    const { wc, cdp } = await this.client(target);
    await cdp.attach(wc);
    return { messages: cdp.console(limit, options) };
  }

  async cdpCommand(method: string, params?: unknown, target?: BrowserTarget): Promise<unknown> {
    const { wc, cdp, developer } = await this.client(target);
    target?.signal?.throwIfAborted();
    if (BROWSER_CDP_ALLOWLIST.has(method)) return cdp.send(wc, method, params);
    return developer.send(method, params as Record<string, unknown>);
  }

  async interact(input: BrowserInteraction, target: BrowserTarget) {
    const { wc, cdp, automation } = await this.client(target);
    return this.renderHost.run(this.targetTab(target).pane, () => cdp.withRenderViewport(wc, async () => {
      target.signal?.throwIfAborted();
      return automation.interact(input, target.signal);
    }));
  }

  async service(name: string, input: any, target: BrowserTarget): Promise<unknown> {
    if (!input || typeof input !== "object" || Array.isArray(input) || JSON.stringify(input).length > 96 * 1024) throw Object.assign(new Error("Invalid or oversized Browser service input"), { code: "BROWSER_INVALID_INPUT" });
    const operations: Record<string, string[]> = { developer: ["enable", "disable", "status"], dialog: ["status", "accept", "dismiss"], downloads: ["list", "pause", "resume", "cancel"], page: ["content", "assets", "save_asset", "export"], annotations: ["start", "read", "clear"], styles: ["apply", "clear"], webmcp: ["list", "call"] };
    if (input.operation !== undefined && operations[name] && !operations[name].includes(input.operation)) throw Object.assign(new Error("Unknown Browser service operation"), { code: "BROWSER_INVALID_INPUT" });
    if (name === "page" && input.operation === "export" && !["pdf", "html", "text"].includes(input.format)) throw Object.assign(new Error("Export requires pdf, html or text format"), { code: "BROWSER_INVALID_INPUT" });
    const { wc, cdp, automation, developer, services } = await this.client(target);
    await cdp.attach(wc);
    target.signal?.throwIfAborted();
    switch (name) {
      case "developer": {
        if (input.operation === "disable") { await developer.revoke(); return developer.status(); }
        if (input.operation !== "enable") return developer.status();
        if (developer.allowed()) return developer.status();
        const origin = BrowserDeveloper.origin(wc.getURL());
        const documentGeneration = cdp.generation();
        if (!origin) throw Object.assign(new Error("Developer approval requires an HTTP(S) site"), { code: "BROWSER_INVALID_INPUT" });
        if (!await this.deps.approveSite?.(origin, "Developer diagnostics", target.signal)) throw Object.assign(new Error("Developer access was not approved"), { code: "PERMISSION_DENIED" });
        target.signal?.throwIfAborted();
        if (cdp.generation() !== documentGeneration) throw Object.assign(new Error("Document changed during Developer approval"), { code: "BROWSER_STALE_REF" });
        return developer.grant(origin);
      }
      case "events": return developer.read(input.cursor, input.methods, input.limit);
      case "metrics": return developer.send("Performance.getMetrics");
      case "console": return { messages: cdp.console(input.limit, input) };
      case "viewport": return cdp.viewportStatus();
      case "dialog": return cdp.dialog(wc, input.operation ?? "status", input.text);
      case "downloads": return services.downloadAction(input.operation, input.id);
      case "page": return services.page(input.operation ?? "content", input, target.signal);
      case "annotations": return services.annotations(input.operation ?? "read");
      case "styles": return services.styles(input.operation, input.selector, input.properties);
      case "webmcp": {
        if (input.operation === "call") {
          const documentUrl = wc.getURL();
          const origin = BrowserDeveloper.origin(documentUrl);
          const documentGeneration = cdp.generation();
          if (!origin || input.documentUrl !== documentUrl || input.documentGeneration !== documentGeneration) throw Object.assign(new Error("Use the current documentUrl and documentGeneration returned by browser_webmcp list"), { code: "BROWSER_STALE_REF" });
          if (!await this.deps.approveSite?.(origin, `WebMCP tool: ${String(input.name).slice(0, 128)}`, target.signal)) throw Object.assign(new Error("WebMCP call was not approved"), { code: "PERMISSION_DENIED" });
          target.signal?.throwIfAborted();
          if (wc.getURL() !== documentUrl || cdp.generation() !== documentGeneration) throw Object.assign(new Error("Document changed during approval"), { code: "BROWSER_STALE_REF" });
        }
        const result = await services.webmcp(input.operation ?? "list", input.name, input.args);
        const json = JSON.stringify(result);
        return Buffer.byteLength(json ?? "") > 96 * 1024 ? { truncated: true, message: "WebMCP result exceeds 96 KiB" } : { result, documentUrl: wc.getURL(), documentGeneration: cdp.generation() };
      }
      case "upload": {
        const url = wc.getURL();
        const documentGeneration = cdp.generation();
        const files = await this.deps.selectUploadFiles?.() ?? [];
        target.signal?.throwIfAborted();
        if (!files.length) throw Object.assign(new Error("No upload files were selected"), { code: "PERMISSION_DENIED" });
        if (wc.getURL() !== url || cdp.generation() !== documentGeneration) throw Object.assign(new Error("Page changed while selecting upload files"), { code: "BROWSER_STALE_REF" });
        return this.renderHost.run(this.targetTab(target).pane, () => cdp.withRenderViewport(wc, () => automation.upload(input.locator as BrowserLocator, files, target.signal)));
      }
      default: throw Object.assign(new Error("Unsupported Browser service"), { code: "BROWSER_INVALID_INPUT" });
    }
  }

  /** Preview execution uses the session's retained guest, even while hidden. */
  async previewWorkspaceFile(sessionId: string, path: string, root: string, target?: BrowserTarget): Promise<{ ok: true } | { ok: false; content: string }> {
    if (this.deps.isCapabilityEnabled && !this.deps.isCapabilityEnabled()) {
      return { ok: false, content: "BrowserPreview is blocked by the Browser capability setting. Re-enable Browser in Settings and retry." };
    }
    const resolved = this.targetTab(target ?? this.resolveTarget(sessionId));
    await resolved.pane.navigateAndWait(path, root);
    this.rememberLocation(sessionId, path);
    this.started = true;
    this.applyGuest();
    return { ok: true };
  }

  recover(): void {
    this.started = false;
    this.pane.retrySurface();
    this.applyGuest();
  }

  disposeGuest(): void {
    for (const { cdp, automation, developer, services, permissions, wc } of this.clients.values()) { automation.dispose(); developer.dispose(); services.dispose(); permissions.dispose(); cdp.detach(wc); }
    this.clients.clear();
    this.paused.clear();
    this.pane.dispose();
    this.renderHost.dispose();
    this.renderHost = new BrowserRenderHost();
    this.started = false;
    this.hole = null;
    this.holePluginId = null;
  }

  diagnostics(): { chromeSessionId?: string; hasGuest: boolean; visible: boolean } {
    return { chromeSessionId: this.chromeSessionId ?? undefined, hasGuest: Boolean(this.pane.getWebContents()), visible: Boolean(this.chrome?.visible) };
  }
  probeSurface() { return this.pane.probeSurface(); }

  private guestBounds(): BrowserRect | null {
    if (!this.chrome?.visible || !this.hole) return null;
    return clampGuestBounds(this.chrome.bounds, this.hole);
  }

  private applyGuest(): void {
    if (this.holePluginId === "core" && this.coreSurfaceTarget && (this.coreSurfaceTarget.sessionId !== this.pane.activeSession() || this.coreSurfaceTarget.browserId !== this.pane.activeBrowserId())) {
      this.pane.setVisible(false);
      return;
    }
    const bounds = this.guestBounds();
    const url = this.pane.getState()?.url;
    if (!bounds || (!this.started && !url)) {
      this.pane.setVisible(false);
      return;
    }
    this.pane.setBounds(bounds);
    this.pane.setVisible(true);
    this.deps.onGuestPresented?.();
  }

  private async rebindSession(sessionId: string): Promise<void> {
    const location = this.locations.get(sessionId);
    if (!location) return;
    const root = await this.deps.getFileRoot(sessionId);
    if (this.chromeSessionId !== sessionId || this.pane.activeBrowserId() !== "browser-core-1" || this.pane.getState()) return;
    this.started = true;
    await this.pane.navigateTabAndWait(sessionId, "browser-core-1", location, root);
    if (this.chromeSessionId === sessionId) this.applyGuest();
  }

  private targetTab(target?: BrowserTarget) {
    target?.signal?.throwIfAborted();
    const resolved = this.pane.resolveTab(target?.sessionId, target?.browserId);
    if (target?.incarnation !== undefined && resolved.incarnation !== target.incarnation) {
      throw Object.assign(new Error("Browser tab was replaced"), { code: "BROWSER_TAB_NOT_FOUND" });
    }
    return resolved;
  }

  private async client(target?: BrowserTarget) {
    const resolved = this.targetTab(target);
    if (!resolved.pane.getWebContents()) {
      let preparation = this.preparations.get(resolved.pane);
      if (!preparation) {
        preparation = resolved.pane.navigateAndWait("about:blank").then(() => undefined);
        this.preparations.set(resolved.pane, preparation);
        void preparation.finally(() => this.preparations.delete(resolved.pane)).catch(() => undefined);
      }
      await preparation;
      target?.signal?.throwIfAborted();
    }
    if (this.pane.resolveTab(resolved.sessionId, resolved.browserId).pane !== resolved.pane) {
      throw Object.assign(new Error("Browser tab was replaced"), { code: "BROWSER_TAB_NOT_FOUND" });
    }
    const wc = resolved.pane.getWebContents();
    if (!wc || wc.isDestroyed()) throw Object.assign(new Error("browser guest is not available"), { code: "UNAVAILABLE" });
    return this.ensureClient(wc, resolved.sessionId);
  }

  private ensureClient(wc: NonNullable<ReturnType<BrowserTabsPane["getWebContents"]>>, sessionId: string) {
    let client = this.clients.get(wc.id);
    if (!client) {
      const scratch = this.deps.getScratchDir?.(sessionId);
      if (!scratch) throw new Error("Browser services require a session scratch directory");
      mkdirSync(scratch, { recursive: true });
      const automation = new BrowserAutomation(wc, scratch);
      client = { cdp: new BrowserCdp(), automation, developer: new BrowserDeveloper(wc, () => automation.dispose()), services: new BrowserPageServices(wc, scratch), permissions: new BrowserSitePermissions(wc, async (origin, capability, signal) => await this.deps.approveSite?.(origin, capability, signal) ?? false, this.deps.isCapabilityEnabled), wc };
      this.clients.set(wc.id, client);
      const owned = client;
      const contentsId = wc.id;
      wc.once("destroyed", () => { owned.automation.dispose(); owned.developer.dispose(); owned.services.dispose(); owned.permissions.dispose(); owned.cdp.detach(wc); this.clients.delete(contentsId); });
    }
    return client;
  }
}
