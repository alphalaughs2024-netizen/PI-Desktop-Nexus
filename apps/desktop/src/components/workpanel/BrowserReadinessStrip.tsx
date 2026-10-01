import type { BrowserPresentationState } from "./browser-presentation-state";

export type BrowserPanelState = BrowserPresentationState;

// Source vocabulary remains centralized here for contract consumers even though
// Phase B renders it in BrowserSourceRow, separate from readiness.
// Opened by you · Opened by agent · Previewing workspace file

export function BrowserReadinessStrip({ state }: { state: BrowserPanelState }) {
  const labels: Record<BrowserPanelState, string> = { "no-page": "New tab", starting: "Starting Browser…", ready: "Ready", loading: "Loading page…", unavailable: "Surface unavailable", "policy-blocked": "Policy blocked", "debugger-unavailable": "Debugger unavailable", closed: "Browser closed" };
  return <span className="browser-readiness-strip" data-browser-state={state} role="status" aria-live="polite">{labels[state]}</span>;
}
