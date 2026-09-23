import type { PromptLifecycleEvent, PromptLifecycleKind } from "@pi-desktop/shared";

const MAX_PREVIEW = 240;

function stableHash(value: string): string {
  let hash = 2166136261;
  for (const char of value) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export type LifecycleInput = Omit<PromptLifecycleEvent, "id" | "ts"> & {
  sessionId: string;
  sequence: number;
  ts?: number;
};

export function createPromptLifecycleEvent(input: LifecycleInput): PromptLifecycleEvent {
  const preview = input.preview?.replace(/\s+/g, " ").trim();
  const safePreview = preview ? preview.slice(0, MAX_PREVIEW) : undefined;
  const identity = [input.sessionId, input.turnId ?? "", input.kind, input.sequence, input.reason ?? ""].join("|");
  return {
    id: `lifecycle-${stableHash(identity)}-${input.sequence}`,
    kind: input.kind,
    ts: input.ts ?? Date.now(),
    ...(input.turnId ? { turnId: input.turnId } : {}),
    ...(safePreview ? { preview: safePreview } : {}),
    ...(input.compositionHash ? { compositionHash: input.compositionHash } : {}),
    ...(input.reason ? { reason: input.reason.slice(0, 160) } : {}),
    ...(input.expectedTurnId ? { expectedTurnId: input.expectedTurnId } : {}),
    ...(input.sensitive ? { sensitive: true } : {}),
  };
}
