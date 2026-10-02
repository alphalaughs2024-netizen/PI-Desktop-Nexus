import { createHash } from "node:crypto";
import type { ModelCost, ProviderPublic, ProviderAccountSnapshot, ProviderAccountResult } from "@pi-desktop/shared";

type Input = { providerId: string; baseUrl: string; apiKey: string; headers?: Record<string, string> };
type Fetcher = typeof fetch;
class BillingError extends Error {
  constructor(readonly code: NonNullable<ProviderAccountSnapshot["error"]>) { super(code); }
}
const decimal = (value: unknown): string | undefined => {
  if (typeof value === "string" && /^\d+(?:\.\d+)?$/.test(value) && value.length <= 40) return value;
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value < 1e21 ? String(value) : undefined;
};
const count = (value: unknown): number | undefined => typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : undefined;
const text = (value: unknown): string | undefined => typeof value === "string" && value.length <= 128 ? value : undefined;
function endpoint(input: Input, path: string): string {
  const url = new URL(input.baseUrl);
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new BillingError("invalid_response");
  return input.baseUrl.replace(/\/+$/, "") + path;
}
export function billingProvider(baseUrl?: string): "openrouter" | "wikivibe" | "xkiro" | "unsupported" {
  try {
    const url = new URL(baseUrl ?? "");
    if (url.protocol !== "https:") return "unsupported";
    if (url.hostname === "openrouter.ai" && url.pathname.replace(/\/$/, "") === "/api/v1") return "openrouter";
    if (url.hostname === "api.wikivibe.ru" && url.pathname.replace(/\/$/, "") === "/v1") return "wikivibe";
    if (url.hostname === "api.xkiro.com" && url.pathname.replace(/\/$/, "") === "/v1") return "xkiro";
  } catch { /* Unsupported endpoints still have local request accounting. */ }
  return "unsupported";
}
async function jsonFetch(input: Input, path: string, fetcher: Fetcher, timeout = 8000): Promise<any> {
  if (!input.apiKey) throw new BillingError("missing_key");
  const response = await fetcher(endpoint(input, path), { headers: { ...input.headers, Authorization: `Bearer ${input.apiKey}`, Accept: "application/json" },
    redirect: "error", signal: AbortSignal.timeout(timeout) });
  if (!response.ok) throw new BillingError(response.status === 401 || response.status === 403 ? "authentication_failed" : response.status === 429 ? "rate_limited" : response.status === 404 || response.status === 405 ? "unsupported" : "refresh_failed");
  if (!response.body) throw new BillingError("invalid_response");
  const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let size = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read(); if (done) break;
      size += value.length; if (size > 2 * 1024 * 1024) throw new BillingError("invalid_response"); chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } finally { await reader.cancel().catch(() => {}); }
}

