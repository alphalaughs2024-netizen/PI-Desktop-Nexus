import type { EngineTurn } from "@pi-desktop/shared";

const tokenCount = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0;

/** Codex input/output totals already include their cache/reasoning subsets. */
export function nativeContextUsage(value: unknown): EngineTurn["contextUsage"] {
  const tokenUsage = value as { last?: Record<string, unknown>; modelContextWindow?: unknown } | null;
  const last = tokenUsage?.last;
  if (!last || !tokenCount(last.inputTokens) || !tokenCount(last.outputTokens) || !tokenCount(last.totalTokens)) return undefined;
  for (const field of ["cachedInputTokens", "cacheWriteInputTokens", "reasoningOutputTokens"]) {
    if (last[field] !== undefined && !tokenCount(last[field])) return undefined;
  }
  const cached = Math.min(last.inputTokens, Number(last.cachedInputTokens ?? 0));
  const written = Math.min(last.inputTokens - cached, Number(last.cacheWriteInputTokens ?? 0));
  const reasoning = Math.min(last.outputTokens, Number(last.reasoningOutputTokens ?? 0));
  return {
    usage: {
      inputTokens: last.inputTokens - cached - written,
      outputTokens: last.outputTokens - reasoning,
      cacheReadTokens: cached,
      cacheWriteTokens: written,
      reasoningTokens: reasoning,
      totalTokens: last.totalTokens,
    },
    ...(tokenCount(tokenUsage?.modelContextWindow) && tokenUsage.modelContextWindow > 0
      ? { contextWindow: tokenUsage.modelContextWindow } : {}),
  };
}
