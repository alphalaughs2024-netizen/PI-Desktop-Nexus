import type { ModelInfo, TokenUsageFacet, TokenUsageHistoryResult } from "./types.js";
import { estimateRequestUsd } from "./usage-ledger.js";

export type UsageCostRow = TokenUsageFacet & {
  cost: number | null;
  provenance: "provider_reported" | "provider_generation" | "catalog_estimate" | "unpriced" | "unavailable";
  reportedCost?: string;
};
export type UsageCostRowView = UsageCostRow & { providerLabel: string; vendorKey?: string; baseUrl?: string; modelLabel: string; pricedSpendPercent?: number; statusLabel: string };

export type UsageCostEstimate = {
  total: number;
  priced: number;
  unpriced: number;
  rows: UsageCostRow[];
};

/** Calculate a display estimate from normalized token history and catalog pricing. */
export function estimateUsageCost(
  history: TokenUsageHistoryResult,
  models: Record<string, ModelInfo[]> | ModelInfo[],
): UsageCostEstimate {
  const catalog = Array.isArray(models) ? models : Object.values(models).flat();
  const rows = history.facets.models.map((facet) => {
    const candidates = catalog.filter(candidate => (candidate.modelId === facet.id || candidate.displayName === facet.label) && (!facet.providerId || candidate.providerId === facet.providerId));
    const model = candidates.length === 1 ? candidates[0] : undefined;
    if (!model?.cost || facet.inputTokens === undefined || facet.outputTokens === undefined || facet.totalTokens === 0)
      return { ...facet, cost: null, provenance: "unpriced" as const };
    const amount = estimateRequestUsd({ ...facet, inputTokens: facet.inputTokens, outputTokens: facet.outputTokens }, model.cost);
    return { ...facet, cost: amount === undefined ? null : Number(amount), provenance: amount === undefined ? "unpriced" as const : "catalog_estimate" as const };
  });
  return {
    total: rows.reduce((sum, row) => sum + (row.cost ?? 0), 0),
    priced: rows.filter((row) => row.cost != null).length,
    unpriced: rows.filter((row) => row.cost == null).length,
    rows,
  };
}
