export function BrowserDiagnosticsDrawer({ open, panelState, onClose, onRetry, suggestedAction }: { open: boolean; panelState: string; onClose?: () => void; onRetry?: () => void; suggestedAction?: string }) {
  if (!open) return <div className="browser-diagnostics-drawer" aria-hidden="true" />;
  return <aside className="browser-diagnostics-drawer" aria-label="Browser diagnostics"><strong>{panelState === "policy-blocked" ? "Browser action blocked" : "Browser diagnostics"}</strong>{suggestedAction && <span>{suggestedAction}</span>}{onRetry && <button type="button" onClick={onRetry}>Retry</button>}<button type="button" onClick={onClose} aria-label="Close Browser diagnostics">Close</button></aside>;
}
