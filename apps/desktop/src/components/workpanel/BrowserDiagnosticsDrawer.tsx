import { useEffect, useRef, useState } from "react";
import type { BrowserDiagnosticsDisplay, BrowserScreenshotResult } from "@pi-desktop/shared";
import { Camera, Copy, Download, FolderOpen, RefreshCw, X } from "lucide-react";
import { api } from "../../lib/api";
import { useAppStore } from "../../stores/app-store";
import type { WorkPanelPresentation } from "../../lib/work-panel-presentation";
import { browserViewportMode, type BrowserViewport, type BrowserViewportMode } from "../../lib/browser-viewport";

type View = "Overview" | "Page" | "Downloads" | "Developer";
type Props = { open: boolean; panelState: string; presentation: WorkPanelPresentation; sessionId?: string; browserId: string; screenshot?: BrowserScreenshotResult | null; viewport: BrowserViewport | null; viewportPending: boolean; onViewport: (mode: BrowserViewportMode) => Promise<void>; onClose: () => void; onRetry?: () => void; suggestedAction?: string; onOperation: (value: string) => void; onError: (value: string) => void; onAnnotate: () => void };

export function BrowserDiagnosticsDrawer({ open, panelState, presentation, sessionId, browserId, screenshot, viewport, viewportPending, onViewport, onClose, onRetry, suggestedAction, onOperation, onError, onAnnotate }: Props) {
  const [value, setValue] = useState<BrowserDiagnosticsDisplay | null>(null);
  const [view, setView] = useState<View>("Overview");
  const [busy, setBusy] = useState(false);
  const [developer, setDeveloper] = useState(false);
  const [data, setData] = useState<any>(null);
  const [image, setImage] = useState<BrowserScreenshotResult | null>(null);
  const [filter, setFilter] = useState("");
  const [messages, setMessages] = useState<any[]>([]);
  const headingRef = useRef<HTMLHeadingElement | null>(null);
  const generation = useRef(0);
  const busyRef = useRef(false);
  const service = (name: string, args: unknown) => api.browserControl(sessionId, browserId, "service", name, args);
  useEffect(() => {
    if (!open) return;
    const epoch = ++generation.current;
    busyRef.current = false;
    setBusy(false); setValue(null); setData(null); setMessages([]); setDeveloper(false); setImage(null);
    headingRef.current?.focus();
    void api.browserDiagnostics(sessionId).then(next => { if (epoch === generation.current) setValue(next); }).catch(() => { if (epoch === generation.current) onError("Browser diagnostics are unavailable."); });
    void api.browserControl(sessionId, browserId, "service", "developer", { operation: "status" }).then(next => { if (epoch === generation.current) setDeveloper(next.enabled); }).catch(() => undefined);
    return () => { generation.current++; };
  }, [open, sessionId, browserId, onError]);
  useEffect(() => { if (screenshot) { setImage(screenshot); setView("Page"); } }, [screenshot]);
  useEffect(() => { if (!open) return; const listener = (event: KeyboardEvent) => { if (event.key === "Escape") { event.preventDefault(); onClose(); } }; window.addEventListener("keydown", listener); return () => window.removeEventListener("keydown", listener); }, [open, onClose]);
  const run = async (fn: () => Promise<any>, consume: (result: any) => void = setData) => {
    if (busyRef.current) return;
    const epoch = generation.current;
    busyRef.current = true; setBusy(true); onError("");
    try { const result = await fn(); if (epoch === generation.current) consume(result); }
    catch (error) { if (epoch === generation.current) onError(error instanceof Error ? error.message : "Browser operation failed."); }
    finally { if (epoch === generation.current) { busyRef.current = false; setBusy(false); } }
  };
  const openArtifact = (path: string) => { useAppStore.getState().openFileInWorkPanel(path); onClose(); };
  const copyDiagnostics = () => {
    if (!value) return;
    const epoch = generation.current;
    void navigator.clipboard.writeText(`Nexus Browser diagnostics\n${JSON.stringify(value, null, 2)}`)
      .then(() => { if (epoch === generation.current) onOperation("Safe diagnostics copied."); })
      .catch(() => { if (epoch === generation.current) onError("Unable to copy diagnostics."); });
  };
  const loadView = (next: View) => {
    setView(next); setData(null);
    if (next === "Downloads") void run(() => service("downloads", { operation: "list" }));
    if (next === "Page") void run(() => service("annotations", { operation: "read" }));
  };
  if (!open) return <div className="browser-diagnostics-drawer" aria-hidden="true" />;
  const rows = value ? [["Capability", value.capability], ["Readiness", value.readiness], ["Session", value.session], ["Pending requests", String(value.pendingRequests)], ["Queue", value.queue], ["Compatibility", value.compatibility], ...(value.lastErrorCode ? [["Last error", value.lastErrorCode]] : [])] : [];
  const viewportMode = browserViewportMode(viewport);
  return <aside id="browser-inspector" className={`browser-diagnostics-drawer browser-diagnostics-drawer--open browser-diagnostics-drawer--${presentation} browser-tools-drawer`} role="region" aria-labelledby="browser-diagnostics-title">
    <header className="browser-tools-heading"><h2 id="browser-diagnostics-title" tabIndex={-1} ref={headingRef}>{panelState === "policy-blocked" ? "Browser action blocked" : "Browser tools"}</h2><button type="button" aria-label="Close Browser diagnostics" title="Close" onClick={onClose}><X size={16} /></button></header>
    <div className="browser-tools-tabs" role="tablist" aria-label="Browser tools" onKeyDown={event => { const names: View[] = ["Overview", "Page", "Downloads", "Developer"]; const index = names.indexOf(view); const next = event.key === "ArrowRight" ? names[(index + 1) % names.length] : event.key === "ArrowLeft" ? names[(index + 3) % names.length] : event.key === "Home" ? names[0] : event.key === "End" ? names[3] : undefined; if (next && !busy) { event.preventDefault(); loadView(next); document.getElementById(`browser-tools-tab-${next}`)?.focus(); } }}>{(["Overview", "Page", "Downloads", "Developer"] as View[]).map(name => <button key={name} type="button" role="tab" tabIndex={view === name ? 0 : -1} aria-selected={view === name} aria-controls={`browser-tools-${name}`} id={`browser-tools-tab-${name}`} disabled={busy} onClick={() => loadView(name)}>{name}</button>)}</div>
    <div id={`browser-tools-${view}`} role="tabpanel" aria-labelledby={`browser-tools-tab-${view}`} className="browser-tools-content" aria-busy={busy}>
      {view === "Overview" && <>{(value?.suggestedAction || suggestedAction) && <p>{value?.suggestedAction || suggestedAction}</p>}<dl className="browser-diagnostics-list">{rows.map(([label, text]) => <div className="browser-diagnostics-row" key={label}><dt>{label}</dt><dd>{text}</dd></div>)}</dl><div className="browser-diagnostics-actions">{onRetry && <button type="button" onClick={onRetry}>Retry Browser</button>}<button type="button" title="Refresh diagnostics" aria-label="Refresh diagnostics" disabled={busy} onClick={() => void run(() => api.browserDiagnostics(sessionId), setValue)}><RefreshCw size={15} /></button><button type="button" className="browser-diagnostics-copy" title="Copy safe diagnostics" aria-label="Copy safe Browser diagnostics" disabled={!value} onClick={copyDiagnostics}><Copy size={15} /></button></div></>}
      {view === "Page" && <>
        <label className="browser-tools-field">Viewport<select value={viewportMode ?? "unknown"} disabled={busy || viewportPending || !viewport} onChange={event => void onViewport(event.target.value as BrowserViewportMode)}>{!viewport && <option value="unknown">Unavailable</option>}<option value="panel">Panel size</option><option value="desktop">Desktop 1440 x 900</option><option value="mobile">Mobile 390 x 844</option>{viewportMode === "custom" && viewport && !viewport.reset && <option value="custom">{viewport.width} x {viewport.height} (agent viewport)</option>}</select></label>
        <div className="browser-tools-commands"><button type="button" disabled={busy} onClick={() => void run(() => api.browserScreenshot({ format: "png" }, sessionId, browserId), setImage)}><Camera size={15} /> Screenshot</button><button type="button" disabled={busy} onClick={() => void run(() => api.browserScreenshot({ fullPage: true, format: "png" }, sessionId, browserId), setImage)}>Full page</button><button type="button" disabled={busy} onClick={onAnnotate}>Annotate</button><button type="button" disabled={busy} onClick={() => void run(() => service("annotations", { operation: "read" }))}>Read annotations</button><button type="button" disabled={busy} onClick={() => void run(() => service("annotations", { operation: "clear" }))}>Clear annotations</button></div>
        {image && <figure className="browser-tools-screenshot"><img alt="Captured browser page" src={`data:${image.mimeType};base64,${image.data}`} /><figcaption>{Math.round(image.width)} x {Math.round(image.height)}{image.truncated ? " (truncated)" : ""}<a href={`data:${image.mimeType};base64,${image.data}`} download={`nexus-browser.${image.mimeType === "image/png" ? "png" : "jpg"}`} title="Save screenshot" aria-label="Save screenshot"><Download size={15} /></a></figcaption></figure>}
        <div className="browser-tools-commands">{["pdf", "html", "text"].map(format => <button key={format} type="button" disabled={busy} onClick={() => void run(() => service("page", { operation: "export", format }))}>Export {format.toUpperCase()}</button>)}<button type="button" disabled={busy} onClick={() => void run(() => service("page", { operation: "assets" }))}>Page assets</button><button type="button" disabled={busy} onClick={() => void run(() => service("styles", { operation: "clear" }))}>Clear style preview</button></div>
        {data?.path && <button type="button" onClick={() => openArtifact(data.path)}>{data.path.split(/[\\/]/).at(-1)}</button>}
        {data?.annotations?.length > 0 && <><ol className="browser-tools-results">{data.annotations.map((entry: any, index: number) => <li key={index}>{entry.tag}: {entry.text || entry.id || "Selected element"}</li>)}</ol><button type="button" onClick={() => void navigator.clipboard.writeText(JSON.stringify(data, null, 2)).catch(() => onError("Unable to copy annotations."))}><Copy size={15} /> Copy annotations</button></>}
        {data?.assets && <ul className="browser-tools-results">{data.assets.map((asset: any, index: number) => <li key={index}><span title={asset.url}>{asset.type}: {asset.name || asset.url}</span><button type="button" title="Save asset" aria-label={`Save ${asset.name || asset.type} asset`} disabled={busy} onClick={() => void run(() => service("page", { operation: "save_asset", url: asset.url }))}><Download size={14} /></button></li>)}</ul>}
      </>}
      {view === "Downloads" && <><div className="browser-tools-commands"><button type="button" disabled={busy} title="Refresh downloads" aria-label="Refresh downloads" onClick={() => void run(() => service("downloads", { operation: "list" }))}><RefreshCw size={15} /></button><button type="button" disabled={!sessionId} onClick={() => sessionId && void api.openSessionScratchPath(sessionId).catch(() => onError("Unable to open downloads folder."))}><FolderOpen size={15} /> Open folder</button></div>{!data?.downloads?.length ? <p>No downloads.</p> : <ul className="browser-tools-results">{data.downloads.map((download: any) => <li key={download.id}><div><button type="button" disabled={download.state !== "completed"} onClick={() => openArtifact(download.path)}>{download.filename}</button><small>{download.state}: {Math.round(download.receivedBytes / 1024)} / {Math.round(download.totalBytes / 1024)} KB</small></div>{["progressing", "paused", "interrupted"].includes(download.state) && <><button type="button" disabled={busy} onClick={() => void run(() => service("downloads", { operation: download.state === "progressing" ? "pause" : "resume", id: download.id }))}>{download.state === "progressing" ? "Pause" : "Resume"}</button><button type="button" title="Cancel download" aria-label="Cancel download" disabled={busy} onClick={() => void run(() => service("downloads", { operation: "cancel", id: download.id }))}><X size={14} /></button></>}</li>)}</ul>}</>}
      {view === "Developer" && <>
        <label className="browser-tools-field">Developer mode<input type="checkbox" checked={developer} disabled={busy} onChange={event => { const next = event.target.checked; void run(() => service("developer", { operation: next ? "enable" : "disable" }), result => setDeveloper(result.enabled)); }} /></label>
        <div className="browser-tools-commands"><button type="button" disabled={!developer || busy} onClick={() => void run(() => service("events", { cursor: 0, methods: ["Network.responseReceived", "Network.loadingFailed"] }))}>Network</button><button type="button" disabled={!developer || busy} onClick={() => void run(() => service("metrics", {}))}>Performance</button></div>
        <label className="browser-tools-field">Console filter<input value={filter} onChange={event => setFilter(event.target.value)} /></label><div className="browser-tools-commands"><button type="button" disabled={busy} onClick={() => void run(() => service("console", { contains: filter, limit: 50 }), result => setMessages(result.messages))}>Console</button><button type="button" disabled={busy} onClick={() => void run(() => service("console", { clear: true }), () => setMessages([]))}>Clear console</button></div>
        {messages.map((entry, index) => <div className="browser-tools-log" key={index}><strong>{entry.type}{entry.count > 1 ? ` x${entry.count}` : ""}</strong><span>{entry.text}</span></div>)}
        {data && <pre className="browser-tools-json">{JSON.stringify(data, null, 2)}</pre>}
      </>}
    </div>
    {busy && <div role="status" className="browser-tools-pending">Working...</div>}
  </aside>;
}
