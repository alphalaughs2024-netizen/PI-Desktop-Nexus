import { describe, expect, it } from "vitest";
import { estimateUsageCost } from "./usage-cost.js";
import type { ModelInfo, TokenUsageHistoryResult } from "./types.js";

const history = (models: TokenUsageHistoryResult["facets"]["models"]): TokenUsageHistoryResult => ({
  bucket: "month", rangeStart: 0, rangeEnd: 1, items: [],
  totals: { inputTokens: 1000, outputTokens: 500, totalTokens: 1500, cacheReadTokens: 0, cacheWriteTokens: 0, reasoningTokens: 0, turnCount: 1 },
  facets: { models, providers: [], sources: [], sessions: [] },
  insights: { streak: { current: 0, longest: 0 }, nextMilestone: { value: 1, remaining: 0 } },
});

const model = (cost?: ModelInfo["cost"]): ModelInfo => ({ modelId: "xkiro-model", displayName: "XKIRO", providerId: "xkiro", cost, capabilities: ["text"], source: "bundled" });

describe("estimateUsageCost", () => {
  it("prices normalized token facets and includes cache rates", () => {
    const result = estimateUsageCost(history([{ id: "xkiro-model", label: "XKIRO", turnCount: 1, totalTokens: 1500, inputTokens: 1000, outputTokens: 500, cacheReadTokens: 200, cacheWriteTokens: 100 }]), [model({ input: 1, output: 2, cacheRead: 0.5, cacheWrite: 3 })]);
    expect(result.total).toBeCloseTo(0.0028);
    expect(result.priced).toBe(1);
  });

  it("marks models without catalog prices as unpriced", () => {
    const result = estimateUsageCost(history([{ id: "missing", label: "Missing", turnCount: 1, totalTokens: 1 }]), [model()]);
    expect(result.total).toBe(0);
    expect(result.unpriced).toBe(1);
    expect(result.rows[0].provenance).toBe("unpriced");
  });
});
