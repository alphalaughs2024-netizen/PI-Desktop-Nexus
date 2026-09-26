import type { BrowserSurfaceStatus } from "@pi-desktop/shared";

export type BrowserTab = { id: string; sessionId: string; title: string; url: string; faviconUrl?: string; loading: boolean; canGoBack: boolean; canGoForward: boolean; browserId: string; guestGeneration: number; surface?: BrowserSurfaceStatus; createdAt: number; lastActivatedAt: number };
export type BrowserTabsContext = { tabs: BrowserTab[]; activeTabId: string | null; nextSequence: number };

export function emptyBrowserTabsContext(): BrowserTabsContext { return { tabs: [], activeTabId: null, nextSequence: 1 }; }
export function createBrowserTabState(context: BrowserTabsContext, sessionId: string, url = ""): { context: BrowserTabsContext; tab: BrowserTab } {
  const id = `browser-tab-${context.nextSequence}`;
  const now = Date.now();
  const tab: BrowserTab = { id, sessionId, title: url || "New tab", url, loading: Boolean(url), canGoBack: false, canGoForward: false, browserId: id, guestGeneration: 0, createdAt: now, lastActivatedAt: now };
  return { context: { tabs: [...context.tabs, tab], activeTabId: id, nextSequence: context.nextSequence + 1 }, tab };
}
export function activateBrowserTabState(context: BrowserTabsContext, browserId: string): BrowserTabsContext { return context.tabs.some((tab) => tab.browserId === browserId) ? { ...context, activeTabId: browserId, tabs: context.tabs.map((tab) => tab.browserId === browserId ? { ...tab, lastActivatedAt: Date.now() } : tab) } : context; }
export function closeBrowserTabState(context: BrowserTabsContext, browserId: string): BrowserTabsContext {
  const index = context.tabs.findIndex((tab) => tab.browserId === browserId); if (index < 0) return context;
  const tabs = context.tabs.filter((tab) => tab.browserId !== browserId); if (context.activeTabId !== browserId) return { ...context, tabs };
  const next = tabs[Math.min(index, tabs.length - 1)]?.browserId ?? null; return { ...context, tabs, activeTabId: next };
}
export function updateBrowserTabState(context: BrowserTabsContext, browserId: string, patch: Partial<BrowserTab>): BrowserTabsContext { return { ...context, tabs: context.tabs.map((tab) => tab.browserId === browserId ? { ...tab, ...patch } : tab) }; }
