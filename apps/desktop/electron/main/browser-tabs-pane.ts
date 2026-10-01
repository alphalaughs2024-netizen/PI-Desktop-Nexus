import type { BrowserWindow } from "electron";
import type { BrowserState, BrowserTabRecord } from "@pi-desktop/shared";
import type { BrowserPane } from "./browser-view";
import { randomUUID } from "node:crypto";

const DEFAULT_TAB_ID = "browser-core-1";

function tabKey(sessionId: string, browserId: string): string {
  return JSON.stringify([sessionId, browserId]);
}

/** Retains one isolated page and navigation history for each Browser tab. */
export class BrowserTabsPane {
  private readonly onState: (state: BrowserState) => void;
  private readonly createPane: (onState: (state: BrowserState) => void) => BrowserPane;
  private readonly tabs = new Map<string, BrowserPane>();
  private readonly identities = new Map<string, { sessionId: string; browserId: string; incarnation: number; createdAt: number; openerBrowserId?: string; disposition?: "temporary" | "deliverable" | "handoff" }>();
  onChanged?: (sessionId: string) => void;
  onGuestCreated?: (sessionId: string, wc: NonNullable<ReturnType<BrowserPane["getWebContents"]>>) => void;
  private nextIncarnation = 0;
  private readonly activeBySession = new Map<string, string>();
  private readonly revisions = new Map<string, number>();
  private notificationDepth = 0;
  private readonly pendingNotifications = new Set<string>();
  private activeKey: string | null = null;
  private activeSessionId = "";
  private window: BrowserWindow | null = null;
  private visible = false;
  private bounds = { x: 0, y: 0, width: 0, height: 0 };

  constructor(onState: (state: BrowserState) => void, createPane: (onState: (state: BrowserState) => void) => BrowserPane) {
    this.onState = onState;
    this.createPane = createPane;

  }

  private activePane(): BrowserPane | null {
    return this.activeKey ? this.tabs.get(this.activeKey) ?? null : null;
  }

  activeBrowserId(sessionId = this.activeSessionId): string {
    return this.activeBySession.get(sessionId) ?? DEFAULT_TAB_ID;
  }

  activeSession(): string { return this.activeSessionId; }

  revision(sessionId: string): number { return this.revisions.get(sessionId) ?? 0; }

  private changed(sessionId: string): void {
    if (this.notificationDepth) { this.pendingNotifications.add(sessionId); return; }
    this.revisions.set(sessionId, this.revision(sessionId) + 1);
    this.onChanged?.(sessionId);
  }

  // Tab observers must see the completed selection, never intermediate creation.
  private batchChanges<T>(change: () => T): T {
    this.notificationDepth++;
    try { return change(); }
    finally {
      if (--this.notificationDepth === 0) {
        const sessions = [...this.pendingNotifications];
        this.pendingNotifications.clear();
        for (const sessionId of sessions) this.changed(sessionId);
      }
    }
  }

  resolveTab(sessionId = this.activeSessionId, browserId?: string, createDefault = false) {
    const id = browserId ?? this.activeBrowserId(sessionId);
    const key = tabKey(sessionId, id);
    let pane = this.tabs.get(key);
    if (!pane && browserId && !(createDefault && browserId === DEFAULT_TAB_ID)) {
      throw Object.assign(new Error("Browser tab is unavailable"), { code: "BROWSER_TAB_NOT_FOUND" });
    }
    if (!pane) pane = this.ensureTab(sessionId, id);
    return { sessionId, browserId: id, pane, incarnation: this.identities.get(key)!.incarnation };
  }

  private ensureTab(sessionId: string, browserId: string): BrowserPane {
    const key = tabKey(sessionId, browserId);
    let pane = this.tabs.get(key);
    if (!pane) {
      if (!this.canCreateTab(sessionId)) throw Object.assign(new Error("This chat has reached its 20-tab limit"), { code: "BROWSER_INVALID_INPUT" });
      pane = this.createPane((state) => {
        if (this.activeKey === key) this.onState(state);
        this.changed(sessionId);
      });
      pane.setWindow(this.window);
      pane.onGuestCreated = wc => this.onGuestCreated?.(sessionId, wc);
      pane.onGuestDestroyed = () => { if (this.tabs.get(key) === pane) this.close(sessionId, browserId); };
      this.tabs.set(key, pane);
      this.identities.set(key, { sessionId, browserId, incarnation: ++this.nextIncarnation, createdAt: Date.now() });
      pane.setPopupHandler?.((options) => {
        const popupId = this.createTab(sessionId, { openerBrowserId: browserId });
        const popup = this.tabs.get(tabKey(sessionId, popupId))!;
        const wc = popup.createPopup(options);
        setImmediate(() => {
          if (!this.hasTab(sessionId, popupId)) return;
          if (!options.background && sessionId === this.activeSessionId) this.activate(sessionId, popupId);
          this.changed(sessionId);
        });
        return wc;
      }, () => this.canCreateTab(sessionId));
      this.changed(sessionId);
    }
    return pane;
  }

  hasTab(sessionId: string, browserId: string): boolean { return this.tabs.has(tabKey(sessionId, browserId)); }
  private canCreateTab(sessionId: string): boolean { return [...this.identities.values()].filter(tab => tab.sessionId === sessionId).length < 20; }

