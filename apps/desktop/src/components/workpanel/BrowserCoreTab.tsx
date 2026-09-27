import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { WorkPanelPresentation } from "../../lib/work-panel-presentation";
import { api } from "../../lib/api";
import { BrowserToolbar } from "./BrowserToolbar";
import { BrowserReadinessStrip, type BrowserPanelState } from "./BrowserReadinessStrip";
import { BrowserGuestSurface } from "./BrowserGuestSurface";
import { BrowserOperationStatus } from "./BrowserOperationStatus";
import { BrowserErrorNotice } from "./BrowserErrorNotice";
import { BrowserEmptyState } from "./BrowserEmptyState";
import { BrowserDiagnosticsDrawer } from "./BrowserDiagnosticsDrawer";
import { BrowserTabStrip } from "./BrowserTabStrip";
import { BrowserNewTabSurface } from "./BrowserNewTabSurface";
import { isBrowserGuestSurfaceVisible, isBrowserRecoveryState, type BrowserPresentationState } from "./browser-presentation-state";
import type { BrowserTab } from "../../lib/browser-tabs";

export type BrowserCoreTabProps = { sessionId?: string; location?: string; active?: boolean; blocked?: boolean; presentation: WorkPanelPresentation; transitioning?: boolean; onCloseLast: () => void };
const tabsBySession = new Map<string, { tabs: BrowserTab[]; activeId: string }>();
const emptyViewState: import("@pi-desktop/shared").BrowserViewState = { readiness: "uninitialized", navigation: null, source: "unknown", recoverable: false };

function mapBrowserState(view: import("@pi-desktop/shared").BrowserViewState): BrowserPresentationState {
  if (view.readiness === "blocked") return "policy-blocked";
  if (view.readiness === "closed") return "closed";
  if (view.readiness === "unavailable") return view.lastErrorCode === "BROWSER_UNSUPPORTED" ? "debugger-unavailable" : "unavailable";
  if (view.readiness === "loading") return "loading";
  if (view.readiness === "ready" && !view.safeLocation && !view.navigation?.url) return "no-page";
  if (view.readiness === "ready" && view.surface?.paint === "blank") return "unavailable";
  if (view.readiness === "ready") return "ready";
  return view.readiness === "uninitialized" ? "no-page" : "starting";
}
const browserErrorCopy: Record<string, string> = {
  BROWSER_UNAVAILABLE: "Browser unavailable. Retry or open Diagnostics.",
  BROWSER_POLICY_BLOCKED: "The current capability policy does not allow this action.",
  BROWSER_TIMEOUT: "The Browser timed out. Retry is safe.",
  BROWSER_POSSIBLY_APPLIED: "The action may have reached the page. Inspect the Browser before retrying.",
  BROWSER_STALE_REF: "The element reference expired. Take a fresh snapshot before retrying.",
  BROWSER_UNSUPPORTED: "The Browser cannot inspect this page right now.",
  BROWSER_INVALID_INPUT: "The Browser request is invalid. Check the address and retry.",
  BROWSER_UNKNOWN_ERROR: "Browser action failed. Inspect the Browser state and retry.",
};
function safeBrowserError(error: unknown): string {
  const code = typeof error === "object" && error && "errorCode" in error ? String((error as { errorCode?: unknown }).errorCode) : "BROWSER_UNKNOWN_ERROR";
  return browserErrorCopy[code] ?? browserErrorCopy.BROWSER_UNKNOWN_ERROR;
}

