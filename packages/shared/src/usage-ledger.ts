import type { MessageUsage, ModelCost } from "./types.js";

export type UsageRequest = {
  id: string;
  sessionId: string;
  turnId: string;
  providerId: string;
  modelId: string;
  agentName?: string;
  responseId?: string;
  occurredAt: number;
  kind: "response" | "compaction";
  outcome: "running" | "completed" | "failed" | "interrupted";
  usage?: MessageUsage;
  amountUsd?: string;
  provenance: "provider_reported" | "provider_generation" | "provider_estimate" | "catalog_estimate" | "unpriced" | "unavailable";
};

export type UsageTotals = {
  turnCount: number;
  requestCount: number;
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  reasoningTokens: number;
  reportedUsd: string;
  estimatedUsd: string;
  pricedRequests: number;
  reportedRequests: number;
  estimatedRequests: number;
  unknownRequests: number;
  legacyTurns: number;
};
export type UsageGroup = UsageTotals & { id: string; label: string; providerId?: string; modelId?: string };
export type UsageLedger = {
  totals: UsageTotals;
  sessions: UsageGroup[];
  models: UsageGroup[];
  days: UsageGroup[];
  requests: UsageRequest[];
};
export type UsageLedgerQuery = { sessionId?: string; providerId?: string; modelId?: string; startDate?: number; endDate?: number };

export type ProviderAccountSnapshot = {
  provider: string;
  scope: "key" | "account";
  state: "ready" | "stale" | "unavailable" | "unsupported";
  updatedAt?: number;
  staleAt?: number;
  plan?: string;
  balance?: { amount: string; unit: string };
  spend?: { amount: string; unit: string; period: "all" | "day" | "week" | "month" };
  windows?: Array<{ kind: string; used?: string; limit?: string | null; remaining?: string | null; unit: string; resetsAt?: number; resetsInSec?: number }>;
  tokens?: number;
  requests?: number;
  freeTokens?: { usedToday?: number; limitPerDay?: number | null; remaining?: number | null };
  error?: "authentication_failed" | "rate_limited" | "refresh_failed" | "invalid_response" | "unsupported" | "missing_key";
};
export type ProviderAccountHistory = {
  provider: string; scope: "key" | "account"; period: "day" | "week" | "month";
  points: Array<{ timestamp: number; requests?: number; tokens?: number; spend?: string }>;
  total?: { requests?: number; tokens?: number; spend?: string };
  unit?: string;
};
export type ProviderAccountResult = { snapshot: ProviderAccountSnapshot; history?: ProviderAccountHistory };

/** Decimal USD is stored and summed at nano-dollar precision, without float accumulation. */
export function usdNanos(value: string): bigint | undefined {
  if (!/^\d+(?:\.\d{1,9})?$/.test(value) || value.length > 30) return undefined;
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole) * 1_000_000_000n + BigInt(fraction.padEnd(9, "0"));
}
export function nanosUsd(value: bigint): string {
  return `${value / 1_000_000_000n}.${(value % 1_000_000_000n).toString().padStart(9, "0")}`;
}
export function sumUsd(...values: string[]): string {
  return nanosUsd(values.reduce((sum, value) => sum + (usdNanos(value) ?? 0n), 0n));
}
export function estimateRequestUsd(usage: MessageUsage, rates?: ModelCost): string | undefined {
  if (!rates) return undefined;
  // Tiered or audio prices need dimensions that a plain token report does not provide.
  if (rates.tiers?.length || rates.inputAudio !== undefined || rates.outputAudio !== undefined) return undefined;
  const input = usage.inputTokens + (usage.cacheReadTokens ?? 0) + (usage.cacheWriteTokens ?? 0);
  const selected = input > 200_000 && rates.contextOver200k ? { ...rates, ...rates.contextOver200k } : rates;
  const terms: Array<[number, number | undefined]> = [
    [usage.inputTokens, selected.input], [usage.outputTokens, selected.output],
    [usage.cacheReadTokens ?? 0, selected.cacheRead ?? selected.input],
    [usage.cacheWriteTokens ?? 0, selected.cacheWrite ?? selected.input],
    [usage.reasoningTokens ?? 0, selected.reasoning ?? selected.output],
  ];
  let total = 0n;
  for (const [tokens, rate] of terms) {
    if (!tokens) continue;
    if (rate === undefined || !Number.isFinite(rate) || rate < 0 || !Number.isSafeInteger(tokens) || tokens < 0) return undefined;
    const units = usdNanos(rate.toFixed(9));
    if (units === undefined) return undefined;
    total += (BigInt(tokens) * units + 500_000n) / 1_000_000n;
  }
  return nanosUsd(total);
}
