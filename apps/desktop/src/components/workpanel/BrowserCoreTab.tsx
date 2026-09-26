import { useEffect, useState } from "react";
import type { WorkPanelPresentation } from "../../lib/work-panel-presentation";
import { api } from "../../lib/api";
import { BrowserToolbar } from "./BrowserToolbar";
import { BrowserReadinessStrip, type BrowserPanelState } from "./BrowserReadinessStrip";
import { BrowserGuestSurface } from "./BrowserGuestSurface";
import { BrowserOperationStatus } from "./BrowserOperationStatus";
import { BrowserErrorNotice } from "./BrowserErrorNotice";
import { BrowserEmptyState } from "./BrowserEmptyState";
import { BrowserDiagnosticsDrawer } from "./BrowserDiagnosticsDrawer";

export type BrowserCoreTabProps = { sessionId?: string; location?: string; blocked?: boolean; presentation: WorkPanelPresentation; transitioning?: boolean };

function mapBrowserState(view: import("@pi-desktop/shared").BrowserViewState): BrowserPanelState {
  if (view.readiness === "blocked") return "policy-blocked";
  if (view.readiness === "closed") return "closed";
  if (view.readiness === "unavailable") return view.lastErrorCode === "BROWSER_UNSUPPORTED" ? "debugger-unavailable" : "unavailable";
  if (view.readiness === "loading") return "loading";
  if (view.readiness === "ready" && !view.safeLocation) return "no-page";
  if (view.readiness === "ready") return "ready";
  return view.readiness === "uninitialized" ? "no-page" : "starting";
}

export function BrowserCoreTab({ sessionId, location, blocked = false, presentation, transitioning = false }: BrowserCoreTabProps) {
  const [viewState, setViewState] = useState<import("@pi-desktop/shared").BrowserViewState>({ readiness: "starting", navigation: null, source: "unknown", recoverable: false });
  const [operation, setOperation] = useState("");
  const [error, setError] = useState("");
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false);
  useEffect(() => { void api.browserGetViewState(sessionId).then(setViewState).catch(() => undefined); return api.onBrowserViewState((event) => { if (event.sessionId === sessionId) setViewState(event.state); }); }, [sessionId]);
  const state = mapBrowserState(viewState);
  const browserState = viewState.navigation;
  const operationLabel = operation || (state === "starting" ? "Starting Browser…" : state === "loading" ? "Loading page…" : "");
  const errorMessage = error || (state === "unavailable" ? "The browser guest could not start." : state === "policy-blocked" ? "The current capability policy does not allow this action." : "");
  const runAction = async (action: import("@pi-desktop/shared").BrowserAction) => { setOperation(action === "back" ? "Going back…" : action === "forward" ? "Going forward…" : action === "reload" ? "Reloading…" : "Stopping…"); setError(""); try { await api.browserAction(action); } catch { setError("Browser action failed. Inspect the Browser state and retry."); } finally { setOperation(""); } };
  const runNavigate = async (url: string) => { setOperation("Navigating…"); setError(""); try { await api.browserNavigate(url, sessionId); } catch { setError("Browser navigation failed. Inspect the Browser state and retry."); } finally { setOperation(""); } };
  const runScreenshot = async () => { setOperation("Capturing screenshot…"); setError(""); try { await api.browserScreenshot({ format: "png" }); } catch { setError("Screenshot failed. Inspect the Browser state and retry."); } finally { setOperation(""); } };
  const runExternal = async () => { setOperation("Opening external browser…"); setError(""); try { await api.browserOpenExternal(); } catch { setError("The page could not be opened externally."); } finally { setOperation(""); } };
  const copyLocation = async () => { if (browserState?.url) await navigator.clipboard?.writeText(browserState.url); };
  const recover = async () => { setOperation("Retrying Browser…"); setError(""); try { const result = await api.browserRecover(); if (!(result as { ok?: boolean }).ok) setError("The Browser capability is disabled. Re-enable Browser in Settings."); } catch { setError("Browser recovery failed. Inspect diagnostics and retry."); } finally { setOperation(""); } };
  return <div className="browser-core-view" data-browser-presentation={presentation} data-browser-readiness={state} data-browser-location={location ?? ""}>
    <BrowserToolbar presentation={presentation} browserState={browserState} panelState={state} busy={Boolean(operation)} disabled={blocked || transitioning} sessionId={sessionId} committedLocation={viewState.safeLocation ?? location ?? browserState?.url} onNavigate={runNavigate} onAction={runAction} onScreenshot={runScreenshot} onOpenExternal={runExternal} onCopyLocation={copyLocation} />
    <BrowserReadinessStrip state={state} source={viewState.source} safeLocation={viewState.safeLocation} safeTitle={viewState.safeTitle} presentation={presentation} />
    <BrowserOperationStatus operation={operationLabel} />
    <BrowserErrorNotice message={errorMessage} />
    <BrowserGuestSurface sessionId={sessionId} blocked={blocked} transitioning={transitioning} />
    {(state === "no-page" || state === "unavailable" || state === "policy-blocked" || state === "debugger-unavailable" || state === "closed") && <BrowserEmptyState state={state} onRetry={viewState.recoverable ? recover : undefined} onOpenDiagnostics={() => setDiagnosticsOpen(true)} onReopen={recover} />}
    <BrowserDiagnosticsDrawer open={diagnosticsOpen} panelState={state} presentation={presentation} sessionId={sessionId} onClose={() => setDiagnosticsOpen(false)} onRetry={viewState.recoverable ? recover : undefined} suggestedAction={viewState.safeSuggestedAction} onOperation={setOperation} onError={setError} />
  </div>;
}
