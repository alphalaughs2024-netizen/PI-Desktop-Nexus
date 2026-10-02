import type { ProviderPublic } from "@pi-desktop/shared";
import { useProviderAccount } from "../../lib/use-usage-ledger";
import { accountAmount, accountState, formatCount } from "../../lib/usage-view";
import { IconRefresh } from "../icons";

export function ProviderUsage({ provider, compact = false }: { provider: ProviderPublic; compact?: boolean }) {
  const { data, loading, refresh } = useProviderAccount(provider.id);
  const snapshot = data?.snapshot;
  return <section className={`billing-provider${compact ? " is-compact" : ""}`} aria-label={`${provider.name} billing`}>
    <header><div><strong>{provider.name}</strong><small>{snapshot?.scope === "account" ? "Provider account" : "API key"}{snapshot?.plan ? ` · ${snapshot.plan}` : ""}</small></div>
      <span className="billing-state" data-state={snapshot?.state}>{accountState(snapshot)}</span>
      {!compact && <button type="button" className="billing-icon" title="Refresh provider" aria-label={`Refresh ${provider.name}`} disabled={loading} onClick={() => void refresh()}><IconRefresh size={15} /></button>}
    </header>
    <dl className="billing-provider-values">
      {snapshot?.balance && <div><dt>Balance</dt><dd>{accountAmount(snapshot.balance.amount, snapshot.balance.unit)}</dd></div>}
      {snapshot?.spend && <div><dt>Spend · {snapshot.spend.period === "all" ? "all time" : snapshot.spend.period}</dt><dd>{accountAmount(snapshot.spend.amount, snapshot.spend.unit)}</dd></div>}
      {(snapshot?.windows ?? []).slice(0, compact ? 1 : 6).map((w, i) => <div key={i}><dt>{w.kind}{w.remaining !== undefined ? " remaining" : " used"}</dt><dd>{accountAmount(w.remaining !== undefined ? w.remaining : w.used, w.unit)}{w.limit !== undefined ? <small> / {accountAmount(w.limit, w.unit)}</small> : null}</dd>{w.resetsInSec !== undefined && <small>Resets in {Math.ceil(w.resetsInSec / 60)} min</small>}</div>)}
      {!compact && snapshot?.tokens !== undefined && <div><dt>Provider tokens</dt><dd>{formatCount(snapshot.tokens)}</dd></div>}
      {!compact && snapshot?.requests !== undefined && <div><dt>Provider requests</dt><dd>{formatCount(snapshot.requests)}</dd></div>}
      {!compact && snapshot?.freeTokens && <div><dt>Free tokens today</dt><dd>{formatCount(snapshot.freeTokens.usedToday ?? 0)}{snapshot.freeTokens.limitPerDay === null ? " / Unlimited" : snapshot.freeTokens.limitPerDay !== undefined ? ` / ${formatCount(snapshot.freeTokens.limitPerDay)}` : ""}</dd></div>}
    </dl>
    {snapshot?.state === "unsupported" && <p>Local request usage remains available.</p>}
    {snapshot?.updatedAt && <small className="billing-updated">{snapshot.state === "stale" ? "Last updated" : "Updated"} {new Date(snapshot.updatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</small>}
  </section>;
}
