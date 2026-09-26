export type BrowserPanelState = "no-page" | "starting" | "ready" | "loading" | "unavailable" | "policy-blocked" | "debugger-unavailable" | "closed";

const labels: Record<BrowserPanelState, string> = {
  "no-page": "Browser ready",
  starting: "Starting Browser…",
  ready: "Browser ready",
  loading: "Loading page…",
  unavailable: "Browser unavailable",
  "policy-blocked": "Browser capability disabled",
  "debugger-unavailable": "Browser debugger unavailable",
  closed: "Browser closed",
};

export function BrowserReadinessStrip({ state }: { state: BrowserPanelState }) {
  return <div className="browser-readiness-strip" data-browser-state={state}><span className="browser-readiness-dot" aria-hidden="true" /><span>{labels[state]}</span></div>;
}
