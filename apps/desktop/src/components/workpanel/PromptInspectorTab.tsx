import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useAppStore } from "../../stores/app-store";

function copyText(text: string) { void navigator.clipboard?.writeText(text); }

const EMPTY_TIMELINE: readonly import("@pi-desktop/shared").PromptLifecycleEvent[] = [];

export function PromptInspectorTab() {
  const { t } = useTranslation();
  const sessionId = useAppStore((state) => state.activeSessionId);
  const inspector = useAppStore((state) => sessionId ? state.promptInspector[sessionId] : undefined);
  const timeline = useAppStore((state) => sessionId ? state.promptTimeline[sessionId] ?? EMPTY_TIMELINE : EMPTY_TIMELINE);
  const composition = inspector?.composition;
  const [filter, setFilter] = useState<"all" | "steering" | "context">("all");
  if (!composition) return <div className="prompt-inspector-empty">No prompt composition has been recorded yet.</div>;
  return <div className="prompt-inspector-tab">
    <header><div><strong>Prompt inspector</strong><span>{composition.hash} · {composition.estimatedTokens} estimated tokens</span></div><div><button type="button" onClick={() => copyText(JSON.stringify({ hash: composition.hash, estimatedTokens: composition.estimatedTokens, sections: composition.sections.map(({ id, source, scope, included, estimatedTokens, hash }) => ({ id, source, scope, included, estimatedTokens, hash })) }, null, 2))}>Copy metadata</button><small>{new Date(composition.composedAt).toLocaleTimeString()}</small></div></header>
    <div className="prompt-inspector-summary"><span>{composition.sections.length} sections</span><span>{composition.durationMs.toFixed(1)}ms</span><span>{composition.reloadReason}</span><button onClick={() => setFilter("all")}>All</button><button onClick={() => setFilter("steering")}>Steering</button><button onClick={() => setFilter("context")}>Context</button></div>
    <div className="prompt-inspector-list">{composition.sections.map((section) => <article key={section.id} className={section.included ? "" : "is-excluded"}><div><strong>{section.id}</strong><span>{section.source} · {section.scope}</span></div><div><b>{section.included ? `${section.estimatedTokens} tok` : "excluded"}</b><small>{section.reason}</small></div></article>)}</div>
    <h4 className="prompt-inspector-timeline-title">Lifecycle</h4>
    <div className="prompt-inspector-timeline">{timeline.filter((event) => filter === "all" || (filter === "steering" ? event.kind.startsWith("steering") : event.kind === "context_assembled")).map((event) => <article key={event.id}><strong>{event.kind.replaceAll("_", " ")}</strong><span>{new Date(event.ts).toLocaleTimeString()}</span>{event.reason ? <small>{event.reason}</small> : null}</article>)}</div>
  </div>;
}
