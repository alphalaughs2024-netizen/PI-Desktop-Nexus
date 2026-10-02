import { useMemo, useState } from "react";
import { sumUsd, type UsageGroup, type UsageTotals } from "@pi-desktop/shared";
import { useAppStore } from "../../stores/app-store";
import { useUsageLedger } from "../../lib/use-usage-ledger";
import { coverage, formatCount, formatSpend, spendTotal } from "../../lib/usage-view";
import { ProviderUsage } from "../usage/ProviderUsage";
import { IconRefresh, IconSearch } from "../icons";

const ranges = ["7d", "30d", "90d", "all"] as const;
type Range = typeof ranges[number];
const provenance = { provider_reported: "Provider reported", provider_generation: "Provider reconciled", provider_estimate: "Provider price estimate", catalog_estimate: "Catalog estimate", unpriced: "Unpriced", unavailable: "Usage unavailable" };

function CostSource({ totals }: { totals: UsageTotals }) {
  return <span className="billing-source">{coverage(totals)}{totals.unknownRequests ? <small>{formatCount(totals.unknownRequests)} unpriced</small> : null}</span>;
}
export function UsagePage() {
  const providers = useAppStore(s => s.providers);
  const [range, setRange] = useState<Range>("30d");
  const [providerId, setProviderId] = useState("");
  const [modelId, setModelId] = useState("");
  const [query, setQuery] = useState("");
  const [view, setView] = useState<"sessions" | "models" | "requests">("sessions");
  const [metric, setMetric] = useState<"spend" | "tokens">("spend");
  const startDate = useMemo(() => range === "all" ? undefined : Date.now() - Number(range.slice(0,-1)) * 86_400_000, [range]);
  const { data, loading, error, refresh } = useUsageLedger({ startDate, ...(providerId ? { providerId } : {}), ...(modelId ? { modelId } : {}) });
  const totals = data?.totals;
  const providerName = (id?: string) => providers.find(p => p.id === id)?.name ?? id ?? "Unknown provider";
  const groups: UsageGroup[] = (data?.[view === "models" ? "models" : "sessions"] ?? []).filter(g => `${g.label} ${providerName(g.providerId)}`.toLowerCase().includes(query.toLowerCase()));
  const days = data?.days ?? [];
  const dayValue = (day: UsageGroup) => metric === "tokens" ? day.totalTokens : Number(sumUsd(day.reportedUsd, day.estimatedUsd));
  const max = Math.max(1e-9, ...days.map(dayValue));
  const requests = (data?.requests ?? []).filter(r => `${r.modelId} ${providerName(r.providerId)} ${r.agentName ?? ""}`.toLowerCase().includes(query.toLowerCase()));
  return <div className="settings-stack usage-page billing-dashboard" aria-busy={loading}>
    <div className="billing-toolbar">
      <div className="billing-segments" role="group" aria-label="Usage range">{ranges.map(value => <button key={value} type="button" aria-pressed={range === value} onClick={() => setRange(value)}>{value === "all" ? "All time" : value.toUpperCase()}</button>)}</div>
      <label><span className="sr-only">Provider</span><select value={providerId} onChange={e => { setProviderId(e.target.value); setModelId(""); }}><option value="">All providers</option>{providers.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
      <label><span className="sr-only">Model</span><select value={modelId} onChange={e => setModelId(e.target.value)}><option value="">All models</option>{[...new Set((data?.models ?? []).map(m => m.modelId))].filter(Boolean).map(id => <option key={id} value={id}>{id}</option>)}</select></label>
      <button type="button" className="billing-icon" title="Refresh usage" aria-label="Refresh usage" onClick={() => void refresh()} disabled={loading}><IconRefresh size={17} /></button>
    </div>
    {error && <div className="billing-error" role="status">Usage refresh failed. <button type="button" onClick={() => void refresh()}>Retry</button></div>}
    <section className="billing-summary" aria-label="Nexus usage summary">
      <div className="billing-summary-spend"><span>Nexus spend</span><strong>{spendTotal(totals)}</strong><small>{coverage(totals)}</small></div>
      <div><span>Tokens</span><strong>{totals ? formatCount(totals.totalTokens) : "—"}</strong><small>{data?.sessions.length ?? 0} chats</small></div>
      <div><span>Turns</span><strong>{totals ? formatCount(totals.turnCount) : "—"}</strong><small>{totals ? formatCount(totals.requestCount) : "—"} model requests</small></div>
      <div><span>Reported / estimated</span><strong className="billing-summary-split">{totals?.pricedRequests ? `${formatSpend(totals.reportedUsd)} / ${formatSpend(totals.estimatedUsd)}` : "—"}</strong><small>{totals?.unknownRequests ? `${formatCount(totals.unknownRequests)} requests or older turns unpriced` : "Request-level accounting"}</small></div>
    </section>
    <section className="billing-activity" aria-label="Daily usage">
      <header><h3>Activity</h3><div className="billing-segments" role="group" aria-label="Chart metric"><button type="button" aria-pressed={metric === "spend"} onClick={() => setMetric("spend")}>Spend</button><button type="button" aria-pressed={metric === "tokens"} onClick={() => setMetric("tokens")}>Tokens</button></div></header>
      {days.length ? <div className="billing-chart" role="img" aria-label={`Daily ${metric}; ${days.length} active days`}>
        {days.map(day => { const value = dayValue(day); const estimated = Number(day.estimatedUsd); const known = Number(sumUsd(day.reportedUsd, day.estimatedUsd));
          return <div key={day.id} className="billing-chart-slot" title={`${day.label}: ${metric === "tokens" ? formatCount(day.totalTokens) + " tokens" : spendTotal(day)} · ${coverage(day)}`}><div className="billing-chart-bar" style={{ height: `${Math.max(value ? 3 : 0, value / max * 100)}%` }}>{metric === "spend" && known > 0 && <i style={{ height: `${estimated / known * 100}%` }} />}</div></div>;
        })}
      </div> : <div className="billing-empty">{loading ? "Loading activity…" : "No usage in this range"}</div>}
      <footer><span>{days[0]?.label}</span>{metric === "spend" && <span className="billing-legend"><i /> Reported <i className="is-estimate" /> Estimated</span>}<span>{days.at(-1)?.label}</span></footer>
    </section>
    {totals && totals.totalTokens > 0 && <dl className="billing-token-breakdown">{([
      ["Input", totals.inputTokens], ["Output", totals.outputTokens], ["Cache read", totals.cacheReadTokens], ["Cache write", totals.cacheWriteTokens], ["Reasoning", totals.reasoningTokens],
    ] as const).map(([label,value]) => <div key={label}><dt>{label}</dt><dd>{formatCount(value)}</dd></div>)}</dl>}
    <section className="billing-details">
      <header><div className="billing-segments" role="group" aria-label="Usage breakdown">{(["sessions", "models", "requests"] as const).map(value => <button type="button" key={value} aria-pressed={view === value} onClick={() => setView(value)}>{value === "sessions" ? "Chats" : value === "models" ? "Models" : "Recent requests"}</button>)}</div>
        <label className="billing-search"><IconSearch size={15} /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search" aria-label="Search usage rows" /></label></header>
      <div className="billing-table-scroll"><table className="billing-table"><thead><tr><th>{view === "sessions" ? "Chat" : "Model / provider"}</th><th>{view === "requests" ? "Agent" : "Turns"}</th><th>Tokens</th><th>Spend</th><th>Source</th></tr></thead><tbody>
        {view === "requests" ? requests.map(r => <tr key={r.id}><td><strong>{r.modelId}</strong><small>{providerName(r.providerId)} · {r.kind} · {r.outcome}</small></td><td>{r.agentName ?? "Parent"}</td><td>{r.usage ? formatCount(r.usage.totalTokens) : "—"}</td><td>{formatSpend(r.amountUsd)}</td><td><span className="billing-source">{provenance[r.provenance]}</span></td></tr>)
          : groups.map(g => <tr key={g.id}><td>{view === "sessions" ? <button type="button" className="billing-chat-link" onClick={() => void useAppStore.getState().selectSession(g.id)}>{g.label}</button> : <strong>{g.label}</strong>}{view === "models" && <small>{providerName(g.providerId)}</small>}</td><td>{formatCount(g.turnCount)}</td><td>{formatCount(g.totalTokens)}</td><td>{spendTotal(g)}</td><td><CostSource totals={g} /></td></tr>)}
        {!(view === "requests" ? requests.length : groups.length) && <tr><td colSpan={5} className="billing-empty">{loading ? "Loading…" : "No matching usage"}</td></tr>}
      </tbody></table></div>
      {view === "requests" && <small className="billing-note">Latest 200 requests. Totals include the full selected range.</small>}
      {!!totals?.legacyTurns && <p className="billing-note">{formatCount(totals.legacyTurns)} older turns have no request ledger. Stored tokens are retained; missing charges cannot be reconstructed.</p>}
    </section>
    <section className="billing-accounts"><header><h3>Provider balances &amp; limits</h3><small>Separate from Nexus spend</small></header><div className="billing-provider-list">{providers.filter(p => p.enabled).map(p => <ProviderUsage key={p.id} provider={p} />)}{!providers.some(p => p.enabled) && <p className="billing-empty">No enabled providers</p>}</div><p className="billing-note">Provider totals can include other apps. Estimates use provider prices when available, then catalog rates.</p></section>
  </div>;
}
