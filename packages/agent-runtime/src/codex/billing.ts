import { estimateRequestUsd, nanosUsd, usdNanos, type MessageUsage, type UsageRequest } from "@pi-desktop/shared";
import type { RuntimeProviderConfig } from "../provider-binding.js";

export type WireUsage = { id: string; responseId?: string; occurredAt: number; kind: UsageRequest["kind"]; outcome: UsageRequest["outcome"]; usage?: MessageUsage; amountUsd?: string };
const token = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
export function responseUsage(response: any, provider: RuntimeProviderConfig): Pick<WireUsage, "usage" | "amountUsd" | "responseId"> {
  const u = response?.usage;
  const responseId = typeof response?.id === "string" ? response.id.slice(0, 512) : undefined;
  if (!u || !token(u.input_tokens) || !token(u.output_tokens)) return { responseId };
  const cached = u.input_tokens_details?.cached_tokens ?? u.prompt_tokens_details?.cached_tokens ?? 0;
  const written = u.input_tokens_details?.cache_write_tokens ?? 0;
  const reasoning = u.output_tokens_details?.reasoning_tokens ?? 0;
  if (![cached, written, reasoning].every(token) || cached + written > u.input_tokens || reasoning > u.output_tokens) return { responseId };
  const total = u.total_tokens ?? u.input_tokens + u.output_tokens;
  if (!token(total)) return { responseId };
  const usage: MessageUsage = { inputTokens: u.input_tokens - cached - written, outputTokens: u.output_tokens - reasoning,
    cacheReadTokens: cached, cacheWriteTokens: written, reasoningTokens: reasoning, totalTokens: total };
  let openrouter = false;
  try { openrouter = new URL(provider.baseUrl!).hostname === "openrouter.ai"; } catch { /* custom endpoint */ }
  const amount = u.cost?.amount_usd ?? u.cost_usd ?? (openrouter || u.currency === "USD" ? u.cost : undefined);
  const parsed = typeof amount === "string" ? usdNanos(amount) : undefined;
  const amountUsd = parsed !== undefined ? nanosUsd(parsed) : typeof amount === "number" && Number.isFinite(amount) && amount >= 0 && amount < 1e15 ? amount.toFixed(9) : undefined;
  return { responseId, usage, amountUsd };
}
export async function priceWireUsage(wire: WireUsage, provider: RuntimeProviderConfig): Promise<Pick<UsageRequest,"amountUsd"|"provenance">> {
  if (wire.amountUsd !== undefined) return { amountUsd: wire.amountUsd, provenance: "provider_reported" };
  // Generation charges are request scoped. Never substitute key/account spend deltas.
  if (wire.responseId?.startsWith("gen-") && new URL(provider.baseUrl!).hostname === "openrouter.ai") {
    try {
      const response = await fetch(`${provider.baseUrl!.replace(/\/$/, "")}/generation?id=${encodeURIComponent(wire.responseId)}`, {
        headers: { ...provider.headers, Authorization: `Bearer ${provider.apiKey}` }, redirect: "error", signal: AbortSignal.timeout(3000),
      });
      if (response.ok) {
        const data = (await response.json() as any)?.data;
        if (data?.id === wire.responseId && typeof data.total_cost === "number" && Number.isFinite(data.total_cost) && data.total_cost >= 0 && data.total_cost < 1e15)
          return { amountUsd: data.total_cost.toFixed(9), provenance: "provider_generation" };
      }
    } catch { /* Preserve the reported tokens and explicitly labelled fallback. */ }
  }
  const amountUsd = wire.usage ? estimateRequestUsd(wire.usage, provider.billingRates ?? (provider.modelConfig?.source === "models.dev" ? provider.modelConfig.cost : undefined)) : undefined;
  return { amountUsd, provenance: amountUsd === undefined ? wire.usage ? "unpriced" : "unavailable" : provider.billingRates ? "provider_estimate" : "catalog_estimate" };
}
