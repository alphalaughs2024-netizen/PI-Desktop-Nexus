import type { ComposerDraftSnapshot } from "./composer-smart-stop";

export type QueuedPrompt = {
  id: string;
  sessionId: string;
  content: string;
  draft: ComposerDraftSnapshot;
  createdAt: number;
  sendNowRequested?: boolean;
};

export type QueuedPrompts = Record<string, QueuedPrompt[]>;

function withSessionQueue(
  queues: QueuedPrompts,
  sessionId: string,
  queue: QueuedPrompt[],
): QueuedPrompts {
  const next = { ...queues };
  if (queue.length === 0) delete next[sessionId];
  else next[sessionId] = queue;
  return next;
}

export function enqueueQueuedPrompt(
  queues: QueuedPrompts,
  item: QueuedPrompt,
): QueuedPrompts {
  const queue = queues[item.sessionId] ?? [];
  return withSessionQueue(queues, item.sessionId, [...queue, item]);
}

export function removeQueuedPrompt(
  queues: QueuedPrompts,
  sessionId: string,
  promptId: string,
): QueuedPrompts {
  const queue = queues[sessionId];
  if (!queue) return queues;
  const remaining = queue.filter((item) => item.id !== promptId);
  return remaining.length === queue.length
    ? queues
    : withSessionQueue(queues, sessionId, remaining);
}

export function prioritizeQueuedPrompt(
  queues: QueuedPrompts,
  sessionId: string,
  promptId: string,
): QueuedPrompts {
  const queue = queues[sessionId];
  if (!queue) return queues;
  const item = queue.find((candidate) => candidate.id === promptId);
  if (!item) return queues;
  const remaining = queue.filter((candidate) => candidate.id !== promptId);
  return withSessionQueue(queues, sessionId, [
    { ...item, sendNowRequested: true },
    ...remaining.map((candidate) => ({
      ...candidate,
      sendNowRequested: undefined,
    })),
  ]);
}

export function clearQueuedPromptSendNow(
  queues: QueuedPrompts,
  sessionId: string,
): QueuedPrompts {
  const queue = queues[sessionId];
  if (!queue || !queue.some((item) => item.sendNowRequested)) return queues;
  return withSessionQueue(
    queues,
    sessionId,
    queue.map((item) => ({ ...item, sendNowRequested: undefined })),
  );
}

export function reorderQueuedPrompt(queues: QueuedPrompts, sessionId: string, promptId: string, direction: "up" | "down"): QueuedPrompts {
  const queue = queues[sessionId]; if (!queue) return queues;
  const index = queue.findIndex((item) => item.id === promptId);
  const target = direction === "up" ? index - 1 : index + 1;
  if (index < 0 || target < 0 || target >= queue.length) return queues;
  const next = [...queue]; [next[index], next[target]] = [next[target], next[index]];
  return withSessionQueue(queues, sessionId, next);
}

export function queuedPromptForSession(
  queues: QueuedPrompts,
  sessionId: string,
  promptId: string,
): QueuedPrompt | undefined {
  return queues[sessionId]?.find((item) => item.id === promptId);
}