export async function fetchProviderAccount(input: Input, period: "day" | "week" | "month", fetcher: Fetcher = fetch): Promise<ProviderAccountResult> {
  let vendor = billingProvider(input.baseUrl);
  let scope: ProviderAccountSnapshot["scope"] = vendor === "xkiro" ? "account" : "key";
  const unavailable = (error: ProviderAccountSnapshot["error"]): ProviderAccountResult => ({ snapshot: { provider: input.providerId, scope, state: error === "unsupported" ? "unsupported" : "unavailable", error } });
  try {
    const data = await jsonFetch(input, vendor === "openrouter" ? "/key" : vendor === "wikivibe" ? `/usage?days=${period === "day" ? 1 : period === "week" ? 7 : 30}` : "/usage", fetcher);
    // Self-hosted endpoints can expose the same documented usage schemas.
    if (vendor === "unsupported") {
      if (data.usage?.total && (data.billing || data.quota)) vendor = "wikivibe";
      else if (data.wallet?.balance_usd !== undefined && Array.isArray(data.windows)) { vendor = "xkiro"; scope = "account"; }
      else return unavailable("unsupported");
    }
    const snapshot: ProviderAccountSnapshot = { provider: input.providerId, scope, state: "ready", updatedAt: Date.now(), staleAt: Date.now() + 60_000 };
    let history: ProviderAccountResult["history"];
    if (vendor === "openrouter") {
      const d = data.data;
      if (!d || decimal(d.usage) === undefined) throw new BillingError("invalid_response");
      snapshot.spend = { amount: decimal(d.usage)!, unit: "USD", period: "all" };
      snapshot.windows = [{ kind: "Key limit", used: decimal(d.usage), limit: d.limit === null ? null : decimal(d.limit), remaining: d.limit_remaining === null ? null : decimal(d.limit_remaining), unit: "USD" },
        ...(["daily", "weekly", "monthly"] as const).flatMap((kind) => decimal(d[`usage_${kind}`]) !== undefined ? [{ kind, used: decimal(d[`usage_${kind}`]), unit: "USD" }] : [])];
      if (decimal(d.byok_usage) !== undefined) snapshot.windows.push({ kind: "BYOK inference", used: decimal(d.byok_usage), unit: "USD" });
    } else if (vendor === "wikivibe") {
      const total = data.usage?.total; const today = data.usage?.today;
      if (!total && !data.billing && !data.quota) throw new BillingError("invalid_response");
      const unit = text(data.billing?.unit) ?? text(data.unit) ?? text(data.quota?.unit) ?? "provider units";
      const spend = decimal(total?.actual_cost) ?? decimal(total?.cost);
      if (spend !== undefined) snapshot.spend = { amount: spend, unit, period: "all" };
      snapshot.tokens = count(total?.total_tokens); snapshot.requests = count(total?.requests);
      const balance = decimal(data.billing?.balance) ?? decimal(data.balance);
      if (balance !== undefined) snapshot.balance = { amount: balance, unit };
      snapshot.plan = text(data.billing?.mode);
      snapshot.windows = [{ kind: "Quota", used: decimal(data.quota?.used), limit: data.quota?.limit === null ? null : decimal(data.quota?.limit), remaining: decimal(data.billing?.remaining) ?? decimal(data.remaining) ?? decimal(data.quota?.remaining), unit },
        { kind: "Today", used: decimal(today?.actual_cost) ?? decimal(today?.cost), unit }].filter(w => w.used !== undefined || w.limit !== undefined || w.remaining !== undefined);
      const points = Array.isArray(data.daily_usage) ? data.daily_usage.flatMap((p: any) => {
        const timestamp = Date.parse(p.date ?? p.day ?? "");
        return Number.isFinite(timestamp) ? [{ timestamp, requests: count(p.requests), tokens: count(p.total_tokens), spend: decimal(p.actual_cost) ?? decimal(p.cost) }] : [];
      }) : [];
      history = { provider: input.providerId, scope, period, unit, points, total: { requests: snapshot.requests, tokens: snapshot.tokens, spend } };
    } else {
      if (!data.wallet && !Array.isArray(data.windows)) throw new BillingError("invalid_response");
      snapshot.plan = text(data.plan);
      const balance = decimal(data.wallet?.balance_usd);
      if (balance !== undefined) snapshot.balance = { amount: balance, unit: "USD" };
      snapshot.windows = (Array.isArray(data.windows) ? data.windows : []).map((w: any) => ({ kind: text(w.kind) ?? "Window", used: decimal(w.spent_usd), limit: decimal(w.cap_usd), remaining: decimal(w.remaining_usd), unit: "USD", resetsInSec: count(w.resets_in_sec) }));
      if (data.free_tokens) snapshot.freeTokens = { usedToday: count(data.free_tokens.used_today), limitPerDay: data.free_tokens.limit_per_day === null ? null : count(data.free_tokens.limit_per_day), remaining: data.free_tokens.remaining === null ? null : count(data.free_tokens.remaining) };
      try {
        const h = await jsonFetch(input, `/usage/history?period=${period}`, fetcher);
        if (h.total) {
          snapshot.spend = decimal(h.total.spend_usd) === undefined ? undefined : { amount: decimal(h.total.spend_usd)!, unit: "USD", period };
          snapshot.tokens = count(h.total.tokens); snapshot.requests = count(h.total.requests);
          history = { provider: input.providerId, scope, period, unit: "USD", total: { requests: snapshot.requests, tokens: snapshot.tokens, spend: decimal(h.total.spend_usd) },
            points: (Array.isArray(h.points) ? h.points : []).flatMap((p: any) => Number.isFinite(Date.parse(p.ts)) ? [{ timestamp: Date.parse(p.ts), requests: count(p.requests), tokens: count(p.tokens), spend: decimal(p.spend_usd) }] : []) };
        }
      } catch { /* A history failure does not erase a valid wallet snapshot. */ }
    }
    return { snapshot, history };
  } catch (error) { return unavailable(error instanceof BillingError ? error.code : "refresh_failed"); }
}

