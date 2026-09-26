import { useEffect, useRef, useState } from "react";
import type { BrowserDiagnosticsDisplay } from "@pi-desktop/shared";
import { api } from "../../lib/api";
import type { WorkPanelPresentation } from "../../lib/work-panel-presentation";

function toCopyText(value: BrowserDiagnosticsDisplay): string {
  return ["Nexus Browser diagnostics", `Capability: ${value.capability === "enabled" ? "Enabled" : "Disabled"}`, `Readiness: ${value.readiness}`, `Session: ${value.session === "current" ? "Current" : "Background"}`, ...(value.guestGeneration === undefined ? [] : [`Guest generation: ${value.guestGeneration}`]), `Pending requests: ${value.pendingRequests}`, `Queue: ${value.queue === "busy" ? "Busy" : "Idle"}`, `Compatibility: ${value.compatibility}`, ...(value.lastErrorCode ? [`Last error: ${value.lastErrorCode}`] : []), ...(value.suggestedAction ? [`Suggested action: ${value.suggestedAction}`] : [])].join("\n");
}

export function BrowserDiagnosticsDrawer({ open, panelState, presentation, sessionId, onClose, onRetry, suggestedAction, onOperation, onError }: { open: boolean; panelState: string; presentation: WorkPanelPresentation; sessionId?: string; onClose: () => void; onRetry?: () => void; suggestedAction?: string; onOperation: (value: string) => void; onError: (value: string) => void }) {
  const [value, setValue] = useState<BrowserDiagnosticsDisplay | null>(null);
  const headingRef = useRef<HTMLHeadingElement | null>(null);
  useEffect(() => { if (!open) return; headingRef.current?.focus(); void api.browserDiagnostics(sessionId).then(setValue).catch(() => onError("Browser diagnostics are not available yet. Retry Browser or reopen the panel.")); }, [open, sessionId, onError]);
  useEffect(() => { if (!open) return; const listener = (event: KeyboardEvent) => { if (event.key === "Escape") { event.preventDefault(); onClose(); } }; window.addEventListener("keydown", listener); return () => window.removeEventListener("keydown", listener); }, [open, onClose]);
  if (!open) return <div className="browser-diagnostics-drawer" aria-hidden="true" />;
  const rows = value ? [["Capability", value.capability], ["Readiness", value.readiness], ["Session", value.session], ...(value.guestGeneration === undefined ? [] : [["Guest generation", String(value.guestGeneration)]]), ["Pending requests", String(value.pendingRequests)], ["Queue", value.queue], ["Compatibility", value.compatibility], ...(value.lastErrorCode ? [["Last error", value.lastErrorCode]] : []), ...(value.suggestedAction ? [["Suggested action", value.suggestedAction]] : [])] : [];
  const copy = async () => { if (!value) return; try { await navigator.clipboard.writeText(toCopyText(value)); onOperation("Safe diagnostics copied."); } catch { onError("Unable to copy Browser diagnostics."); } };
  return <aside className={`browser-diagnostics-drawer browser-diagnostics-drawer--open browser-diagnostics-drawer--${presentation}`} role="region" aria-labelledby="browser-diagnostics-title"><h2 id="browser-diagnostics-title" tabIndex={-1} ref={headingRef}>{panelState === "policy-blocked" ? "Browser action blocked" : "Browser diagnostics"}</h2>{suggestedAction && !value?.suggestedAction && <p>{suggestedAction}</p>}<dl className="browser-diagnostics-list">{rows.map(([label, text]) => <div className="browser-diagnostics-row" key={label}><dt>{label}</dt><dd>{text}</dd></div>)}</dl><div className="browser-diagnostics-actions">{onRetry && <button type="button" onClick={onRetry}>Retry Browser</button>}<button type="button" className="browser-diagnostics-copy" aria-label="Copy safe Browser diagnostics" disabled={!value} onClick={() => void copy()}>Copy safe diagnostics</button><button type="button" aria-label="Close Browser diagnostics" onClick={onClose}>Close</button></div></aside>;
}
