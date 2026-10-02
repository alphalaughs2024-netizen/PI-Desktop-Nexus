import { describe, expect, it } from "vitest";
import { nativeContextUsage } from "./usage.js";

describe("native Codex context accounting", () => {
  it("uses last request and counts cache and reasoning subsets only once", () => {
    const result = nativeContextUsage({
      total: { totalTokens: 900000 },
      last: { inputTokens: 11715, cachedInputTokens: 10752, cacheWriteInputTokens: 100, outputTokens: 113, reasoningOutputTokens: 100, totalTokens: 11828 },
      modelContextWindow: 997500,
    });
    expect(result).toEqual({ contextWindow: 997500, usage: {
      inputTokens: 863, cacheReadTokens: 10752, cacheWriteTokens: 100,
      outputTokens: 13, reasoningTokens: 100, totalTokens: 11828,
    } });
    expect(Object.entries(result!.usage).filter(([key]) => key !== "totalTokens").reduce((sum, [, count]) => sum + Number(count), 0)).toBe(11828);
  });
  it.each([null, {}, { last: {} }, { last: { inputTokens: -1, outputTokens: 1, totalTokens: 1 } },
    { last: { inputTokens: 1, outputTokens: 1, totalTokens: NaN } },
    { last: { inputTokens: 1, outputTokens: 1, totalTokens: 2, cachedInputTokens: "1" } }])("does not invent usage from malformed report %j", value => {
    expect(nativeContextUsage(value)).toBeUndefined();
  });
  it("supports older reports without optional subsets or a model window", () => {
    expect(nativeContextUsage({ last: { inputTokens: 80, outputTokens: 20, totalTokens: 100 }, modelContextWindow: null }))
      .toEqual({ usage: { inputTokens: 80, outputTokens: 20, totalTokens: 100, cacheReadTokens: 0, cacheWriteTokens: 0, reasoningTokens: 0 } });
  });
});
