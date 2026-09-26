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

export type BrowserCoreTabProps = { sessionId?: string; location?: string; blocked?: boolean; presentation: WorkPanelPresentation; transitioning?: boolean };

function mapBrowserState(view: import("@pi-desktop/shared").BrowserViewState): BrowserPanelState {
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

export function BrowserCoreTab({ sessionId, location, blocked = false, presentation, transitioning = false }: BrowserCoreTabProps) {
  const { t } = useTranslation();
  const [browserTabs, setBrowserTabs] = useState(() => [{ id: "browser-core-1", sessionId: sessionId ?? "", title: "New tab", url: location ?? "", loading: false, canGoBack: false, canGoForward: false, browserId: "browser-core-1", guestGeneration: 0, createdAt: Date.now(), lastActivatedAt: Date.now() }]);
  const [activeBrowserId, setActiveBrowserId] = useState("browser-core-1");
  useEffect(() => { if (location && location !== browserTabs[0]?.url) setBrowserTabs((tabs) => tabs.map((tab) => tab.browserId === activeBrowserId ? { ...tab, url: location } : tab)); }, [location]);
  const [viewState, setViewState] = useState<import("@pi-desktop/shared").BrowserViewState>({ readiness: "starting", navigation: null, source: "unknown", recoverable: false });
  const [operation, setOperation] = useState("");
  const [error, setError] = useState("");
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false);
  const diagnosticsTriggerRef = useRef<HTMLElement | null>(null);
  useEffect(() => { void api.browserGetViewState(sessionId).then(setViewState).catch(() => undefined); return api.onBrowserViewState((event) => { if (event.sessionId === sessionId) setViewState(event.state); }); }, [sessionId]);
  const state = mapBrowserState(viewState);
  const browserState = viewState.navigation;
  const operationLabel = operation || (state === "starting" ? "Starting Browser…" : state === "loading" ? "Loading page…" : "");
  const errorMessage = error || (state === "unavailable" ? "The browser surface is unavailable. Retry or open Diagnostics." : state === "policy-blocked" ? "The current capability policy does not allow this action." : "");
  const runAction = async (action: import("@pi-desktop/shared").BrowserAction) => { setOperation(action === "back" ? "Going back…" : action === "forward" ? "Going forward…" : action === "reload" ? "Reloading…" : "Stopping…"); setError(""); try { await api.browserAction(action, sessionId); } catch (caught) { setError(safeBrowserError(caught)); } finally { setOperation(""); } };
  const runNavigate = async (url: string) => { const value = url.trim(); if (!value) return; setBrowserTabs((tabs) => tabs.map((tab) => tab.browserId === activeBrowserId ? { ...tab, url: value, title: value.replace(/^https?:\/\//, "").split("/")[0] || "New tab", loading: true } : tab)); setOperation("Navigating…"); setError(""); try { await api.browserNavigate(value, sessionId); } catch (caught) { setError(safeBrowserError(caught)); } finally { setBrowserTabs((tabs) => tabs.map((tab) => tab.browserId === activeBrowserId ? { ...tab, loading: false } : tab)); setOperation(""); } };
  const runScreenshot = async () => { setOperation("Capturing screenshot…"); setError(""); try { await api.browserScreenshot({ format: "png" }, sessionId); } catch (caught) { setError(safeBrowserError(caught)); } finally { setOperation(""); } };
  const runExternal = async () => { setOperation("Opening external browser…"); setError(""); try { await api.browserOpenExternal(viewState.safeLocation); } catch (caught) { setError(safeBrowserError(caught)); } finally { setOperation(""); } };
  const copyLocation = async () => { if (viewState.safeLocation) { await navigator.clipboard?.writeText(viewState.safeLocation); setOperation(t("panel.browser.copied")); } };
  const recover = async () => { setOperation("Retrying Browser…"); setError(""); try { const result = await api.browserRecover(); if (!(result as { ok?: boolean }).ok) setError(browserErrorCopy.BROWSER_POLICY_BLOCKED); } catch (caught) { setError(safeBrowserError(caught)); } finally { setOperation(""); } };
  const visibleTabs = browserTabs.map((tab) => tab.browserId === activeBrowserId ? { ...tab, title: viewState.safeTitle || browserState?.title || tab.title, url: viewState.safeLocation || location || browserState?.url || tab.url, loading: tab.loading || state === "loading", canGoBack: Boolean(browserState?.canGoBack), canGoForward: Boolean(browserState?.canGoForward), guestGeneration: viewState.surface?.guestGeneration ?? tab.guestGeneration, surface: viewState.surface } : tab);
  const newBrowserTab = () => { const id = `browser-core-${Date.now()}`; setBrowserTabs((tabs) => [...tabs, { id, sessionId: sessionId ?? "", title: "New tab", url: "about:blank", loading: false, canGoBack: false, canGoForward: false, browserId: id, guestGeneration: 0, createdAt: Date.now(), lastActivatedAt: Date.now() }]); setActiveBrowserId(id); void api.browserNavigate("about:blank", sessionId); };
  const closeBrowserTab = (id: string) => { setBrowserTabs((tabs) => { if (tabs.length <= 1) return tabs; const index = tabs.findIndex((tab) => tab.browserId === id); const next = tabs.filter((tab) => tab.browserId !== id); if (id === activeBrowserId) setActiveBrowserId(next[Math.min(index, next.length - 1)]?.browserId ?? next[0].browserId); return next; }); };
  const activateBrowserTab = (id: string) => { const tab = browserTabs.find((candidate) => candidate.browserId === id); setActiveBrowserId(id); if (tab?.url && id !== activeBrowserId) void runNavigate(tab.url); };
  return <div className={`browser-core-view browser-core-view--${state}`} data-browser-presentation={presentation} data-browser-readiness={state} data-browser-location={location ?? ""}>
    <BrowserTabStrip tabs={visibleTabs} activeId={activeBrowserId} onActivate={activateBrowserTab} onClose={closeBrowserTab} onNew={newBrowserTab} />
    <BrowserToolbar presentation={presentation} browserState={browserState} panelState={state} busy={Boolean(operation)} disabled={blocked || transitioning} sessionId={sessionId} committedLocation={viewState.safeLocation ?? location ?? browserState?.url} onNavigate={runNavigate} onAction={runAction} onScreenshot={runScreenshot} onOpenExternal={runExternal} onCopyLocation={copyLocation} onOpenDiagnostics={() => { diagnosticsTriggerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null; setDiagnosticsOpen(true); }} />
    <BrowserReadinessStrip state={state} source={viewState.source} safeLocation={viewState.safeLocation} safeTitle={viewState.safeTitle} presentation={presentation} />
    <BrowserOperationStatus operation={operationLabel} />
    <BrowserErrorNotice message={errorMessage} />
    <BrowserGuestSurface sessionId={sessionId} blocked={blocked} transitioning={transitioning} />
    {(state === "no-page" || state === "unavailable" || state === "policy-blocked" || state === "debugger-unavailable" || state === "closed") && <BrowserEmptyState state={state} onRetry={viewState.recoverable ? recover : undefined} onOpenDiagnostics={() => { diagnosticsTriggerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null; setDiagnosticsOpen(true); }} onReopen={recover} />}
    <BrowserDiagnosticsDrawer open={diagnosticsOpen} panelState={state} presentation={presentation} sessionId={sessionId} onClose={() => { setDiagnosticsOpen(false); diagnosticsTriggerRef.current?.focus(); }} onRetry={viewState.recoverable ? recover : undefined} suggestedAction={viewState.safeSuggestedAction} onOperation={setOperation} onError={setError} />
  </div>;
}
