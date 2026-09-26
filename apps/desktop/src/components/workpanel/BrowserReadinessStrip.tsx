export type BrowserPanelState = "no-page" | "starting" | "ready" | "loading" | "unavailable" | "policy-blocked" | "debugger-unavailable" | "closed";

export function BrowserReadinessStrip({ state, source = "unknown", safeLocation, safeTitle, presentation }: { state: BrowserPanelState; source?: "user" | "agent" | "workspace-preview" | "unknown"; safeLocation?: string; safeTitle?: string; presentation: "docked" | "maximized" }) {
  const labels: Record<BrowserPanelState, string> = { "no-page": "Browser ready", starting: "Starting Browser…", ready: "Browser ready", loading: "Loading page…", unavailable: "Browser unavailable", "policy-blocked": "Browser capability disabled", "debugger-unavailable": "Browser debugger unavailable", closed: "Browser closed" };
  const sourceLabel = source === "user" ? "Opened by you" : source === "agent" ? "Opened by agent" : source === "workspace-preview" ? "Previewing workspace file" : "";
  return <div className={`browser-readiness-strip browser-readiness-strip--${state}`} data-browser-state={state}><span className="browser-readiness-dot" aria-hidden="true" /><span>{labels[state]}</span>{sourceLabel && <span className="browser-readiness-source">· {sourceLabel}{presentation === "maximized" && safeLocation ? ` · ${safeLocation}` : safeTitle ? ` · ${safeTitle}` : ""}</span>}</div>;
}
