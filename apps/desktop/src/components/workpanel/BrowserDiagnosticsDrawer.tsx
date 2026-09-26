export function BrowserDiagnosticsDrawer({ open, onClose }: { open: boolean; onClose?: () => void }) {
  if (!open) return <div className="browser-diagnostics-drawer" aria-hidden="true" />;
  return <aside className="browser-diagnostics-drawer" aria-label="Browser diagnostics"><button type="button" onClick={onClose} aria-label="Close Browser diagnostics">Close</button></aside>;
}
