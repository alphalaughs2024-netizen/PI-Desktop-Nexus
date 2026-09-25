import { useCallback, useEffect, useMemo, useState } from "react";
import type { PromptInspectorState, PromptLifecycleEvent, PromptLifecycleFilter } from "@pi-desktop/shared";
import { useAppStore } from "../../stores/app-store";
import { api } from "../../lib/api";
import { contextVaultWorkPanelTab } from "../../lib/work-panel-tabs";
import { derivePromptInspectorState, filterPromptLifecycle, groupPromptLifecycle, normalizePromptLifecycle, promptEventLabel, promptReasonLabel, promptSectionLabel, resolvePromptProviderModel, safeContextVaultSummary, PROMPT_INSPECTOR_FILTER_LABELS } from "../../lib/prompt-inspector";

const EMPTY_TIMELINE: readonly PromptLifecycleEvent[] = [];
function formatTokens(tokens: number): string { return Number.isFinite(tokens) ? new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 }).format(tokens) : "—"; }
function copySafeMetadata(composition: NonNullable<PromptInspectorState["composition"]>): void {
  void navigator.clipboard?.writeText(JSON.stringify({ hash: composition.hash, estimatedTokens: composition.estimatedTokens, sections: composition.sections.map(({ id, source, scope, included, estimatedTokens, hash, reason, reloadTrigger, sensitive }) => ({ id, source, scope, included, estimatedTokens, hash, reason, reloadTrigger, sensitive })) }, null, 2));
}

function eventClass(event: PromptLifecycleEvent): string {
  if (event.kind.startsWith("context_")) return "is-context";
  if (event.kind.startsWith("steering_")) return "is-steering";
  if (event.kind.endsWith("_failed")) return "is-recovery";
  if (event.kind === "turn_completed") return "is-completed";
  return "";
}

function collapseRoutineEvents(events: readonly PromptLifecycleEvent[]) {
  const groups: Array<{ key: string; events: PromptLifecycleEvent[] }> = [];
  for (const event of events) {
    const previous = groups.at(-1);
    const routine = event.kind === "context_assembled" || event.kind === "prompt_accepted";
    if (routine && previous && previous.events.every((candidate) => candidate.ts === event.ts) && previous.events.every((candidate) => candidate.kind === event.kind || candidate.kind === "context_assembled")) {
      previous.events.push(event);
    } else groups.push({ key: event.id, events: [event] });
  }
  return groups;
}