export function BrowserCoreTab({ sessionId, location, active = true, blocked = false, presentation, transitioning = false, onCloseLast }: BrowserCoreTabProps) {
  const { t } = useTranslation();
  const [browserTabs, setBrowserTabs] = useState<BrowserTab[]>(() => tabsBySession.get(sessionId ?? "")?.tabs ?? [{ id: "browser-core-1", sessionId: sessionId ?? "", title: "New tab", url: location ?? "", loading: false, canGoBack: false, canGoForward: false, browserId: "browser-core-1", guestGeneration: 0, createdAt: Date.now(), lastActivatedAt: Date.now() }]);
  const [activeBrowserId, setActiveBrowserId] = useState(() => tabsBySession.get(sessionId ?? "")?.activeId ?? "browser-core-1");
  const activeBrowserIdRef = useRef(activeBrowserId);
  activeBrowserIdRef.current = activeBrowserId;
  useEffect(() => { tabsBySession.set(sessionId ?? "", { tabs: browserTabs, activeId: activeBrowserId }); }, [activeBrowserId, browserTabs, sessionId]);
  const lastLocationRef = useRef(location);
  useEffect(() => { if (!location || location === lastLocationRef.current) return; lastLocationRef.current = location; setBrowserTabs((tabs) => tabs.map((tab) => tab.browserId === activeBrowserIdRef.current ? { ...tab, url: location } : tab)); }, [location]);
  const [viewStateEntry, setViewStateEntry] = useState({ browserId: activeBrowserId, state: emptyViewState });
  const viewState = viewStateEntry.browserId === activeBrowserId ? viewStateEntry.state : emptyViewState;
  const [operation, setOperation] = useState("");
  const [error, setError] = useState("");
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false);
  const [toolbarMenuOpen, setToolbarMenuOpen] = useState(false);
  const [tabMenuOpen, setTabMenuOpen] = useState(false);
  const diagnosticsTriggerRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!active) return;
    const unsubscribe = api.onBrowserViewState((event) => { if (event.sessionId === sessionId && (!event.browserId || event.browserId === activeBrowserIdRef.current)) setViewStateEntry({ browserId: activeBrowserIdRef.current, state: event.state }); });
    const browserId = activeBrowserIdRef.current;
    void api.browserTabActivate(sessionId, browserId).then((next) => {
      if (activeBrowserIdRef.current === browserId) setViewStateEntry({ browserId, state: next });
    }).catch(() => undefined);
    return unsubscribe;
  }, [active, sessionId]);
  useEffect(() => {
    const navigation = viewState.navigation;
    if (viewStateEntry.browserId !== activeBrowserId || !navigation) return;
    setBrowserTabs((tabs) => tabs.map((tab) => tab.browserId === activeBrowserId ? {
      ...tab,
      title: viewState.safeTitle || navigation.title || tab.title,
      url: navigation.url || tab.url,
      loading: navigation.isLoading,
      canGoBack: navigation.canGoBack,
      canGoForward: navigation.canGoForward,
      guestGeneration: viewState.surface?.guestGeneration ?? tab.guestGeneration,
      surface: viewState.surface,
    } : tab));
  }, [activeBrowserId, viewStateEntry]);
  const state: BrowserPresentationState = mapBrowserState(viewState);
  // Only no-page/about:blank renders New Tab. Lifecycle and recovery states
  // remain visible even before a committed location exists.
  const activeTab = browserTabs.find((tab) => tab.browserId === activeBrowserId);
  const isNewTab = !activeTab?.url || activeTab.url === "about:blank";
  const browserState = isNewTab ? null : viewState.navigation;
  const operationLabel = operation || (state === "starting" ? "Starting Browser…" : state === "loading" ? "Loading page…" : "");
  const errorMessage = error || (state === "unavailable" ? "The page loaded, but its Browser surface could not be displayed." : state === "policy-blocked" ? "The current capability policy does not allow this action." : "");
  const performBrowserAction = async (action: import("@pi-desktop/shared").BrowserAction) => { setOperation(action === "back" ? "Going back…" : action === "forward" ? "Going forward…" : action === "reload" ? "Reloading…" : "Stopping…"); setError(""); try { await api.browserAction(action, sessionId, activeBrowserIdRef.current); } catch (caught) { setError(safeBrowserError(caught)); } finally { setOperation(""); } };
  const navigateToAddress = async (url: string, browserId = activeBrowserIdRef.current, ensureActive = true) => { const value = url.trim(); if (!value) return; setBrowserTabs((tabs) => tabs.map((tab) => tab.browserId === browserId ? { ...tab, url: value, title: value.replace(/^https?:\/\//, "").split("/")[0] || "New tab", loading: true } : tab)); setError(""); try { if (ensureActive) await api.browserTabActivate(sessionId, browserId); await api.browserNavigate(value, sessionId, browserId); } catch (caught) { if (activeBrowserIdRef.current === browserId) setError(safeBrowserError(caught)); } finally { setBrowserTabs((tabs) => tabs.map((tab) => tab.browserId === browserId ? { ...tab, loading: false } : tab)); } };
  const runScreenshot = async () => { setOperation("Capturing screenshot…"); setError(""); try { await api.browserScreenshot({ format: "png" }, sessionId); } catch (caught) { setError(safeBrowserError(caught)); } finally { setOperation(""); } };
  const runExternal = async () => { setOperation("Opening external browser…"); setError(""); try { await api.browserOpenExternal(viewState.safeLocation); } catch (caught) { setError(safeBrowserError(caught)); } finally { setOperation(""); } };
  const copyLocation = async () => { if (viewState.safeLocation) { await navigator.clipboard?.writeText(viewState.safeLocation); setOperation(t("panel.browser.copied")); } };
  const recover = async () => { setOperation("Retrying Browser…"); setError(""); try { const result = await api.browserRecover(); if (!(result as { ok?: boolean }).ok) setError(browserErrorCopy.BROWSER_POLICY_BLOCKED); } catch (caught) { setError(safeBrowserError(caught)); } finally { setOperation(""); } };
  const visibleTabs = browserTabs.map((tab) => tab.browserId === activeBrowserId ? { ...tab, loading: tab.loading || state === "loading" } : tab);
  const activateBrowserTab = async (id: string) => {
    if (id === activeBrowserIdRef.current) return;
    activeBrowserIdRef.current = id;
    setActiveBrowserId(id);
    setViewStateEntry({ browserId: id, state: emptyViewState });
    setBrowserTabs((tabs) => tabs.map((tab) => tab.browserId === id ? { ...tab, lastActivatedAt: Date.now() } : tab));
    try { const next = await api.browserTabActivate(sessionId, id); if (activeBrowserIdRef.current === id) setViewStateEntry({ browserId: id, state: next }); } catch (caught) { setError(safeBrowserError(caught)); }
  };
  const newBrowserTab = () => { const id = `browser-core-${crypto.randomUUID()}`; setBrowserTabs((tabs) => [...tabs, { id, sessionId: sessionId ?? "", title: "New tab", url: "", loading: false, canGoBack: false, canGoForward: false, browserId: id, guestGeneration: 0, createdAt: Date.now(), lastActivatedAt: Date.now() }]); void activateBrowserTab(id); };
  const closeBrowserTab = (id: string) => { if (browserTabs.length <= 1) { tabsBySession.delete(sessionId ?? ""); void api.browserTabClose(sessionId, id).catch(() => undefined); onCloseLast(); return; } const index = browserTabs.findIndex((tab) => tab.browserId === id); const next = browserTabs.filter((tab) => tab.browserId !== id); setBrowserTabs(next); if (id === activeBrowserIdRef.current) void activateBrowserTab(next[Math.min(index, next.length - 1)].browserId); void api.browserTabClose(sessionId, id).catch((caught) => setError(safeBrowserError(caught))); };
  const duplicateBrowserTab = (id: string) => { const source = browserTabs.find((tab) => tab.browserId === id); if (!source) return; const nextId = `browser-core-${crypto.randomUUID()}`; setBrowserTabs((tabs) => [...tabs, { ...source, id: nextId, browserId: nextId, loading: false, canGoBack: false, canGoForward: false, guestGeneration: 0, createdAt: Date.now(), lastActivatedAt: Date.now() }]); void (async () => { await activateBrowserTab(nextId); if (source.url && source.url !== "about:blank") await navigateToAddress(source.url, nextId, false); })(); };
  const closeOtherBrowserTabs = (id: string) => { const others = browserTabs.filter((tab) => tab.browserId !== id); setBrowserTabs((tabs) => tabs.filter((tab) => tab.browserId === id)); void activateBrowserTab(id); void (async () => { for (const tab of others) await api.browserTabClose(sessionId, tab.browserId); })().catch((caught) => setError(safeBrowserError(caught))); };
  const reloadBrowserTab = (id: string) => { void (async () => { await activateBrowserTab(id); await api.browserAction("reload", sessionId, id); })().catch((caught) => setError(safeBrowserError(caught))); };
  const focusAddress = (select = false) => window.setTimeout(() => {
    const address = document.querySelector<HTMLInputElement>(".browser-toolbar-address input");
    address?.focus();
    if (select || address?.value) address?.select();
  }, 0);
  useEffect(() => { if (isNewTab) focusAddress(true); }, [isNewTab]);
  const openDiagnostics = () => { diagnosticsTriggerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null; setDiagnosticsOpen(true); };
  return <div className={`browser-core-view browser-core-view--${state}${isNewTab ? " browser-core-view--new-tab" : ""}`} data-browser-presentation={presentation} data-browser-readiness={state} data-browser-location={location ?? ""}>
    <BrowserTabStrip tabs={visibleTabs} activeId={activeBrowserId} onActivate={activateBrowserTab} onClose={closeBrowserTab} onNew={newBrowserTab} onReload={reloadBrowserTab} onDuplicate={duplicateBrowserTab} onCloseOthers={closeOtherBrowserTabs} onContextMenuOpenChange={setTabMenuOpen} />
    <BrowserToolbar key={activeBrowserId} presentation={presentation} browserState={browserState} panelState={state} busy={Boolean(operation)} disabled={blocked || transitioning} sessionId={sessionId} committedLocation={activeTab?.url} onNavigate={navigateToAddress} onAction={performBrowserAction} onScreenshot={runScreenshot} onOpenExternal={runExternal} onCopyLocation={copyLocation} onOpenDiagnostics={() => { diagnosticsTriggerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null; setDiagnosticsOpen(true); }} onMenuOpenChange={setToolbarMenuOpen} />
    <div className="browser-content-viewport" data-browser-content-state={isNewTab ? "no-page" : state}>
      <BrowserReadinessStrip state={state} />
      <BrowserOperationStatus operation={operationLabel} />
      <BrowserErrorNotice message={errorMessage} />
      <div className="browser-page-surface">
        {/* Guest guard remains explicit for no-page and recovery states: !isNewTab && !["unavailable", "policy-blocked", "debugger-unavailable", "closed"] */}
        {isNewTab ? <BrowserNewTabSurface onFocusAddress={() => focusAddress(true)} /> : isBrowserGuestSurfaceVisible(state, isNewTab) ? <BrowserGuestSurface key={activeBrowserId} sessionId={sessionId} browserId={activeBrowserId} blocked={!active || blocked || diagnosticsOpen || toolbarMenuOpen || tabMenuOpen} transitioning={transitioning} /> : isBrowserRecoveryState(state) && <BrowserEmptyState state={state} onRetry={viewState.recoverable ? recover : undefined} onOpenDiagnostics={openDiagnostics} onReopen={recover} />}
      </div>
    </div>
    <BrowserDiagnosticsDrawer open={diagnosticsOpen} panelState={state} presentation={presentation} sessionId={sessionId} onClose={() => { setDiagnosticsOpen(false); diagnosticsTriggerRef.current?.focus(); }} onRetry={viewState.recoverable ? recover : undefined} suggestedAction={viewState.safeSuggestedAction} onOperation={setOperation} onError={setError} />
  </div>;
}