export function parseProviderPrices(data: any, vendor: ReturnType<typeof billingProvider>): Record<string, ModelCost> {
  const result: Record<string, ModelCost> = {};
  if (!Array.isArray(data?.data)) return result;
  const rate = (v: unknown, multiplier = 1) => { const value = decimal(v); return value === undefined || !Number.isFinite(Number(value) * multiplier) ? undefined : Number(value) * multiplier; };
  for (const model of data.data) {
    if (typeof model.id !== "string" || model.id.length > 512 || !model.pricing) continue;
    const p = model.pricing;
    if (vendor === "openrouter") {
      if ([p.request, p.image, p.audio, p.web_search].some(v => Number(v) > 0)) continue;
      const input = rate(p.prompt, 1e6); const output = rate(p.completion, 1e6);
      if (input !== undefined && output !== undefined) result[model.id] = { input, output, cacheRead: rate(p.input_cache_read, 1e6), cacheWrite: rate(p.input_cache_write, 1e6) };
    } else if (p.currency === "USD" && p.unit === "per_1m_tokens") {
      const input = rate(p.input); const output = rate(p.output);
      if (input !== undefined && output !== undefined) result[model.id] = { input, output, cacheRead: rate(p.cache_read), cacheWrite: rate(p.cache_write), reasoning: rate(p.reasoning) };
    }
  }
  return result;
}

/** Keys and destinations are resolved only from the saved host record. */
export class ProviderBillingService {
  private accounts = new Map<string, { expires: number; value?: ProviderAccountResult; pending?: Promise<ProviderAccountResult> }>();
  private prices = new Map<string, { expires: number; value: Promise<Record<string, ModelCost>> }>();
  constructor(private host: { call<T>(method: string, input: unknown): Promise<T> }, private fetcher: Fetcher = fetch) {}
  private async input(providerId: string): Promise<Input> {
    if (typeof providerId !== "string" || !providerId.trim() || providerId.length > 512) throw new BillingError("invalid_response");
    const { provider } = await this.host.call<{ provider?: ProviderPublic }>("providers.get", { id: providerId });
    if (!provider || !provider.enabled || !provider.baseUrl) throw new BillingError("unsupported");
    const secret = await this.host.call<{ value?: string }>("providers.getSecret", { id: providerId });
    return { providerId, baseUrl: provider.baseUrl, headers: provider.headers, apiKey: secret.value ?? "" };
  }
  private key(input: Input): string { return createHash("sha256").update(JSON.stringify(input)).digest("hex"); }
  async account(providerId: string, period: "day" | "week" | "month" = "month"): Promise<ProviderAccountResult> {
    const input = await this.input(providerId); const key = `${this.key(input)}:${period}`;
    const cache = this.accounts.get(key);
    if (cache?.pending) return cache.pending;
    if (cache?.value && cache.expires > Date.now()) return cache.value;
    const entry = { expires: Date.now() + 60_000, value: cache?.value, pending: undefined as Promise<ProviderAccountResult> | undefined };
    entry.pending = fetchProviderAccount(input, period, this.fetcher).then(value => {
      if (value.snapshot.state === "unavailable" && cache?.value?.snapshot.state === "ready") value = { ...cache.value, snapshot: { ...cache.value.snapshot, state: "stale", error: value.snapshot.error } };
      entry.value = value; entry.expires = Date.now() + 60_000; entry.pending = undefined; return value;
    });
    if (this.accounts.size > 100) this.accounts.clear();
    this.accounts.set(key, entry); return entry.pending;
  }
  async rates(providerId: string, modelId: string): Promise<ModelCost | undefined> {
    try {
      const input = await this.input(providerId); const key = this.key(input); const cache = this.prices.get(key);
      if (cache && cache.expires > Date.now()) return (await cache.value)[modelId];
      const value = jsonFetch(input, "/models", this.fetcher, 3000).then(data => parseProviderPrices(data, billingProvider(input.baseUrl))).catch((): Record<string, ModelCost> => ({}));
      if (this.prices.size > 100) this.prices.clear();
      this.prices.set(key, { expires: Date.now() + 10 * 60_000, value }); return (await value)[modelId];
    } catch { return undefined; }
  }
}
