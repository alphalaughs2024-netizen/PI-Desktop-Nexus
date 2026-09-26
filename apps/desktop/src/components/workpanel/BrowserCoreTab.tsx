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
  useEffect(() => api.onBrowserState((next) => setRawState(next?.state ?? "starting")), []);
  const state = mapBrowserState(rawState, location);
  const operation = state === "starting" ? "Starting Browser…" : state === "loading" ? "Loading page…" : "";
  const error = state === "unavailable" ? "The browser guest could not start." : state === "policy-blocked" ? "The current capability policy does not allow this action." : "";
  return <div className="browser-core-view" data-browser-presentation={presentation} data-browser-readiness={state} data-browser-location={location ?? ""}>
    <BrowserToolbar presentation={presentation} disabled={blocked || transitioning} />
    <BrowserReadinessStrip state={state} />
    <BrowserOperationStatus operation={operation} />
    <BrowserErrorNotice message={error} />
    <BrowserGuestSurface sessionId={sessionId} blocked={blocked} transitioning={transitioning} />
    <BrowserEmptyState visible={state === "no-page"} />
    <BrowserDiagnosticsDrawer open={false} />
  </div>;
}
