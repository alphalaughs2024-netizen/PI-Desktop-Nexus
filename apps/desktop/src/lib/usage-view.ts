import { sumUsd, type UsageTotals, type ProviderAccountSnapshot } from "@pi-desktop/shared";

export function formatSpend(value?: string): string {
  if (value === undefined) return "—";
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: n > 0 && n < .01 ? 6 : 2 });
}
export function formatCount(value: number): string { return value.toLocaleString("en-US"); }
export function spendTotal(totals?: UsageTotals): string {
  return totals?.pricedRequests ? formatSpend(sumUsd(totals.reportedUsd, totals.estimatedUsd)) : "—";
}
export function coverage(totals?: UsageTotals): string {
  if (!totals) return "Loading usage…";
  if (!totals.pricedRequests) return totals.turnCount ? "No priced requests" : "No usage yet";
  const kind = totals.estimatedRequests > 0 ? totals.reportedRequests > 0 ? "Reported + estimated" : "Estimated" : "Reported";
  return kind + (totals.unknownRequests ? " · partial" : "");
}
export function accountAmount(amount: string | null | undefined, unit: string): string {
  if (amount === null) return "Unlimited";
  if (amount === undefined) return "—";
  return unit.toUpperCase() === "USD" ? formatSpend(amount) : `${Number(amount).toLocaleString("en-US", { maximumFractionDigits: 6 })} ${unit}`;
}
export function accountState(snapshot?: ProviderAccountSnapshot): string {
  if (!snapshot) return "Loading…";
  if (snapshot.state === "ready") return "Updated";
  if (snapshot.state === "stale") return "Last known";
  if (snapshot.state === "unsupported") return "No billing API";
  return snapshot.error === "authentication_failed" ? "Key rejected" : snapshot.error === "missing_key" ? "No saved key" : snapshot.error === "rate_limited" ? "Rate limited" : "Unavailable";
}
