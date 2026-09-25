import { useCallback, useEffect, useMemo, useState } from "react";
import type { PromptLifecycleEvent, PromptLifecycleFilter, PromptInspectorState } from "@pi-desktop/shared";
import { useAppStore } from "../../stores/app-store";
import { api } from "../../lib/api";
import { contextVaultWorkPanelTab } from "../../lib/work-panel-tabs";

const EMPTY_TIMELINE: readonly PromptLifecycleEvent[] = [];
const SECTION_LABELS: Record<string, string> = { runtime: "Core runtime", "optional-tools": "Available tools", "project-instructions": "Project instructions", "context-vault": "Context Vault hint", "context-vault-brief": "Context Vault reference" };
const FILTER_LABELS: Record<PromptLifecycleFilter, string> = { all: "All", turn: "Turn lifecycle", steering: "Steering", context: "Context", recovery: "Recovery" };
function sectionLabel(id: string): string { return SECTION_LABELS[id] ?? id.split("-").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" "); }
function formatTokens(tokens: number): string { return Number.isFinite(tokens) ? new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 }).format(tokens) : "—"; }
function eventLabel(kind: string): string {
  const labels: Record<string, string> = { turn_start: "Turn started", prompt_accepted: "Prompt accepted", prompt_composed: "Prompt composed", context_assembled: "Context assembled", context_requested: "Context Vault checked", context_completed: "Context Vault completed", prompt_sent: "Provider request sent", agent_start: "Agent started", agent_end: "Agent finished", tool_start: "Tool started", tool_end: "Tool completed", turn_end: "Turn completed", turn_completed: "Turn completed", steering_requested: "Steer requested", steering_accepted: "Steer accepted", steering_queued: "Steer queued", steering_rejected: "Steer rejected", steering_failed: "Steer failed", steering_unavailable: "Steer unavailable", retry_started: "Recovery started", resume_started: "Resume started", resume_success: "Resume completed", resume_unavailable: "Resume unavailable", resume_failed: "Resume failed", reconnect: "Reconnected", turn_failed: "Turn failed" };
  return labels[kind] ?? kind.replaceAll("_", " ").replace(/\b\w/g, (character) => character.toUpperCase());
}
function isContextEvent(event: PromptLifecycleEvent): boolean { return event.kind === "context_requested" || event.kind === "context_completed" || event.kind === "context_assembled"; }
function eventMatchesFilter(event: PromptLifecycleEvent, filter: PromptLifecycleFilter): boolean {
  if (filter === "all") return true;
  if (filter === "context") return isContextEvent(event);
  if (filter === "steering") return event.kind.startsWith("steering_");
  if (filter === "recovery") return ["retry_started", "resume_started", "resume_success", "resume_unavailable", "resume_failed", "reconnect"].includes(event.kind) || event.kind.endsWith("_failed");
  return event.kind.startsWith("turn") || event.kind.startsWith("prompt_") || event.kind === "context_assembled" || event.kind.startsWith("agent_");
}
function copySafeMetadata(composition: NonNullable<PromptInspectorState["composition"]>): void {
  void navigator.clipboard?.writeText(JSON.stringify({ hash: composition.hash, estimatedTokens: composition.estimatedTokens, sections: composition.sections.map(({ id, source, scope, included, estimatedTokens, hash, reason, reloadTrigger, sensitive }) => ({ id, source, scope, included, estimatedTokens, hash, reason, reloadTrigger, sensitive })) }, null, 2));
}

