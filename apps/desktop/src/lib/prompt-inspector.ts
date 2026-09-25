import { modelIdsMatch, type ModelInfo, type ProviderPublic, type PromptLifecycleEvent, type PromptLifecycleFilter, type SessionSummary } from "@pi-desktop/shared";

export type PromptInspectorDataState = "live" | "historical" | "loading" | "unavailable";
export type PromptInspectorGroup = { key: string; events: PromptLifecycleEvent[]; durationMs?: number; ordinal?: number; status: "completed" | "failed" | "in_progress" | "recovered" };

export const PROMPT_INSPECTOR_FILTER_LABELS: Record<PromptLifecycleFilter, string> = { all: "All", turn: "Turn lifecycle", steering: "Steering", context: "Context", recovery: "Recovery" };

export function promptSectionLabel(id: string): string {
  const labels: Record<string, string> = { runtime: "Core runtime", "optional-tools": "Available tools", "project-instructions": "Project instructions", "context-vault": "Context Vault hint", "context-vault-brief": "Context Vault reference" };
  return labels[id] ?? id.split("-").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
}

export function promptEventLabel(kind: string): string {
  const labels: Record<string, string> = { turn_start: "Turn started", prompt_accepted: "Prompt accepted", prompt_composed: "Prompt composed", context_assembled: "Context assembled", context_requested: "Context Vault checked", context_completed: "Context Vault completed", prompt_sent: "Provider request sent", agent_start: "Agent started", agent_end: "Agent finished", tool_start: "Tool started", tool_end: "Tool completed", turn_end: "Turn completed", turn_completed: "Turn completed", steering_requested: "Steer requested", steering_accepted: "Steer accepted", steering_queued: "Steer queued", steering_rejected: "Steer rejected", steering_failed: "Steer failed", steering_unavailable: "Steer unavailable", retry_started: "Recovery started", resume_started: "Resume started", resume_success: "Resume completed", resume_unavailable: "Resume unavailable", resume_failed: "Resume failed", reconnect: "Reconnected", turn_failed: "Turn failed" };
  return labels[kind] ?? kind.replaceAll("_", " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

export function promptReasonLabel(reason: string): string {
  const labels: Record<string, string> = { "runtime-recompose": "Runtime changed", "provider-change": "Provider changed", "model-change": "Model changed", "context-refresh": "Context refreshed", "session-start": "Session started" };
  return labels[reason] ?? reason.replaceAll(/[-_]+/g, " ").replace(/^\w/, (character) => character.toUpperCase());
}

function richerEvent(a: PromptLifecycleEvent, b: PromptLifecycleEvent): PromptLifecycleEvent {
  const score = (event: PromptLifecycleEvent) => Object.keys(event).filter((key) => !["id", "kind", "ts", "turnId"].includes(key)).length;
  if (score(b) > score(a)) return b;
  if (score(a) > score(b)) return a;
  if (b.kind === "turn_completed" || b.kind === "context_completed") return b;
  return b.ts >= a.ts ? b : a;
}

/** Presentation-only normalization; persisted lifecycle records are untouched. */
export function normalizePromptLifecycle(events: readonly PromptLifecycleEvent[]): PromptLifecycleEvent[] {
  const sorted = [...events].sort((a, b) => a.ts - b.ts);
  const result: PromptLifecycleEvent[] = [];
  for (const event of sorted) {
  const isTerminal = event.kind === "turn_completed";
    const equivalent = result.findIndex((candidate) => {
      if (candidate.turnId !== event.turnId || candidate.ts !== event.ts) return false;
      if (event.kind === "context_assembled" && candidate.kind === "context_assembled") return true;
      return isTerminal && candidate.kind === "turn_completed";
    });
    if (equivalent < 0) result.push(event);
    else result[equivalent] = richerEvent(result[equivalent], event);
  }
  return result;
}

export function filterPromptLifecycle(event: PromptLifecycleEvent, filter: PromptLifecycleFilter): boolean {
  if (filter === "all") return true;
  if (filter === "context") return event.kind === "context_requested" || event.kind === "context_completed" || event.kind === "context_assembled";
  if (filter === "steering") return event.kind.startsWith("steering_");
  if (filter === "recovery") return ["retry_started", "resume_started", "resume_success", "resume_unavailable", "resume_failed", "reconnect"].includes(event.kind) || event.kind.endsWith("_failed");
  return event.kind.startsWith("turn") || event.kind.startsWith("prompt_") || event.kind === "context_assembled" || event.kind.startsWith("agent_");
}

export function groupPromptLifecycle(events: readonly PromptLifecycleEvent[]): PromptInspectorGroup[] {
  const groups = new Map<string, PromptLifecycleEvent[]>();
  for (const event of events) groups.set(event.turnId ?? "session", [...(groups.get(event.turnId ?? "session") ?? []), event]);
  let ordinal = 0;
  return [...groups.entries()].map(([key, groupEvents]) => {
    const terminal = groupEvents.find((event) => event.kind === "turn_failed") ? "failed" : groupEvents.find((event) => event.kind === "resume_success") ? "recovered" : groupEvents.find((event) => event.kind === "turn_completed") ? "completed" : "in_progress";
    const group = { key, events: groupEvents, durationMs: groupEvents.length > 1 ? groupEvents[groupEvents.length - 1].ts - groupEvents[0].ts : undefined, status: terminal } as PromptInspectorGroup;
    if (key !== "session") group.ordinal = ++ordinal;
    return group;
  });
}

export function derivePromptInspectorState(args: { loading: boolean; error: boolean; liveEvents: readonly PromptLifecycleEvent[]; running: boolean; hasEvents: boolean }): PromptInspectorDataState {
  if (args.loading) return "loading";
  if (args.error && !args.hasEvents) return "unavailable";
  if (args.running || args.liveEvents.length > 0) return "live";
  return "historical";
}

export function resolvePromptProviderModel(session: SessionSummary | undefined, providers: readonly ProviderPublic[], providerModels: Record<string, readonly ModelInfo[]>): { providerLabel?: string; modelLabel?: string; providerId?: string; modelId?: string } {
  if (!session?.providerId) return {};
  const provider = providers.find((candidate) => candidate.id === session.providerId);
  const modelId = session.modelId;
  const model = modelId ? (providerModels[session.providerId] ?? []).find((candidate) => modelIdsMatch(candidate.modelId, modelId)) : undefined;
  const binding = modelId ? provider?.models.find((candidate) => modelIdsMatch(candidate.id, modelId)) : undefined;
  return { providerId: session.providerId, modelId, providerLabel: provider?.oauthAccountLabel?.trim() || provider?.name?.trim(), modelLabel: binding?.alias?.trim() || model?.displayName?.trim() || modelId };
}

export function safeContextVaultSummary(events: readonly PromptLifecycleEvent[]) {
  const relevant = events.filter((event) => event.kind === "context_completed" || event.kind === "context_requested" || event.kind === "context_assembled");
  const event = relevant.find((candidate) => candidate.kind === "context_completed") ?? relevant[relevant.length - 1];
  if (!event) return undefined;
  return { selectedCount: event.contextSelectedCount, staleCount: event.contextPossiblyStaleCount, warningReasons: event.contextWarningReasons ?? [], budgetTokens: event.contextBudgetTokens, trigger: event.contextTrigger };
}
