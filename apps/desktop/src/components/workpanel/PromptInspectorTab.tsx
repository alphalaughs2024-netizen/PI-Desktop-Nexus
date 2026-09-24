import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAppStore } from "../../stores/app-store";
import { api } from "../../lib/api";

function copyText(text: string) { void navigator.clipboard?.writeText(text); }

const EMPTY_TIMELINE: readonly import("@pi-desktop/shared").PromptLifecycleEvent[] = [];

function contextVaultEvents(events: readonly import("@pi-desktop/shared").PromptLifecycleEvent[]) {
  return events.filter((event) => event.kind === "context_requested" || event.kind === "context_completed");
}

export function PromptInspectorTab() {
  const { t } = useTranslation();
  const sessionId = useAppStore((state) => state.activeSessionId);
  const inspector = useAppStore((state) => sessionId ? state.promptInspector[sessionId] : undefined);
  const timeline = useAppStore((state) => sessionId ? state.promptTimeline[sessionId] ?? EMPTY_TIMELINE : EMPTY_TIMELINE);
  const [history, setHistory] = useState<import("@pi-desktop/shared").PromptLifecycleEvent[]>([]);
  const [tab, setTab] = useState<"composition" | "timeline">("composition");
  const [filter, setFilter] = useState<"all" | "steering" | "context" | "recovery" | "turn">("all");
  const [loading, setLoading] = useState(false);
  const [readError, setReadError] = useState(false);
  useEffect(() => {
    if (!sessionId) return;
    setLoading(true); setReadError(false);
    void api.getSessionTimeline(sessionId, filter).then((result) => setHistory(result.records.filter((record): record is import("@pi-desktop/shared").PromptLifecycleEvent => typeof record.kind === "string" && typeof record.ts === "number") as import("@pi-desktop/shared").PromptLifecycleEvent[])).catch(() => { setHistory([]); setReadError(true); }).finally(() => setLoading(false));
  }, [sessionId, filter]);
  const composition = inspector?.composition;
  const mergedTimeline = useMemo(() => [...history, ...timeline].filter((event, index, all) => all.findIndex((candidate) => candidate.id === event.id) === index).sort((a, b) => a.ts - b.ts), [history, timeline]);
  const contextEvents = contextVaultEvents(mergedTimeline);
  if (!sessionId) return <div className="prompt-inspector-empty">No active session.</div>;
  return <div className="prompt-inspector-tab">
    <header><div><strong>Prompt inspector</strong>{composition ? <span>{composition.hash} · {composition.estimatedTokens} estimated tokens</span> : <span>Waiting for composition</span>}{contextEvents.length ? <small>Context Vault: {contextEvents.length} event{contextEvents.length === 1 ? "" : "s"}</small> : null}</div><div>{composition ? <button type="button" onClick={() => copyText(JSON.stringify({ hash: composition.hash, estimatedTokens: composition.estimatedTokens, sections: composition.sections.map(({ id, source, scope, included, estimatedTokens, hash, reason, reloadTrigger, sensitive }) => ({ id, source, scope, included, estimatedTokens, hash, reason, reloadTrigger, sensitive })) }, null, 2))}>Copy metadata</button> : null}</div></header>
    <div className="prompt-inspector-tabs"><button className={tab === "composition" ? "active" : ""} onClick={() => setTab("composition")}>Composition</button><button className={tab === "timeline" ? "active" : ""} onClick={() => setTab("timeline")}>Timeline</button></div>
    {tab === "composition" ? composition ? <><div className="prompt-inspector-summary"><span>{composition.sections.length} sections</span><span>{composition.durationMs.toFixed(1)}ms</span><span>{composition.reloadReason}</span></div><div className="prompt-inspector-list">{composition.sections.map((section) => <article key={section.id} className={section.included ? "" : "is-excluded"}><div><strong>{section.id}</strong><span>{section.source} · {section.scope}</span></div><div><b>{section.included ? `${section.estimatedTokens} tok` : "excluded"}</b><small>{section.reason}</small></div></article>)}</div></> : <div className="prompt-inspector-empty">No prompt composition has been recorded yet.</div> : <><div className="prompt-inspector-summary">{(["all", "turn", "steering", "context", "recovery"] as const).map((value) => <button key={value} className={filter === value ? "active" : ""} onClick={() => setFilter(value)}>{value}</button>)}</div>{loading ? <div className="prompt-inspector-empty">Loading timeline…</div> : readError ? <div className="prompt-inspector-empty">Timeline unavailable. Retry by reopening the inspector.</div> : <div className="prompt-inspector-timeline">{mergedTimeline.map((event) => <article key={event.id}><strong>{event.kind.replaceAll("_", " ")}</strong><span>{new Date(event.ts).toLocaleTimeString()}</span>{event.reason ? <small>{event.reason}</small> : null}{event.preview ? <small>{event.preview}</small> : null}</article>)}</div>}</>}
  </div>;
}
