import { expect, it } from "vitest";
import { estimateRequestUsd, sumUsd, usdNanos } from "./usage-ledger.js";

it("sums fractional charges exactly and rejects malformed amounts", () => {
  expect(sumUsd("0.1", "0.2", "0.000000001")).toBe("0.300000001");
  for (const value of ["-1", "NaN", "1e5", "1.0000000001", "12usd"]) expect(usdNanos(value)).toBeUndefined();
});
it("prices exclusive cache and reasoning subsets without double counting", () => {
  expect(estimateRequestUsd({ inputTokens: 100, outputTokens: 40, cacheReadTokens: 80, cacheWriteTokens: 20, reasoningTokens: 60, totalTokens: 300 },
    { input: 2, output: 10, cacheRead: .2, cacheWrite: 4 })).toBe("0.001296000");
});
it("distinguishes missing prices from an explicit free rate and refuses ambiguous tiers", () => {
  const u = { inputTokens: 100, outputTokens: 10, totalTokens: 110 };
  expect(estimateRequestUsd(u, { input: 1 })).toBeUndefined();
  expect(estimateRequestUsd(u, { input: 0, output: 0 })).toBe("0.000000000");
  expect(estimateRequestUsd(u, { input: 1, output: 2, tiers: [{ input: 3 }] })).toBeUndefined();
});
