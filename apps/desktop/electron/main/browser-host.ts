import type { BrowserState } from "@pi-desktop/shared";
import type { SnapshotResult } from "./browser-cdp";
import type { BrowserTabsPane } from "./browser-tabs-pane";
import { BrowserCdp } from "./browser-cdp";
import { BrowserRenderHost } from "./browser-render-host";
import { convertBrowserSurfaceMeasurement, type BrowserSurfaceMeasurement } from "./browser-surface-geometry";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

export const BROWSER_VIEW_ID = "browser";

export type BrowserRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type BrowserTarget = { sessionId: string; browserId: string; incarnation?: number };

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
  pane: BrowserTabsPane;
  isCapabilityEnabled?: () => boolean;
  getFileRoot: (sessionId?: string) => Promise<string | null>;
  getScratchDir?: (sessionId?: string) => string | null;
  onState: (state: BrowserState) => void;
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
  private readonly clients = new Map<number, { cdp: BrowserCdp; wc: NonNullable<ReturnType<BrowserTabsPane["getWebContents"]>> }>();
  private renderHost = new BrowserRenderHost();
  private readonly preparations = new WeakMap<object, Promise<void>>();
  private readonly deps: BrowserHostDeps;
  private chrome: ChromeSurface | null = null;
  private hole: BrowserRect | null = null;
  private holePluginId: string | null = null;
  private readonly locations = new Map<string, string>();
  private chromeSessionId: string | null = null;
  private started = false;

  constructor(deps: BrowserHostDeps) {
    this.deps = deps;
    this.pane = deps.pane;
  }

  setChromeSurface(surface: ChromeSurface | null): void {
    this.chrome = surface;
    this.applyGuest();
  }

  setCoreSurface(surface: { visible: boolean; bounds: BrowserRect; measurement?: BrowserSurfaceMeasurement; sessionId?: string; browserId?: string } | null, contentBounds?: BrowserRect): void {
    if (surface?.sessionId) this.setChromeSession(surface.sessionId);
    if (surface?.visible && surface.browserId) this.activateTab(surface.sessionId ?? "", surface.browserId);
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
    this.setChromeSession(sessionId);
    this.pane.activate(sessionId, browserId);
    this.applyGuest();
    return this.pane.getState();
  }

  closeTab(sessionId: string, browserId: string): void {
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

  async screenshot(input: { fullPage?: boolean } = {}, sessionId?: string, target?: BrowserTarget): Promise<{ mimeType: string; data: string; path?: string }> {
    const { wc, cdp } = await this.client(target);
    const pane = this.targetTab(target).pane;
    const shot = await this.renderHost.run(pane, () => cdp.withRenderViewport(wc, () => cdp.screenshot(wc, input)));
    const scratch = this.deps.getScratchDir?.(target?.sessionId ?? sessionId ?? this.chromeSessionId ?? undefined);
    if (!scratch) throw new Error("Browser screenshot requires a session scratch directory");
    try {
      mkdirSync(scratch, { recursive: true });
      const path = join(scratch, `browser-screenshot-${wc.id}-${Date.now()}.jpg`);
      writeFileSync(path, Buffer.from(shot.data, "base64"));
      return { ...shot, path };
    } catch {
      throw new Error("Browser screenshot could not be saved");
    }
  }

  async click(uid: string, target?: BrowserTarget): Promise<void> {
    const { wc, cdp } = await this.client(target);
    await this.renderHost.run(this.targetTab(target).pane, () => cdp.withRenderViewport(wc, async () => {
      // Capture commits a compositor frame so reparented guests have hit-test data.
      await cdp.screenshot(wc);
      await cdp.click(wc, uid);
    }));
  }

  async fill(uid: string, text: string, target?: BrowserTarget): Promise<void> {
    const { wc, cdp } = await this.client(target);
    await cdp.fill(wc, uid, text);
  }

  async type(uid: string | undefined, text: string, clearFirst: boolean, target?: BrowserTarget): Promise<void> {
    const { wc, cdp } = await this.client(target);
    await this.renderHost.run(this.targetTab(target).pane, () => cdp.withRenderViewport(wc, () => cdp.type(wc, uid, text, clearFirst)));
  }

  async keypress(uid: string | undefined, key: string, modifiers: string[], target?: BrowserTarget): Promise<void> {
    const { wc, cdp } = await this.client(target);
    await this.renderHost.run(this.targetTab(target).pane, () => cdp.withRenderViewport(wc, () => cdp.keypress(wc, uid, key, modifiers)));
  }

  async setViewport(input: { width?: number; height?: number; mobile?: boolean; reset?: boolean }, target?: BrowserTarget) {
    const { wc, cdp } = await this.client(target);
    return cdp.setViewport(wc, input);
  }

  async evaluate(expression: string, target?: BrowserTarget): Promise<unknown> {
    const { wc, cdp } = await this.client(target);
    return cdp.evaluate(wc, expression);
  }

  async console(limit?: number, target?: BrowserTarget): Promise<{ messages: ReturnType<BrowserCdp["console"]> }> {
    const { wc, cdp } = await this.client(target);
    await cdp.attach(wc);
    return { messages: cdp.console(limit) };
  }

  async cdpCommand(method: string, params?: unknown, target?: BrowserTarget): Promise<unknown> {
    const { wc, cdp } = await this.client(target);
    return cdp.send(wc, method, params);
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
    for (const { cdp, wc } of this.clients.values()) cdp.detach(wc);
    this.clients.clear();
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
    const bounds = this.guestBounds();
    const url = this.pane.getState()?.url;
    if (!bounds || (!this.started && !url)) {
      this.pane.setVisible(false);
      return;
    }
    this.pane.setBounds(bounds);
    this.pane.setVisible(true);
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
    }
    if (this.pane.resolveTab(resolved.sessionId, resolved.browserId).pane !== resolved.pane) {
      throw Object.assign(new Error("Browser tab was replaced"), { code: "BROWSER_TAB_NOT_FOUND" });
    }
    const wc = resolved.pane.getWebContents();
    if (!wc || wc.isDestroyed()) throw Object.assign(new Error("browser guest is not available"), { code: "UNAVAILABLE" });
    let client = this.clients.get(wc.id);
    if (!client) {
      client = { cdp: new BrowserCdp(), wc };
      this.clients.set(wc.id, client);
      const owned = client;
      wc.once("destroyed", () => { owned.cdp.detach(wc); this.clients.delete(wc.id); });
    }
    return client;
  }
}
