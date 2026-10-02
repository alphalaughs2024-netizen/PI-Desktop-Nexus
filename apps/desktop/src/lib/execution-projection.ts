import type { EngineSnapshot, UiMessage } from "@pi-desktop/shared";
import { mergeLiveSessionMessages } from "./session-transcript";

/** Reconstruct display records only. Reconnection never dispatches tools. */
export function executionMessages(snapshot: EngineSnapshot): UiMessage[] {
  const turn = snapshot.turn;
  if (!turn) return [];
  const messages: UiMessage[] = [{ id: `${turn.id}:execution`, turnId: turn.id, role: "assistant", content: "",
    status: "complete", createdAt: new Date(turn.completedAt ?? Date.now()).toISOString(), execution: turn,
    modelId: snapshot.session.modelId, providerId: snapshot.session.providerId }];
  for (const item of snapshot.items) {
    const status = item.status === "running" ? "streaming" : item.status === "interrupted" ? "aborted" : item.status === "failed" ? "error" : "complete";
    const base = { id: item.id, turnId: turn.id, createdAt: new Date(item.startedAt).toISOString(), status } as const;
    if (item.kind === "assistant" || item.kind === "reasoning") {
      messages.push({ ...base, role: "assistant", content: item.kind === "assistant" ? item.text : "",
        thinking: item.kind === "reasoning" ? item.text : undefined, modelId: snapshot.session.modelId, providerId: snapshot.session.providerId });
    } else if (item.kind === "tool" || item.kind === "approval") {
      messages.push({ ...base, role: "tool", content: item.text, toolCallId: item.id, toolName: item.label,
        toolArgs: item.args, toolResult: item.result ?? item.text,
        toolStatus: item.status === "running" ? "running" : item.status === "completed" ? "success" : "error",
        ...(item.completedAt !== undefined ? { toolCompletedAt: new Date(item.completedAt).toISOString(), toolDurationMs: Math.max(0, item.completedAt - item.startedAt) } : {}) });
    }
  }
  return messages;
}

/** Call after rejecting stale snapshots. Terminal state settles retained streaming rows. */
export function reconcileExecutionMessages(current: UiMessage[], snapshot: EngineSnapshot): UiMessage[] {
  const projected = executionMessages(snapshot);
  const byId = new Map(projected.map(message => [message.id, message]));
  const currentById = new Map(current.map(message => [message.id, message]));
  return mergeLiveSessionMessages(current, projected).map(message => {
    const restored = byId.get(message.id);
    if (!restored) return message;
    const live = currentById.get(message.id);
    if (restored.execution) return live?.execution?.outcome ? live : restored;
    if (snapshot.turn?.outcome && (live?.status === "streaming" || live?.toolStatus === "running")) {
      return { ...live, ...restored };
    }
    return live ?? message;
  });
}
