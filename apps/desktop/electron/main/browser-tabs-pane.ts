import type { BrowserWindow } from "electron";
import type { BrowserState } from "@pi-desktop/shared";
import type { BrowserPane } from "./browser-view";

const DEFAULT_TAB_ID = "browser-core-1";

function tabKey(sessionId: string, browserId: string): string {
  return JSON.stringify([sessionId, browserId]);
}

/** Retains one isolated page and navigation history for each Browser tab. */
export class BrowserTabsPane {
  private readonly onState: (state: BrowserState) => void;
  private readonly createPane: (onState: (state: BrowserState) => void) => BrowserPane;
  private readonly tabs = new Map<string, BrowserPane>();
  private readonly identities = new Map<string, { sessionId: string; browserId: string }>();
  private readonly activeBySession = new Map<string, string>();
  private activeKey: string | null = null;
  private activeSessionId = "";
  private window: BrowserWindow | null = null;
  private visible = false;
  private bounds = { x: 0, y: 0, width: 0, height: 0 };

  constructor(onState: (state: BrowserState) => void, createPane: (onState: (state: BrowserState) => void) => BrowserPane) {
    this.onState = onState;
    this.createPane = createPane;
    this.activate("", DEFAULT_TAB_ID);
  }

  private activePane(): BrowserPane | null {
    return this.activeKey ? this.tabs.get(this.activeKey) ?? null : null;
  }

  activeBrowserId(): string {
    return this.activeBySession.get(this.activeSessionId) ?? DEFAULT_TAB_ID;
  }

  hasTab(sessionId: string, browserId: string): boolean { return this.tabs.has(tabKey(sessionId, browserId)); }

  activateSession(sessionId: string): void {
    this.activate(sessionId, this.activeBySession.get(sessionId) ?? DEFAULT_TAB_ID);
  }

  activate(sessionId: string, browserId: string): void {
    const id = browserId.trim() || DEFAULT_TAB_ID;
    const key = tabKey(sessionId, id);
    if (this.activeKey === key) return;
    this.activePane()?.setVisible(false);
    this.activeKey = key;
    this.activeSessionId = sessionId;
    this.activeBySession.set(sessionId, id);
    let pane = this.tabs.get(key);
    if (!pane) {
      pane = this.createPane((state) => {
        if (this.activeKey === key) this.onState(state);
      });
      pane.setWindow(this.window);
      this.tabs.set(key, pane);
      this.identities.set(key, { sessionId, browserId: id });
    }
    pane.setBounds(this.bounds);
    pane.setVisible(this.visible);
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
    pane.dispose();
  }

  listTabs(): Array<{ sessionId: string; browserId: string; state: BrowserState | null; generation: number }> {
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
    return pane ? pane.navigateAndWait(raw, fileRoot) : null;
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
