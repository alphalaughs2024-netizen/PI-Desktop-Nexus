import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAppStore } from "../../stores/app-store";
import { api } from "../../lib/api";

function copyText(text: string) { void navigator.clipboard?.writeText(text); }

const EMPTY_TIMELINE: readonly import("@pi-desktop/shared").PromptLifecycleEvent[] = [];
const PROMPT_SECTION_LABELS: Record<string, string> = { runtime: "Core runtime", "optional-tools": "Available tools", "project-instructions": "Project instructions", "context-vault": "Context Vault hint", "context-vault-brief": "Context Vault reference" };
function sectionLabel(id: string): string { return PROMPT_SECTION_LABELS[id] ?? id.split("-").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" "); }

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
  const includedSections = composition?.sections.filter((section) => section.included).length ?? 0;
  const excludedSections = composition ? composition.sections.length - includedSections : 0;
  const contextWarnings = contextEvents.flatMap((event) => event.contextWarningReasons ?? []);
  const currentEvent = mergedTimeline.at(-1);
  const labelForEvent = (kind: string) => ({ turn_start: "Turn started", prompt_composed: "Prompt composed", context_requested: "Context Vault checked", context_completed: "Context Vault completed", agent_start: "Agent started", tool_start: "Tool started", tool_end: "Tool completed", turn_end: "Turn completed", agent_end: "Agent finished" } as Record<string, string>)[kind] ?? kind.replaceAll("_", " ");
  if (!sessionId) return <div className="prompt-inspector-empty">No active session.</div>;
  return <div className="prompt-inspector-tab">
    <header><div><strong>Prompt context</strong><span>Advanced runtime diagnostics</span><small>{currentEvent ? `${labelForEvent(currentEvent.kind)} · ${new Date(currentEvent.ts).toLocaleTimeString()}` : "Waiting for composition"}</small></div><div>{composition ? <button type="button" title="Copies safe metadata only. Prompt content and secrets are excluded." onClick={() => copyText(JSON.stringify({ hash: composition.hash, estimatedTokens: composition.estimatedTokens, sections: composition.sections.map(({ id, source, scope, included, estimatedTokens, hash, reason, reloadTrigger, sensitive }) => ({ id, source, scope, included, estimatedTokens, hash, reason, reloadTrigger, sensitive })) }, null, 2))}>Copy safe metadata</button> : null}</div></header>
    <div className="prompt-inspector-tabs" role="tablist" aria-label="Prompt context views"><button role="tab" aria-selected={tab === "composition"} className={tab === "composition" ? "active" : ""} onClick={() => setTab("composition")}>Composition</button><button role="tab" aria-selected={tab === "timeline"} className={tab === "timeline" ? "active" : ""} onClick={() => setTab("timeline")}>Timeline</button></div>
    <div className={`prompt-inspector-summary ${composition ? "is-ready" : "is-empty"}`}><span>{composition ? "Prompt ready" : "No composition"}</span>{composition ? <><span>{composition.estimatedTokens} estimated tokens</span><span>{includedSections} included · {excludedSections} excluded</span><span>{composition.durationMs.toFixed(1)}ms</span></> : null}{contextEvents.length ? <span>Context Vault · {contextEvents.length} events{contextWarnings.length ? ` · ${contextWarnings.length} warnings` : ""}</span> : null}</div>
    {tab === "composition" ? composition ? <><div className="prompt-inspector-summary"><span>{composition.sections.length} sections</span><span>{composition.durationMs.toFixed(1)}ms</span><span>{composition.reloadReason}</span></div><div className="prompt-inspector-list">{composition.sections.map((section) => <article key={section.id} className={section.included ? "" : "is-excluded"}><div><strong>{section.id}</strong><span>{section.source} · {section.scope}</span></div><div><b>{section.included ? `${section.estimatedTokens} tok` : "excluded"}</b><small>{section.reason}</small></div></article>)}</div></> : <div className="prompt-inspector-empty">No prompt composition has been recorded yet.</div> : <><div className="prompt-inspector-summary">{(["all", "turn", "steering", "context", "recovery"] as const).map((value) => <button key={value} className={filter === value ? "active" : ""} onClick={() => setFilter(value)}>{value}</button>)}</div>{loading ? <div className="prompt-inspector-empty">Loading timeline…</div> : readError ? <div className="prompt-inspector-empty">Timeline unavailable. Retry by reopening the inspector.</div> : <div className="prompt-inspector-timeline">{mergedTimeline.map((event) => <article key={event.id}><strong>{event.kind.replaceAll("_", " ")}</strong><span>{new Date(event.ts).toLocaleTimeString()}</span>{event.reason ? <small>{event.reason}</small> : null}{event.preview ? <small>{event.preview}</small> : null}</article>)}</div>}</>}
  </div>;
}
