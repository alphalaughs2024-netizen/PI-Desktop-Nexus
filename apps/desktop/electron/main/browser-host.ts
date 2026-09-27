import type { BrowserState } from "@pi-desktop/shared";
import type { SnapshotResult } from "./browser-cdp";
import type { BrowserTabsPane } from "./browser-tabs-pane";
import { BrowserCdp } from "./browser-cdp";
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
  private readonly cdp = new BrowserCdp();
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
      if (restoreLocation && this.pane.activeBrowserId() === "browser-core-1" && !this.pane.getState()) void this.rebindSession(next);
    }
  }

  activateTab(sessionId: string, browserId: string): BrowserState | null {
    this.setChromeSession(sessionId);
    const previous = this.pane.getWebContents();
    this.pane.activate(sessionId, browserId);
    if (previous !== this.pane.getWebContents()) this.cdp.detach(previous ?? undefined);
    this.applyGuest();
    return this.pane.getState();
  }

  closeTab(sessionId: string, browserId: string): void {
    const previous = this.pane.getWebContents();
    this.pane.close(sessionId, browserId);
    if (!this.pane.listTabs().some((tab) => tab.sessionId === sessionId)) this.locations.delete(sessionId);
    if (previous !== this.pane.getWebContents()) this.cdp.detach(previous ?? undefined);
    this.applyGuest();
  }

  activeBrowserId(): string { return this.pane.activeBrowserId(); }
  hasTab(sessionId: string, browserId: string): boolean { return this.pane.hasTab(sessionId, browserId); }
  listTabs() { return this.pane.listTabs(); }

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
  ): Promise<BrowserState | null> {
    const target = String(input.path ?? input.url ?? "").trim();
    if (!target) return this.pane.getState();
    const background =
      Boolean(sessionId) &&
      Boolean(this.chromeSessionId) &&
      sessionId !== this.chromeSessionId;
    if (background && !browserId) return this.pane.getState();
    if (browserId && !this.pane.hasTab(sessionId ?? "", browserId)) {
      throw Object.assign(new Error("Browser tab is unavailable"), { code: "BROWSER_TAB_NOT_FOUND" });
    }
    if (!background && !browserId && sessionId) this.setChromeSession(sessionId, false);
    const root = await this.deps.getFileRoot(sessionId ?? this.chromeSessionId ?? undefined);
    if (browserId && !this.pane.hasTab(sessionId ?? "", browserId)) {
      throw Object.assign(new Error("Browser tab is unavailable"), { code: "BROWSER_TAB_NOT_FOUND" });
    }
    if (!browserId || browserId === "browser-core-1") this.rememberLocation(sessionId ?? this.chromeSessionId ?? undefined, target);
    this.started = true;
    const state = browserId
      ? await this.pane.navigateTabAndWait(sessionId ?? "", browserId, target, root)
      : await this.pane.navigateAndWait(target, root);
    this.applyGuest();
    if (state && (!browserId || (this.pane.activeBrowserId() === browserId && this.chromeSessionId === sessionId))) this.deps.onState(state);
    return state;
  }

  action(action: "back" | "forward" | "reload" | "stop", sessionId?: string, browserId?: string): void {
    if (browserId) this.pane.actionTab(sessionId ?? "", browserId, action);
    else this.pane.action(action);
  }

  getState(): BrowserState | null {
    return this.pane.getState();
  }

  openExternal(): void {
    this.pane.openExternal();
  }

  async snapshot(): Promise<SnapshotResult> {
    const wc = this.requireWebContents();
    return this.cdp.snapshot(wc);
  }

  async screenshot(
    input: { fullPage?: boolean } = {},
    sessionId?: string,
  ): Promise<{ mimeType: string; data: string; path?: string }> {
    const wc = this.requireWebContents();
    const shot = input.fullPage ? await this.cdp.screenshot(wc, input) : await this.cdp.viewportScreenshot(wc);
    const scratch = this.deps.getScratchDir?.(sessionId ?? this.chromeSessionId ?? undefined);
    if (!scratch) throw new Error("Browser screenshot requires a session scratch directory");
    try {
      mkdirSync(scratch, { recursive: true });
      const path = join(scratch, `browser-screenshot-${Date.now()}.jpg`);
      writeFileSync(path, Buffer.from(shot.data, "base64"));
      return { ...shot, path };
    } catch {
      throw new Error("Browser screenshot could not be saved");
    }
  }

  async click(uid: string): Promise<void> {
    await this.cdp.click(this.requireWebContents(), uid);
  }

  async fill(uid: string, text: string): Promise<void> {
    await this.cdp.fill(this.requireWebContents(), uid, text);
  }

  async type(uid: string | undefined, text: string, clearFirst: boolean): Promise<void> {
    await this.cdp.type(this.requireWebContents(), uid, text, clearFirst);
  }

  async keypress(uid: string | undefined, key: string, modifiers: string[]): Promise<void> {
    await this.cdp.keypress(this.requireWebContents(), uid, key, modifiers);
  }

  async evaluate(expression: string): Promise<unknown> {
    return this.cdp.evaluate(this.requireWebContents(), expression);
  }

  console(limit?: number): { messages: ReturnType<BrowserCdp["console"]> } {
    this.ensureCdp();
    return { messages: this.cdp.console(limit) };
  }

  async cdpCommand(method: string, params?: unknown): Promise<unknown> {
    return this.cdp.send(this.requireWebContents(), method, params);
  }

  /**
   * Host `BrowserPreview` facade: plugin must be enabled; the guest loads the
   * workspace file only when that session's chrome is visible (D142).
   */
  async previewWorkspaceFile(
    sessionId: string,
    path: string,
    root: string,
  ): Promise<{ ok: true } | { ok: false; content: string }> {
    if (this.deps.isCapabilityEnabled && !this.deps.isCapabilityEnabled()) {
      return {
        ok: false,
        content:
          "BrowserPreview is blocked by the Browser capability setting. Re-enable Browser in Settings and retry.",
      };
    }
    this.rememberLocation(sessionId, path);
    const background =
      Boolean(this.chromeSessionId) && this.chromeSessionId !== sessionId;
    if (!background) {
      this.setChromeSession(sessionId, false);
      this.started = true;
      await this.pane.navigateAndWait(path, root);
      this.applyGuest();
    }
    return { ok: true };
  }

  recover(): void {
    this.started = false;
    this.pane.retrySurface();
    this.applyGuest();
  }

  disposeGuest(): void {
    this.cdp.detach(this.pane.getWebContents() ?? undefined);
    this.pane.dispose();
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

  private requireWebContents() {
    const wc = this.pane.getWebContents();
    if (!wc || wc.isDestroyed()) {
      throw Object.assign(new Error("browser guest is not available"), {
        code: "UNAVAILABLE",
      });
    }
    return wc;
  }

  private ensureCdp(): void {
    const wc = this.pane.getWebContents();
    if (wc && !wc.isDestroyed()) void this.cdp.attach(wc);
  }
}
