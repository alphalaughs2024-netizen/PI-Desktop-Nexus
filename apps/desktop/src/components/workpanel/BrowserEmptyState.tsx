import type { BrowserRecoveryState } from "./browser-presentation-state";

const copy: Record<BrowserRecoveryState, readonly [string, string]> = {
  starting: ["Starting Browser…", "Preparing the Browser surface."],
  unavailable: ["Surface unavailable", "The page loaded, but its Browser surface could not be displayed."],
  "policy-blocked": ["Policy blocked", "The current capability policy does not allow this action."],
  "debugger-unavailable": ["Debugger unavailable", "The Browser cannot inspect this page right now."],
  closed: ["Browser closed", "Reopen the Browser surface to continue."],
};

/** Browser-owned recovery surface; the native guest is never layered beneath it. */
export function BrowserEmptyState({ state, onRetry, onOpenDiagnostics, onReopen }: { state: BrowserRecoveryState; onRetry?: () => void; onOpenDiagnostics?: () => void; onReopen?: () => void }) {
  const [title, detail] = copy[state];
  return <section className={`browser-empty-state browser-state-surface browser-empty-state--${state}`} data-browser-surface={state} aria-label={title}><strong>{title}</strong><span>{detail}</span>{state !== "starting" && <div className="browser-empty-actions">{(state === "unavailable" || state === "debugger-unavailable") && onRetry && <button type="button" aria-label="Retry Browser" onClick={onRetry}>Retry</button>}{(state === "unavailable" || state === "policy-blocked" || state === "debugger-unavailable") && onOpenDiagnostics && <button type="button" aria-label="Open Browser diagnostics" onClick={onOpenDiagnostics}>{state === "policy-blocked" ? "View details" : "Diagnostics"}</button>}{state === "closed" && onReopen && <button type="button" aria-label="Reopen Browser" onClick={onReopen}>Reopen</button>}</div>}</section>;
}
