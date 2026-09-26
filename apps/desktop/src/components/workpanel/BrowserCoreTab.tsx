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

function mapBrowserState(raw: string | undefined, location?: string): BrowserPanelState {
  if (raw === "ready" && !location) return "no-page";
  if (raw === "blocked") return "policy-blocked";
  if (raw === "closed") return "closed";
  if (raw === "unavailable") return "unavailable";
  if (raw === "loading") return "loading";
  if (raw === "ready") return "ready";
  return "starting";
}

export function BrowserCoreTab({ sessionId, location, blocked = false, presentation, transitioning = false }: BrowserCoreTabProps) {
  const [rawState, setRawState] = useState<string>("starting");
  const [browserState, setBrowserState] = useState<import("@pi-desktop/shared").BrowserState | null>(null);
  const [operation, setOperation] = useState("");
  const [error, setError] = useState("");
  useEffect(() => api.onBrowserState((next) => setRawState(next?.state ?? "starting")), []);
  useEffect(() => api.onBrowserState((next) => setBrowserState(next)), []);
  const state = mapBrowserState(rawState, location);
  const operationLabel = operation || (state === "starting" ? "Starting Browser…" : state === "loading" ? "Loading page…" : "");
  const errorMessage = error || (state === "unavailable" ? "The browser guest could not start." : state === "policy-blocked" ? "The current capability policy does not allow this action." : "");
  const runAction = async (action: import("@pi-desktop/shared").BrowserAction) => { setOperation(action === "back" ? "Going back…" : action === "forward" ? "Going forward…" : action === "reload" ? "Reloading…" : "Stopping…"); setError(""); try { await api.browserAction(action); } catch { setError("Browser action failed. Inspect the Browser state and retry."); } finally { setOperation(""); } };
  const runNavigate = async (url: string) => { setOperation("Navigating…"); setError(""); try { await api.browserNavigate(url, sessionId); } catch { setError("Browser navigation failed. Inspect the Browser state and retry."); } finally { setOperation(""); } };
  const runScreenshot = async () => { setOperation("Capturing screenshot…"); setError(""); try { await api.browserScreenshot({ format: "png" }); } catch { setError("Screenshot failed. Inspect the Browser state and retry."); } finally { setOperation(""); } };
  const runExternal = async () => { setOperation("Opening external browser…"); setError(""); try { await api.browserOpenExternal(); } catch { setError("The page could not be opened externally."); } finally { setOperation(""); } };
  const copyLocation = async () => { if (browserState?.url) await navigator.clipboard?.writeText(browserState.url); };
  return <div className="browser-core-view" data-browser-presentation={presentation} data-browser-readiness={state} data-browser-location={location ?? ""}>
    <BrowserToolbar presentation={presentation} browserState={browserState} panelState={state} busy={Boolean(operation)} disabled={blocked || transitioning} sessionId={sessionId} committedLocation={location ?? browserState?.url} onNavigate={runNavigate} onAction={runAction} onScreenshot={runScreenshot} onOpenExternal={runExternal} onCopyLocation={copyLocation} />
    <BrowserReadinessStrip state={state} />
    <BrowserOperationStatus operation={operationLabel} />
    <BrowserErrorNotice message={errorMessage} />
    <BrowserGuestSurface sessionId={sessionId} blocked={blocked} transitioning={transitioning} />
    <BrowserEmptyState visible={state === "no-page"} />
    <BrowserDiagnosticsDrawer open={false} />
  </div>;
}