export function PromptInspectorTab() {
  const sessionId = useAppStore((state) => state.activeSessionId);
  const inspector = useAppStore((state) => sessionId ? state.promptInspector[sessionId] : undefined);
  const liveTimeline = useAppStore((state) => sessionId ? state.promptTimeline[sessionId] ?? EMPTY_TIMELINE : EMPTY_TIMELINE);
  const activeSession = useAppStore((state) => sessionId ? state.sessions.find((session) => session.id === sessionId) : undefined);
  const providers = useAppStore((state) => state.providers);
  const providerModels = useAppStore((state) => state.providerModels);
  const running = useAppStore((state) => sessionId ? state.runningSessions[sessionId] ?? false : false);
  const openWorkPanelTab = useAppStore((state) => state.openWorkPanelTab);
  const [history, setHistory] = useState<PromptLifecycleEvent[]>([]);
  const [tab, setTab] = useState<"composition" | "timeline">("composition");
  const [filter, setFilter] = useState<PromptLifecycleFilter>("all");
  const [loading, setLoading] = useState(false);
  const [readError, setReadError] = useState(false);
  const [retryNonce, setRetryNonce] = useState(0);
  const [expandedEvents, setExpandedEvents] = useState<Record<string, boolean>>({});
  useEffect(() => {
    if (!sessionId) { setHistory([]); return; }
    let active = true;
    setLoading(true); setReadError(false);
    void api.getSessionTimeline(sessionId, filter).then((result) => { if (active) setHistory(result.records.filter((record) => !("sections" in record) && typeof record.kind === "string" && typeof record.ts === "number") as PromptLifecycleEvent[]); }).catch(() => { if (active) setReadError(true); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [sessionId, filter, retryNonce]);
  const composition = inspector?.composition;
  const allTimeline = useMemo(() => normalizePromptLifecycle([...history, ...liveTimeline].filter((event, index, all) => all.findIndex((candidate) => candidate.id === event.id) === index)), [history, liveTimeline]);
  const mergedTimeline = useMemo(() => allTimeline.filter((event) => filterPromptLifecycle(event, filter)), [allTimeline, filter]);
  const timelineGroups = useMemo(() => groupPromptLifecycle(mergedTimeline), [mergedTimeline]);
  const contextEvents = allTimeline.filter((event) => event.kind === "context_requested" || event.kind === "context_completed" || event.kind === "context_assembled");
  const contextWarnings = contextEvents.flatMap((event) => event.contextWarningReasons ?? []);
  const contextSummary = safeContextVaultSummary(contextEvents);
  const includedSections = composition?.sections.filter((section) => section.included) ?? [];
  const excludedSections = composition?.sections.filter((section) => !section.included) ?? [];
  const currentEvent = mergedTimeline.at(-1);
  const dataState = derivePromptInspectorState({ loading, error: readError, liveEvents: liveTimeline, running, hasEvents: allTimeline.length > 0 });
  const runtimeIdentity = resolvePromptProviderModel(activeSession, providers, providerModels);
  const openContextVault = useCallback(() => openWorkPanelTab(contextVaultWorkPanelTab()), [openWorkPanelTab]);
  const onTabKeyDown = useCallback((event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End", "Enter", " "].includes(event.key)) return;
    event.preventDefault();
    if (event.key === "Enter" || event.key === " ") return;
    setTab(event.key === "Home" || event.key === "ArrowLeft" ? "composition" : "timeline");
  }, []);
  if (!sessionId) return <div className="prompt-inspector-empty">No active session. Open Prompt context from an active conversation to inspect runtime context.</div>;
  return <div className="prompt-inspector-tab">
    <header className="prompt-inspector-header"><div><strong>Prompt context</strong><span>What context shaped this turn</span>{runtimeIdentity.providerLabel || runtimeIdentity.modelLabel ? <span className="prompt-inspector-identity" title={`${runtimeIdentity.providerLabel ?? ""}${runtimeIdentity.providerLabel && runtimeIdentity.modelLabel ? " · " : ""}${runtimeIdentity.modelLabel ?? ""}`}>{runtimeIdentity.providerLabel}{runtimeIdentity.providerLabel && runtimeIdentity.modelLabel ? " · " : ""}{runtimeIdentity.modelLabel}</span> : null}<small>{currentEvent ? `${promptEventLabel(currentEvent.kind)} · ${new Date(currentEvent.ts).toLocaleTimeString()} · ${dataState}` : `No composition recorded · ${dataState}`}</small></div>{composition ? <button type="button" title="Copies hashes, section names, token estimates, and lifecycle metadata. Prompt content and secrets are excluded." onClick={() => copySafeMetadata(composition)}>Copy safe metadata</button> : null}</header>
    <div className="prompt-inspector-tabs" role="tablist" aria-label="Prompt context views"><button id="prompt-inspector-composition-tab" role="tab" tabIndex={tab === "composition" ? 0 : -1} aria-selected={tab === "composition"} aria-controls="prompt-inspector-composition" className={tab === "composition" ? "active" : ""} onKeyDown={onTabKeyDown} onClick={() => setTab("composition")}>Composition</button><button id="prompt-inspector-timeline-tab" role="tab" tabIndex={tab === "timeline" ? 0 : -1} aria-selected={tab === "timeline"} aria-controls="prompt-inspector-timeline" className={tab === "timeline" ? "active" : ""} onKeyDown={onTabKeyDown} onClick={() => setTab("timeline")}>Timeline</button></div>
    <div className={`prompt-inspector-summary ${composition ? "is-ready" : "is-empty"}`}><div className="prompt-inspector-summary-heading"><strong>{composition ? (contextWarnings.length ? "Prompt ready with warnings" : "Prompt ready") : "No prompt composition recorded yet"}</strong><span className={`prompt-inspector-state is-${dataState}`}>{dataState.charAt(0).toUpperCase() + dataState.slice(1)}</span></div>{composition ? <><div className="prompt-inspector-summary-value">{formatTokens(composition.estimatedTokens)}<small>estimated tokens</small></div><div className="prompt-inspector-summary-metrics"><span><b>{includedSections.length}</b> included</span><span><b>{excludedSections.length}</b> excluded</span><span><b>{composition.durationMs.toFixed(1)}ms</b> composition time</span></div>{composition.reloadReason ? <div className="prompt-inspector-summary-reason">Reason · {promptReasonLabel(composition.reloadReason)}</div> : null}</> : <span>The inspector will show included context after the next prompt starts.</span>}</div>
    {tab === "composition" ? <div id="prompt-inspector-composition" role="tabpanel" aria-labelledby="prompt-inspector-composition-tab">{composition ? <><section className="prompt-inspector-section-group"><h2>Included context</h2><div className="prompt-inspector-list">{includedSections.map((section) => <article key={section.id} title={section.id} className="prompt-inspector-row is-included"><div className="prompt-inspector-row-rail" /><div className="prompt-inspector-row-main"><strong>{promptSectionLabel(section.id)}</strong><span>{section.source} · {section.scope}</span></div><div className="prompt-inspector-row-value"><b>{formatTokens(section.estimatedTokens)} estimated tokens</b>{section.reason ? <small>{section.reason}</small> : <small>Included</small>}</div></article>)}</div></section><section className="prompt-inspector-section-group"><h2>Excluded context</h2><div className="prompt-inspector-list">{excludedSections.map((section) => <article key={section.id} title={section.id} className="prompt-inspector-row is-excluded"><div className="prompt-inspector-row-rail" /><div className="prompt-inspector-row-main"><strong>{promptSectionLabel(section.id)}</strong><span>{section.source} · {section.scope}</span></div><div className="prompt-inspector-row-value"><b>{section.reason ?? "No matching context selected"}</b><small>Excluded</small></div></article>)}</div></section>{contextSummary ? <section className={`prompt-inspector-context ${contextSummary.selectedCount ? "has-claims" : "is-empty"}`}><div><strong>Context Vault</strong><span>{contextSummary.selectedCount ? `${contextSummary.selectedCount} claims included${contextSummary.staleCount ? ` · ${contextSummary.staleCount} stale claim${contextSummary.staleCount === 1 ? "" : "s"} omitted` : ""}` : "No claims selected"}</span>{contextSummary.selectedCount ? <><small>{contextSummary.warningReasons.length ? `Warnings · ${contextSummary.warningReasons.join(", ")}` : "Freshness checked before use"}</small>{contextSummary.budgetTokens !== undefined ? <small>Budget · {formatTokens(contextSummary.budgetTokens)} tokens</small> : null}{contextSummary.trigger ? <small>Trigger · {promptReasonLabel(contextSummary.trigger)}</small> : null}</> : null}</div><button type="button" onClick={openContextVault}>Open Context Vault</button></section> : null}</> : <div className="prompt-inspector-empty">No prompt composition recorded yet. The inspector will show included context after the next prompt starts.</div>}</div> : <div id="prompt-inspector-timeline" role="tabpanel" aria-labelledby="prompt-inspector-timeline-tab"><div className="prompt-inspector-filters" role="group" aria-label="Timeline filters">{(Object.keys(PROMPT_INSPECTOR_FILTER_LABELS) as PromptLifecycleFilter[]).map((value) => <button key={value} type="button" className={filter === value ? "active" : ""} aria-pressed={filter === value} onClick={() => setFilter(value)}>{PROMPT_INSPECTOR_FILTER_LABELS[value]}</button>)}</div>{loading && !mergedTimeline.length ? <div className="prompt-inspector-empty">Loading lifecycle…</div> : readError && !mergedTimeline.length ? <div className="prompt-inspector-empty">Timeline unavailable. <button type="button" onClick={() => setRetryNonce((value) => value + 1)}>Retry</button></div> : mergedTimeline.length ? <div className="prompt-inspector-stepper">{timelineGroups.map((group) => <section key={group.key} className={`prompt-inspector-timeline-group is-${group.status}`}><h2>{group.key === "session" ? "Session lifecycle" : `Turn ${group.ordinal}`}<span className="prompt-inspector-group-status">{group.status === "in_progress" ? "In progress" : group.status.charAt(0).toUpperCase() + group.status.slice(1)}{group.durationMs !== undefined ? ` · ${(group.durationMs / 1000).toFixed(1)}s` : ""}</span></h2><div className="prompt-inspector-stepper-events">{collapseRoutineEvents(group.events).map((eventGroup) => <div className="prompt-inspector-step" key={eventGroup.key}><span className={`prompt-inspector-step-node ${eventClass(eventGroup.events[0])}`} /><div className="prompt-inspector-step-body">{eventGroup.events.length > 1 ? <button type="button" className="prompt-inspector-step-toggle" aria-expanded={expandedEvents[eventGroup.key] === true} onClick={() => setExpandedEvents((current) => ({ ...current, [eventGroup.key]: !current[eventGroup.key] }))}>{promptEventLabel(eventGroup.events[0].kind)} · {eventGroup.events.length} events</button> : <strong>{promptEventLabel(eventGroup.events[0].kind)}</strong>}<time>{new Date(eventGroup.events[0].ts).toLocaleTimeString()}</time>{eventGroup.events.length > 1 && expandedEvents[eventGroup.key] ? eventGroup.events.slice(1).map((event) => <small key={event.id}>{promptEventLabel(event.kind)} · {new Date(event.ts).toLocaleTimeString()}</small>) : null}{eventGroup.events.length === 1 && eventGroup.events[0].reason ? <small>{promptReasonLabel(eventGroup.events[0].reason)}</small> : null}</div></div>)}</div></section>)}</div> : <div className="prompt-inspector-empty">No events match this filter.</div>}</div>}
  </div>;
}
