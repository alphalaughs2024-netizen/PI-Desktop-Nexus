import { IconGlobe, IconMore } from "../icons";
import type { BrowserPanelState } from "./BrowserReadinessStrip";

const labels: Record<BrowserPanelState, string> = {
  "no-page": "New tab",
  starting: "Starting",
  ready: "Ready",
  loading: "Loading",
  unavailable: "Unavailable",
  "policy-blocked": "Blocked",
  "debugger-unavailable": "Debugger unavailable",
  closed: "Closed",
};

/** The single meaningful Browser identity inside the resource card. */
export function BrowserHeader({ state, onOpenDiagnostics }: { state: BrowserPanelState; onOpenDiagnostics: () => void }) {
  return (
    <header className="browser-header">
      <div className="browser-header-identity">
        <span className="browser-header-icon" aria-hidden="true"><IconGlobe size={15} /></span>
        <h1>Browser</h1>
      </div>
      <div className={`browser-header-readiness browser-header-readiness--${state}`}>
        <span className="browser-readiness-dot" aria-hidden="true" />
        <span>{labels[state]}</span>
      </div>
      <button type="button" className="browser-header-menu" aria-label="Browser options" title="Browser options" onClick={onOpenDiagnostics}>
        <IconMore size={16} />
      </button>
    </header>
  );
}