  createTab(sessionId: string, options: { openerBrowserId?: string; disposition?: "temporary" | "deliverable" | "handoff" } = {}): string {
    return this.batchChanges(() => {
      const browserId = `browser-core-${randomUUID()}`;
      this.ensureTab(sessionId, browserId);
      Object.assign(this.identities.get(tabKey(sessionId, browserId))!, options);
      if (!this.activeBySession.has(sessionId)) this.activeBySession.set(sessionId, browserId);
      this.changed(sessionId);
      return browserId;
    });
  }

  selectTab(sessionId: string, browserId: string): void {
    this.resolveTab(sessionId, browserId);
    if (this.activeSessionId === sessionId) this.activate(sessionId, browserId);
    else this.activeBySession.set(sessionId, browserId);
    this.changed(sessionId);
  }

  markTab(sessionId: string, browserId: string, disposition: "temporary" | "deliverable" | "handoff") {
    this.resolveTab(sessionId, browserId);
    this.identities.get(tabKey(sessionId, browserId))!.disposition = disposition;
    this.changed(sessionId);
  }

  activateSession(sessionId: string): void {
    this.activate(sessionId, this.activeBySession.get(sessionId) ?? DEFAULT_TAB_ID);
  }

  activate(sessionId: string, browserId: string): void {
    const id = browserId.trim() || DEFAULT_TAB_ID;
    const key = tabKey(sessionId, id);
    if (this.activeKey === key) return;
    this.batchChanges(() => {
      const pane = this.ensureTab(sessionId, id);
      const previous = this.activePane();
      this.activeKey = key;
      this.activeSessionId = sessionId;
      this.activeBySession.set(sessionId, id);
      previous?.setVisible(false);
      pane.setBounds(this.bounds);
      pane.setVisible(this.visible);
      this.changed(sessionId);
    });
  }

  close(sessionId: string, browserId: string): void {
    const key = tabKey(sessionId, browserId);
    const pane = this.tabs.get(key);
    if (!pane) return;
    if (this.activeKey === key) {
      pane.setVisible(false);
      this.activeKey = null;
      this.activeBySession.delete(sessionId);
    }
    this.tabs.delete(key);
    this.identities.delete(key);
    if (this.activeBySession.get(sessionId) === browserId) this.activeBySession.delete(sessionId);
    pane.dispose();
    const next = this.listTabs().find(tab => tab.sessionId === sessionId);
    if (!this.activeBySession.has(sessionId) && next) this.selectTab(sessionId, next.browserId);
    this.changed(sessionId);
  }

  listTabs(): BrowserTabRecord[] {
    return [...this.tabs].map(([key, pane]) => ({
      ...this.identities.get(key)!, state: pane.getState(), generation: pane.surfaceStatus().generation,
    }));
  }

  setWindow(window: BrowserWindow | null): void {
    this.window = window;
    for (const pane of this.tabs.values()) pane.setWindow(window);
  }

  surfaceStatus(): ReturnType<BrowserPane["surfaceStatus"]> {
    return this.activePane()?.surfaceStatus() ?? {
      attachment: "detached", visibility: "hidden", paint: "unknown",
      capture: "unknown", childOrder: "unknown", generation: 0,
    };
  }

  probeSurface() { return this.activePane()?.probeSurface() ?? Promise.resolve({ status: "unavailable" as const, width: 0, height: 0, byteLength: 0 }); }
  retrySurface(): void { this.activePane()?.retrySurface(); }
  getState(): BrowserState | null { return this.activePane()?.getState() ?? null; }
  getWebContents() { return this.activePane()?.getWebContents() ?? null; }
  async navigateTabAndWait(sessionId: string, browserId: string, raw: string, fileRoot: string | null): Promise<BrowserState | null> {
    const pane = this.tabs.get(tabKey(sessionId, browserId));
    if (!pane) throw Object.assign(new Error("Browser tab is unavailable"), { code: "BROWSER_TAB_NOT_FOUND" });
    return pane.navigateAndWait(raw, fileRoot);
  }
  navigate(raw: string, fileRoot: string | null = null) { return this.activePane()?.navigate(raw, fileRoot) ?? null; }
  navigateAndWait(raw: string, fileRoot: string | null = null, timeoutMs?: number) { return this.activePane()?.navigateAndWait(raw, fileRoot, timeoutMs) ?? Promise.resolve(null); }
  action(action: "back" | "forward" | "reload" | "stop"): void { this.activePane()?.action(action); }
  actionTab(sessionId: string, browserId: string, action: "back" | "forward" | "reload" | "stop"): void { this.tabs.get(tabKey(sessionId, browserId))?.action(action); }
  setBounds(bounds: { x: number; y: number; width: number; height: number }): void { this.bounds = bounds; this.activePane()?.setBounds(bounds); }
  setVisible(visible: boolean): void { this.visible = visible; this.activePane()?.setVisible(visible); }
  openExternal(): void { this.activePane()?.openExternal(); }
  dispose(): void {
    for (const pane of this.tabs.values()) pane.dispose();
    this.tabs.clear();
    this.identities.clear();
    this.activeBySession.clear();
    this.activeKey = null;
  }
}
