import type { ModelInfo, TokenUsageFacet, TokenUsageHistoryResult } from "./types.js";

export type UsageCostRow = TokenUsageFacet & {
  cost: number | null;
  provenance: "provider_reported" | "provider_generation" | "catalog_estimate" | "unpriced" | "unavailable";
  reportedCost?: string;
};

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
    const model = catalog.find((candidate) => candidate.modelId === facet.id || candidate.displayName === facet.label);
    if (!model?.cost) return { ...facet, cost: null, provenance: "unpriced" as const };
    const cost = model.cost;
    const amount = (
      (facet.inputTokens ?? 0) * (cost.input ?? 0) +
      (facet.outputTokens ?? 0) * (cost.output ?? 0) +
      (facet.cacheReadTokens ?? 0) * (cost.cacheRead ?? 0) +
      (facet.cacheWriteTokens ?? 0) * (cost.cacheWrite ?? 0)
    ) / 1_000_000;
    return { ...facet, cost: amount, provenance: "catalog_estimate" as const };
  });
  return {
    total: rows.reduce((sum, row) => sum + (row.cost ?? 0), 0),
    priced: rows.filter((row) => row.cost != null).length,
    unpriced: rows.filter((row) => row.cost == null).length,
    rows,
  };
}
