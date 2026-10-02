import { useEffect, useState } from "react";
import { RefreshCw, Square, Terminal, Globe } from "lucide-react";
import type { ManagedProcessRead, ManagedProcessRecord } from "@pi-desktop/shared";
import { api } from "../../lib/api";
import { useAppStore } from "../../stores/app-store";
import { browserWorkPanelTab } from "../../lib/work-panel-tabs";
import { TooltipButton } from "../ui";

const live = (record: ManagedProcessRecord) => ["starting", "running", "stopping"].includes(record.status);
function previewURL(value: string | null): string | null {
  try {
    const url = new URL(value ?? "");
    return url.protocol === "http:" && ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) && url.port && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}

export function ProcessesTab({ sessionId, active }: { sessionId?: string; active: boolean }) {
  const [records, setRecords] = useState<ManagedProcessRecord[]>([]);
  const [selected, setSelected] = useState<string>();
  const [detail, setDetail] = useState<ManagedProcessRead>();
  const [error, setError] = useState("");
  const [stopError, setStopError] = useState("");
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [revision, setRevision] = useState(0);
  const openTab = useAppStore(state => state.openWorkPanelTabForSession);
  useEffect(() => {
    if (!active || !sessionId) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const refresh = async () => {
      if (document.hidden) { timer = setTimeout(refresh, 1500); return; }
      try {
        const list = await api.managedProcessRead(sessionId);
        if (cancelled) return;
        const rows = [...(list.processes ?? [])].reverse();
        setRecords(rows);
        const id = rows.some(record => record.id === selected) ? selected : rows[0]?.id;
        if (id !== selected) { setSelected(id); setDetail(undefined); }
        else {
          const result = id ? await api.managedProcessRead(sessionId, id) : undefined;
          if (cancelled) return;
          setDetail(result);
        }
        setError("");
      } catch (error) {
        if (!cancelled) setError(error instanceof Error ? error.message : "Unable to inspect processes");
      } finally {
        if (!cancelled) { setLoading(false); timer = setTimeout(refresh, 1500); }
      }
    };
    void refresh();
    return () => { cancelled = true; clearTimeout(timer); };
  }, [sessionId, active, selected, revision]);
  const stop = async (id?: string) => {
    if (!sessionId || pending) return;
    setPending(true);
    setStopError("");
    try {
      if (id) await api.managedProcessStop(sessionId, id);
      else await api.managedProcessStopSession(sessionId);
    } catch (error) { setStopError(error instanceof Error ? error.message : "Unable to stop processes"); }
    finally { setPending(false); setRevision(value => value + 1); }
  };
  const process = detail?.process;
  const url = previewURL(process?.previewUrl ?? null);
  return <div className="processes-tab">
    <div className="processes-toolbar"><span>{records.filter(live).length} running</span><div>
      <TooltipButton className="icon-btn" tooltip="Refresh processes" ariaLabel="Refresh processes" onClick={() => setRevision(value => value + 1)}><RefreshCw size={15} /></TooltipButton>
      <button className="btn" disabled={pending || !records.some(live)} onClick={() => void stop()}><Square size={13} />Stop all</button>
    </div></div>
    {error && <div role="alert" className="processes-error">{error}</div>}
    {stopError && <div role="alert" className="processes-error">{stopError}</div>}
    {!records.length ? <div className="processes-empty"><Terminal size={22} /><span>{loading ? "Loading processes..." : "No managed processes in this chat"}</span></div> : <>
      <div className="processes-list" role="group" aria-label="Chat processes">{records.map(record => <div className={`processes-row${record.id === selected ? " is-selected" : ""}`} key={record.id}>
        <button className="processes-select" aria-pressed={record.id === selected} onClick={() => { setSelected(record.id); setDetail(undefined); }}><strong title={record.command}>{record.command}</strong><span>{record.status}{record.exitCode !== null ? ` · exit ${record.exitCode}` : ""}</span></button>
        {live(record) && <TooltipButton className="icon-btn" tooltip="Stop process" ariaLabel={`Stop ${record.command}`} disabled={pending || record.status === "stopping"} onClick={() => void stop(record.id)}><Square size={14} /></TooltipButton>}
      </div>)}</div>
      {process && <div className="processes-detail">
        <div className="processes-detail-heading"><span>{process.status}{process.exitCode !== null ? ` · exit ${process.exitCode}` : ""}</span>{url && live(process) && <TooltipButton className="icon-btn" tooltip="Open preview" ariaLabel="Open preview" onClick={() => sessionId && openTab(sessionId, browserWorkPanelTab(url))}><Globe size={15} /></TooltipButton>}</div>
        <div className="processes-cwd" title={process.cwd}>{process.cwd}</div>
        {process.error && <div role="alert" className="processes-error">{process.error}</div>}
        {detail?.outputDropped && <div className="processes-note">Earlier output was discarded</div>}
        <pre className="processes-output" aria-label="Process output">{detail?.output?.length ? detail.output.map(chunk => <span key={chunk.cursor} className={chunk.stream === "stderr" ? "is-stderr" : ""}>{chunk.text}</span>) : process.status === "interrupted" ? "Previous run interrupted; live output is unavailable" : "No output recorded"}</pre>
      </div>}
    </>}
  </div>;
}
