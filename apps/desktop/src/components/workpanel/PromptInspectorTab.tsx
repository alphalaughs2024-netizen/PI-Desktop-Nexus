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
  const includedSections = composition?.sections.filter((section) => section.included).length ?? 0;
  const excludedSections = composition ? composition.sections.length - includedSections : 0;
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
    <header><div><strong>Prompt context</strong><span>What context shaped this turn</span>{runtimeIdentity.providerLabel || runtimeIdentity.modelLabel ? <span className="prompt-inspector-identity" title={`${runtimeIdentity.providerLabel ?? ""}${runtimeIdentity.providerLabel && runtimeIdentity.modelLabel ? " · " : ""}${runtimeIdentity.modelLabel ?? ""}`}>{runtimeIdentity.providerLabel}{runtimeIdentity.providerLabel && runtimeIdentity.modelLabel ? " · " : ""}{runtimeIdentity.modelLabel}</span> : null}<small>{currentEvent ? `${promptEventLabel(currentEvent.kind)} · ${new Date(currentEvent.ts).toLocaleTimeString()} · ${dataState}` : `No composition recorded · ${dataState}`}</small></div>{composition ? <button type="button" title="Copies hashes, section names, token estimates, and lifecycle metadata. Prompt content and secrets are excluded." onClick={() => copySafeMetadata(composition)}>Copy safe metadata</button> : null}</header>
    <div className="prompt-inspector-tabs" role="tablist" aria-label="Prompt context views"><button id="prompt-inspector-composition-tab" role="tab" tabIndex={tab === "composition" ? 0 : -1} aria-selected={tab === "composition"} aria-controls="prompt-inspector-composition" className={tab === "composition" ? "active" : ""} onKeyDown={onTabKeyDown} onClick={() => setTab("composition")}>Composition</button><button id="prompt-inspector-timeline-tab" role="tab" tabIndex={tab === "timeline" ? 0 : -1} aria-selected={tab === "timeline"} aria-controls="prompt-inspector-timeline" className={tab === "timeline" ? "active" : ""} onKeyDown={onTabKeyDown} onClick={() => setTab("timeline")}>Timeline</button></div>
    <div className={`prompt-inspector-summary ${composition ? "is-ready" : "is-empty"}`}><span>{composition ? (contextWarnings.length ? "Prompt ready with warnings" : "Prompt ready") : "No prompt composition recorded yet"}</span>{composition ? <><span>{formatTokens(composition.estimatedTokens)} estimated tokens</span><span>{includedSections} included · {excludedSections} excluded</span><span>Composed in {composition.durationMs.toFixed(1)}ms</span><span>{dataState}</span>{composition.reloadReason ? <span>Reason · {promptReasonLabel(composition.reloadReason)}</span> : null}</> : <span>The inspector will show included context after the next prompt starts.</span>}{contextSummary ? <span>Context Vault · {contextSummary.selectedCount ?? 0} claims</span> : null}</div>
    {tab === "composition" ? <div id="prompt-inspector-composition" role="tabpanel" aria-labelledby="prompt-inspector-composition-tab">{composition ? <><div className="prompt-inspector-list">{composition.sections.map((section) => <article key={section.id} className={section.included ? "is-included" : "is-excluded"}><div><strong>{section.included ? "Included" : "Excluded"} · {promptSectionLabel(section.id)}</strong><span>{section.source} · {section.scope}</span></div><div><b>{section.included ? `${formatTokens(section.estimatedTokens)} estimated tokens` : (section.reason ?? "Excluded")}</b>{section.included && section.reason ? <small>{section.reason}</small> : null}</div></article>)}</div>{contextSummary ? <section className="prompt-inspector-context"><strong>Context Vault</strong>{contextSummary.selectedCount !== undefined || contextSummary.staleCount !== undefined ? <span>{contextSummary.selectedCount ?? 0} claims included{contextSummary.staleCount ? ` · ${contextSummary.staleCount} stale claim${contextSummary.staleCount === 1 ? "" : "s"} omitted` : ""}</span> : null}{contextSummary.warningReasons.length ? <small>Warnings · {contextSummary.warningReasons.join(", ")}</small> : <small>Freshness checked before use</small>}{contextSummary.budgetTokens !== undefined ? <small>Budget · {formatTokens(contextSummary.budgetTokens)} tokens</small> : null}{contextSummary.trigger ? <small>Trigger · {promptReasonLabel(contextSummary.trigger)}</small> : null}<button type="button" onClick={openContextVault}>Open Context Vault</button></section> : null}</> : <div className="prompt-inspector-empty">No prompt composition recorded yet. The inspector will show included context after the next prompt starts.</div>}</div> : <div id="prompt-inspector-timeline" role="tabpanel" aria-labelledby="prompt-inspector-timeline-tab"><div className="prompt-inspector-filters" role="group" aria-label="Timeline filters">{(Object.keys(PROMPT_INSPECTOR_FILTER_LABELS) as PromptLifecycleFilter[]).map((value) => <button key={value} type="button" className={filter === value ? "active" : ""} aria-pressed={filter === value} onClick={() => setFilter(value)}>{PROMPT_INSPECTOR_FILTER_LABELS[value]}</button>)}</div>{loading && !mergedTimeline.length ? <div className="prompt-inspector-empty">Loading lifecycle…</div> : readError && !mergedTimeline.length ? <div className="prompt-inspector-empty">Timeline unavailable. <button type="button" onClick={() => setRetryNonce((value) => value + 1)}>Retry</button></div> : mergedTimeline.length ? <div className="prompt-inspector-timeline">{timelineGroups.map((group) => <section key={group.key} className={`prompt-inspector-timeline-group is-${group.status}`}><h3>{group.key === "session" ? "Session lifecycle" : `Turn ${group.ordinal}`}<span className="prompt-inspector-group-status">{group.status === "in_progress" ? "In progress" : group.status.charAt(0).toUpperCase() + group.status.slice(1)}{group.durationMs !== undefined ? ` · ${(group.durationMs / 1000).toFixed(1)}s` : ""}</span></h3>{group.events.map((event) => <article key={event.id} className={event.kind.startsWith("context_") ? "is-context" : event.kind.startsWith("steering_") ? "is-steering" : event.kind.endsWith("_failed") ? "is-recovery" : ""}><strong>{promptEventLabel(event.kind)}</strong><span>{new Date(event.ts).toLocaleTimeString()}</span>{event.reason ? <small>{promptReasonLabel(event.reason)}</small> : null}{event.preview && !event.sensitive ? <small>{event.preview}</small> : null}</article>)}</section>)}</div> : <div className="prompt-inspector-empty">No events match this filter.</div>}</div>}
  </div>;
}
