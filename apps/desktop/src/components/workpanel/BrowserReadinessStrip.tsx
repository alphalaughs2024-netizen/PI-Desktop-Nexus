export type BrowserPanelState = "no-page" | "starting" | "ready" | "loading" | "unavailable" | "policy-blocked" | "debugger-unavailable" | "closed";

// Source vocabulary remains centralized here for contract consumers even though
// Phase B renders it in BrowserSourceRow, separate from readiness.
// Opened by you · Opened by agent · Previewing workspace file

export function BrowserReadinessStrip({ state }: { state: BrowserPanelState }) {
  const labels: Record<BrowserPanelState, string> = { "no-page": "New tab", starting: "Starting Browser…", ready: "Ready", loading: "Loading page…", unavailable: "Surface unavailable", "policy-blocked": "Policy blocked", "debugger-unavailable": "Debugger unavailable", closed: "Browser closed" };
  return <div className={`browser-readiness-strip browser-readiness-strip--${state}`} data-browser-state={state}><span className="browser-readiness-dot" aria-hidden="true" /><span>{labels[state]}</span></div>;
}