export function PromptInspectorTab() {
  const sessionId = useAppStore((state) => state.activeSessionId);
  const inspector = useAppStore((state) => sessionId ? state.promptInspector[sessionId] : undefined);
  const liveTimeline = useAppStore((state) => sessionId ? state.promptTimeline[sessionId] ?? EMPTY_TIMELINE : EMPTY_TIMELINE);
  const openWorkPanelTab = useAppStore((state) => state.openWorkPanelTab);
  const [history, setHistory] = useState<PromptLifecycleEvent[]>([]);
  const [tab, setTab] = useState<"composition" | "timeline">("composition");
  const [filter, setFilter] = useState<PromptLifecycleFilter>("all");
  const [loading, setLoading] = useState(false);
  const [readError, setReadError] = useState(false);
  const [retryNonce, setRetryNonce] = useState(0);
  useEffect(() => {
    if (!sessionId) { setHistory([]); return; }
    let active = true;
    setLoading(true); setReadError(false);
    void api.getSessionTimeline(sessionId, filter).then((result) => { if (active) setHistory(result.records.filter((record): record is PromptLifecycleEvent => typeof record.kind === "string" && typeof record.ts === "number")); }).catch(() => { if (active) setReadError(true); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [sessionId, filter, retryNonce]);
  const composition = inspector?.composition;
  const allTimeline = useMemo(() => [...history, ...liveTimeline].filter((event, index, all) => all.findIndex((candidate) => candidate.id === event.id) === index).sort((a, b) => a.ts - b.ts), [history, liveTimeline]);
  const mergedTimeline = useMemo(() => allTimeline.filter((event) => eventMatchesFilter(event, filter)), [allTimeline, filter]);
  const timelineGroups = useMemo(() => {
    const groups = new Map<string, PromptLifecycleEvent[]>();
    for (const event of mergedTimeline) {
      const key = event.turnId ?? "session";
      groups.set(key, [...(groups.get(key) ?? []), event]);
    }
    return [...groups.entries()].map(([key, events]) => ({ key, events, durationMs: events.length > 1 ? events[events.length - 1].ts - events[0].ts : undefined }));
  }, [mergedTimeline]);
  const contextEvents = allTimeline.filter(isContextEvent);
  const contextWarnings = contextEvents.flatMap((event) => event.contextWarningReasons ?? []);
  const includedSections = composition?.sections.filter((section) => section.included).length ?? 0;
  const excludedSections = composition ? composition.sections.length - includedSections : 0;
  const currentEvent = mergedTimeline.at(-1);
  const dataState = loading ? "loading" : readError && !mergedTimeline.length ? "unavailable" : liveTimeline.length ? "live" : "historical";
  const openContextVault = useCallback(() => openWorkPanelTab(contextVaultWorkPanelTab()), [openWorkPanelTab]);
  if (!sessionId) return <div className="prompt-inspector-empty">No active session. Open Prompt context from an active conversation to inspect runtime context.</div>;
  return <div className="prompt-inspector-tab">
    <header><div><strong>Prompt context</strong><span>What context shaped this turn</span><small>{currentEvent ? `${eventLabel(currentEvent.kind)} · ${new Date(currentEvent.ts).toLocaleTimeString()} · ${dataState}` : `No composition recorded · ${dataState}`}</small></div>{composition ? <button type="button" title="Copies hashes, section names, token estimates, and lifecycle metadata. Prompt content and secrets are excluded." onClick={() => copySafeMetadata(composition)}>Copy safe metadata</button> : null}</header>
    <div className="prompt-inspector-tabs" role="tablist" aria-label="Prompt context views"><button id="prompt-inspector-composition-tab" role="tab" aria-selected={tab === "composition"} aria-controls="prompt-inspector-composition" className={tab === "composition" ? "active" : ""} onClick={() => setTab("composition")}>Composition</button><button id="prompt-inspector-timeline-tab" role="tab" aria-selected={tab === "timeline"} aria-controls="prompt-inspector-timeline" className={tab === "timeline" ? "active" : ""} onClick={() => setTab("timeline")}>Timeline</button></div>
    <div className={`prompt-inspector-summary ${composition ? "is-ready" : "is-empty"}`}><span>{composition ? (contextWarnings.length ? "Prompt ready with warnings" : "Prompt ready") : "No prompt composition recorded yet"}</span>{composition ? <><span>{formatTokens(composition.estimatedTokens)} estimated tokens</span><span>{includedSections} included · {excludedSections} excluded</span><span>Composed in {composition.durationMs.toFixed(1)}ms</span><span>{dataState}</span>{composition.reloadReason ? <span>Reason · {composition.reloadReason.replaceAll("_", " ")}</span> : null}</> : <span>The inspector will show included context after the next prompt starts.</span>}{contextEvents.length ? <span>Context Vault · {contextEvents.length} events{contextWarnings.length ? ` · ${contextWarnings.length} warnings` : ""}</span> : null}</div>
    {tab === "composition" ? <div id="prompt-inspector-composition" role="tabpanel" aria-labelledby="prompt-inspector-composition-tab">{composition ? <><div className="prompt-inspector-list">{composition.sections.map((section) => <article key={section.id} className={section.included ? "is-included" : "is-excluded"}><div><strong>{section.included ? "Included" : "Excluded"} · {sectionLabel(section.id)}</strong><span>{section.source} · {section.scope}</span></div><div><b>{section.included ? `${formatTokens(section.estimatedTokens)} estimated tokens` : "Excluded"}</b><small>{section.reason ?? (section.included ? "Included in prompt" : "No matching context selected")}</small></div></article>)}</div>{contextEvents.length ? <section className="prompt-inspector-context"><strong>Context Vault</strong><span>{contextEvents.length} lifecycle events{contextWarnings.length ? ` · ${contextWarnings.length} warnings` : ""}</span><small>Claim bodies and evidence excerpts are hidden.</small><button type="button" onClick={openContextVault}>Open Context Vault</button></section> : null}</> : <div className="prompt-inspector-empty">No prompt composition recorded yet. The inspector will show included context after the next prompt starts.</div>}</div> : <div id="prompt-inspector-timeline" role="tabpanel" aria-labelledby="prompt-inspector-timeline-tab"><div className="prompt-inspector-filters" role="group" aria-label="Timeline filters">{(Object.keys(FILTER_LABELS) as PromptLifecycleFilter[]).map((value) => <button key={value} type="button" className={filter === value ? "active" : ""} aria-pressed={filter === value} onClick={() => setFilter(value)}>{FILTER_LABELS[value]}</button>)}</div>{loading && !mergedTimeline.length ? <div className="prompt-inspector-empty">Loading lifecycle…</div> : readError && !mergedTimeline.length ? <div className="prompt-inspector-empty">Timeline unavailable. <button type="button" onClick={() => setRetryNonce((value) => value + 1)}>Retry</button></div> : mergedTimeline.length ? <div className="prompt-inspector-timeline">{timelineGroups.map((group) => <section key={group.key} className="prompt-inspector-timeline-group"><h3>{group.key === "session" ? "Session lifecycle" : `Turn ${group.key}`}{group.durationMs !== undefined ? ` · ${(group.durationMs / 1000).toFixed(1)}s` : ""}</h3>{group.events.map((event) => <article key={event.id} className={isContextEvent(event) ? "is-context" : event.kind.startsWith("steering_") ? "is-steering" : event.kind.endsWith("_failed") ? "is-recovery" : ""}><strong>{eventLabel(event.kind)}</strong><span>{new Date(event.ts).toLocaleTimeString()}</span>{event.reason ? <small>{event.reason}</small> : null}{event.preview && !event.sensitive ? <small>{event.preview}</small> : null}</article>)}</section>)}</div> : <div className="prompt-inspector-empty">No events match this filter.</div>}</div>}
  </div>;
}
