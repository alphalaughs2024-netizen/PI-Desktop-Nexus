import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { estimateUsageCost, type TokenUsageHistoryResult } from "@pi-desktop/shared";
import { api } from "../../lib/api";
import { useAppStore } from "../../stores/app-store";
import { Button, Select } from "../ui";

type Bucket = TokenUsageHistoryResult["bucket"];

const EMPTY_TOTALS = {
  inputTokens: 0,
  outputTokens: 0,
  totalTokens: 0,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
  reasoningTokens: 0,
  turnCount: 0,
};

function formatTokens(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return String(value);
}

function formatFullTokens(value: number): string {
  return Math.round(value).toLocaleString("en-US");
}

type Range = "7d" | "30d" | "90d" | "1y" | "all";
const RANGE_DAYS: Record<Exclude<Range, "all">, number> = { "7d": 7, "30d": 30, "90d": 90, "1y": 365 };

function heatLevel(value: number, max: number): number {
  if (!value) return 0;
  if (value >= max * 0.75) return 4;
  if (value >= max * 0.5) return 3;
  if (value >= max * 0.25) return 2;
  return 1;
}

export function UsagePage() {
  const { t, i18n } = useTranslation();
  const providerModels = useAppStore((state) => state.providerModels);
  const configuredProviders = useAppStore((state) => state.providers ?? []);
  const [bucket, setBucket] = useState<Bucket>("day");
  const [range, setRange] = useState<Range>("30d");
  const [source, setSource] = useState("");
  const [model, setModel] = useState("");
  const [provider, setProvider] = useState("");
  const [query, setQuery] = useState("");
  const [history, setHistory] = useState<TokenUsageHistoryResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = async (nextBucket = bucket) => {
    setLoading(true);
    setError(false);
    try {
      setHistory(await api.getTokenUsageHistory({
        bucket: nextBucket,
        ...(range === "all" ? {} : { startDate: Date.now() - RANGE_DAYS[range] * 86_400_000 }),
        endDate: Date.now(),
        sources: source ? [source] : [],
        models: model ? [model] : [],
        providers: provider ? [provider] : [],
        query,
      }));
    } catch {
      setHistory(null);
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), query ? 240 : 0);
    return () => window.clearTimeout(timer);
  }, [bucket, range, source, model, provider, query]);

  const totals = history?.totals ?? EMPTY_TOTALS;
  const maxTotal = useMemo(
    () => Math.max(1, ...(history?.items ?? []).map((item) => item.totalTokens)),
    [history],
  );
  const heatItems = useMemo(() => {
    const items = history?.items ?? [];
    const max = Math.max(1, ...items.map((item) => item.totalTokens));
    const byDate = new Map(items.map((item) => [item.date, item]));
    const days = Array.from({ length: 371 }, (_, index) => {
      const date = new Date(Date.now() - (370 - index) * 86_400_000);
      const dateKey = date.toISOString().slice(0, 10);
      const item = byDate.get(dateKey);
      return item ?? { date: dateKey, timestamp: date.getTime(), inputTokens: 0, outputTokens: 0, totalTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, reasoningTokens: 0, turnCount: 0 };
    });
    return days.map((item) => ({ ...item, level: heatLevel(item.totalTokens, max) }));
  }, [history]);
  const latest = history?.items.at(-1);
  const facets = history?.facets ?? { sources: [], models: [], providers: [], sessions: [] };
  const activeDays = (history?.items ?? []).filter((item) => item.turnCount > 0).length;
  const costEstimate = useMemo(() => {
    const estimate = history ? estimateUsageCost(history, providerModels) : { total: 0, priced: 0, unpriced: 0, rows: [] };
    return { ...estimate, models: facets.models.length };
  }, [history, facets.models.length, providerModels]);
  const insights = history?.insights;
  const locale = i18n.resolvedLanguage ?? i18n.language;
  const peakHour = insights?.peakHour == null ? null : new Intl.DateTimeFormat(locale, { hour: "numeric" }).format(new Date(2026, 0, 1, insights.peakHour));
  const milestoneProgress = insights ? Math.min(100, Math.max(0, ((insights.nextMilestone.value - insights.nextMilestone.remaining) / insights.nextMilestone.value) * 100)) : 0;
  const clearFilters = () => { setRange("30d"); setSource(""); setModel(""); setProvider(""); setQuery(""); };

  return (
    <div className="settings-stack usage-page">
      <div className="usage-dashboard-toolbar">
        <div className="usage-plugin-filters" role="group" aria-label={t("settings.usageFilters")}>
          <div className="usage-range-pills" role="group" aria-label={t("settings.usageRange")}>{(["7d", "30d", "90d", "1y", "all"] as Range[]).map((value) => <button aria-pressed={range === value} className={range === value ? "active" : ""} key={value} type="button" onClick={() => setRange(value)}>{value.toUpperCase()}</button>)}</div>
          <label className="usage-filter-control"><span className="sr-only">{t("settings.usageAllTools")}</span><select value={source} onChange={(event) => setSource(event.target.value)}><option value="">{t("settings.usageAllTools")}</option>{facets.sources.map((item) => <option value={item.id} key={item.id}>{item.label}</option>)}</select></label>
          <label className="usage-filter-control"><span className="sr-only">{t("settings.usageAllModels")}</span><select value={model} onChange={(event) => setModel(event.target.value)}><option value="">{t("settings.usageAllModels")}</option>{facets.models.map((item) => <option value={item.id} key={item.id}>{item.label}</option>)}</select></label>
          <label className="usage-filter-control"><span className="sr-only">{t("settings.usageAllProviders")}</span><select value={provider} onChange={(event) => setProvider(event.target.value)}><option value="">{t("settings.usageAllProviders")}</option>{facets.providers.map((item) => <option value={item.id} key={item.id}>{item.label}</option>)}</select></label>
          <label className="usage-filter-search"><span aria-hidden="true">⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("settings.usageFilterPlaceholder")} aria-label={t("settings.usageFilterPlaceholder")} /></label>
          {(range !== "30d" || source || model || provider || query) ? <button className="usage-clear-filters" type="button" onClick={clearFilters}>{t("settings.usageClearFilters")}</button> : null}
        </div>
      </div>
      <div className="usage-hero">
        <div>
          <div className="usage-hero-top"><p className="usage-hero-greeting">{t("settings.usageGreeting")}</p><div className="usage-hero-badges">
            <span>{t("settings.usageStreak", { current: insights?.streak.current ?? 0 })} <strong>{t("settings.usageLongest", { longest: insights?.streak.longest ?? 0 })}</strong></span>
            {insights?.milestone ? <span>{t("settings.usageMilestoneReached", { value: formatTokens(insights.milestone.value), date: new Date(insights.milestone.reachedAt).toLocaleDateString(locale, { month: "short", day: "numeric" }) })}</span> : null}
          </div></div>
          <output className="usage-hero-title" aria-label={t("settings.usageTotal")} data-value={totals.totalTokens}>{formatFullTokens(totals.totalTokens)}</output>
          <p className="usage-hero-stats">{t("settings.usageHeroStats", { turns: totals.turnCount, sessions: facets.sessions.length, days: activeDays })}</p>
          {insights?.bestDay && peakHour ? <p className="usage-hero-note">{t("settings.usageBestDay", { date: new Date(insights.bestDay.timestamp).toLocaleDateString(locale, { month: "short", day: "numeric", year: "numeric" }), tokens: formatTokens(insights.bestDay.totalTokens), hour: peakHour })}</p> : <p className="usage-hero-note">{t("settings.usageDescription")}</p>}
          <div className="usage-hero-sparkline" aria-hidden="true">{(history?.items ?? []).slice(-18).map((item) => <i key={item.date} style={{ height: `${Math.max(3, (item.totalTokens / maxTotal) * 100)}%` }} />)}</div>
          {insights ? <div className="usage-milestone"><div><span>{t("settings.usageNextMilestone", { value: formatTokens(insights.nextMilestone.value) })}</span><span>{t("settings.usageMilestoneRemaining", { value: formatTokens(insights.nextMilestone.remaining) })}</span></div><span className="usage-milestone-track"><i style={{ width: `${milestoneProgress}%` }} /></span></div> : null}
        </div>
        <div className="usage-toolbar-actions">
          <Select aria-label={t("settings.usageRange")} value={bucket} onChange={(event) => setBucket(event.target.value as Bucket)}>
            <option value="day">{t("settings.usageDaily")}</option>
            <option value="week">{t("settings.usageWeekly")}</option>
            <option value="month">{t("settings.usageMonthly")}</option>
          </Select>
          <Button variant="secondary" size="sm" onClick={() => void load()} disabled={loading}>{t("settings.refresh")}</Button>
        </div>
      </div>
      <section className="usage-dashboard-section usage-local-overview"><div className="usage-section-heading"><div><span className="usage-section-kicker">Local Nexus usage</span><h2>Usage overview</h2><p>Token activity and cost estimates from this installation.</p></div><span className="usage-source-badge is-estimate">Catalog estimate</span></div><div className="usage-overview-grid"><div><span>Total local tokens</span><strong>{formatTokens(totals.totalTokens)}</strong><small>{totals.turnCount} completed turns · {activeDays} active days</small></div><div><span>Current range</span><strong>{range.toUpperCase()}</strong><small>{t("settings.usageTokensInRange")}</small></div><div><span>Estimated spend</span><strong>{costEstimate.priced ? `$${costEstimate.total.toFixed(2)}` : "—"}</strong><small>Calculated from available model pricing</small></div></div></section>
      {error ? <div className="settings-recovery" role="status">{t("settings.usageUnavailable")}<Button variant="secondary" size="sm" onClick={() => void load()}>{t("errors.action.retry")}</Button></div> : null}
      <div className="usage-kpi-grid">
        <div className="usage-kpi usage-kpi-primary"><span>{t("settings.usageTotal")}</span><strong>{formatTokens(totals.totalTokens)}</strong><small>{t("settings.usageTokensInRange")}</small></div>
        <div className="usage-kpi"><span>{t("settings.usageTurns")}</span><strong>{totals.turnCount}</strong><small>{t("settings.usageCompleted")}</small></div>
        <div className="usage-kpi"><span>{t("settings.usageInput")}</span><strong>{formatTokens(totals.inputTokens)}</strong><small>{t("settings.usageProviderInput")}</small></div>
        <div className="usage-kpi"><span>{t("settings.usageOutput")}</span><strong>{formatTokens(totals.outputTokens)}</strong><small>{t("settings.usageProviderOutput")}</small></div>
      </div>
      <section className="usage-insight-grid">
        <div className="settings-card-block usage-heatmap-card">
          <div className="usage-card-heading"><div><h3>{t("settings.usageActivity")}</h3><span>{t("settings.usageActivityHint")}</span></div><span className="usage-heatmap-legend"><i data-level="0" /><i data-level="2" /><i data-level="4" /></span></div>
          <div className="usage-heatmap" aria-label={t("settings.usageActivity")}>
            {heatItems.map((item) => <span key={item.date} data-level={item.level} title={`${item.date}: ${formatTokens(item.totalTokens)}`} />)}
          </div>
          <div className="usage-heatmap-footer"><span>{history?.items[0]?.date ?? ""}</span><span>{latest?.date ?? ""}</span></div>
        </div>
      </section>
      <section className="usage-dashboard-section usage-token-activity"><div className="usage-section-heading"><div><span className="usage-section-kicker">Local history</span><h2>Token activity</h2><p>Explore the usage patterns behind the estimate.</p></div></div><div className="usage-dashboard-grid">
        <div className="settings-card-block usage-detail-card">
          <div className="usage-card-heading"><div><h3>{t("settings.usageModelsTitle")}</h3><span>{t("settings.usageModelsHint")}</span></div><strong>{facets.models.length}</strong></div>
          <div className="usage-ranking-list">{facets.models.slice(0, 8).map((item) => <div className="usage-ranking-row" key={item.id}><div className="usage-ranking-label"><span>{item.label}</span><strong>{formatTokens(item.totalTokens)} · {item.turnCount}</strong></div><div className="usage-ranking-track"><span className="usage-ranking-fill" style={{ width: `${Math.max(3, (item.totalTokens / Math.max(1, facets.models[0]?.totalTokens ?? 1)) * 100)}%` }} /></div></div>)}</div>
        </div>
        <div className="settings-card-block usage-detail-card usage-rhythm-card">
          <div className="usage-card-heading"><div><h3>{t("settings.usageRhythm")}</h3><span>{t("settings.usageRhythmHint")}</span></div><span>{history?.items.length ?? 0} {t("settings.usagePeriods")}</span></div>
          <div className="usage-bars" aria-label={t("settings.usageRhythm")}>
            {(history?.items ?? []).slice(-18).map((item) => <span key={item.date} title={`${item.date}: ${formatTokens(item.totalTokens)}`} style={{ height: `${Math.max(8, (item.totalTokens / maxTotal) * 100)}%` }} />)}
          </div>
          <div className="usage-axis"><span>{history?.items.at(-18)?.date ?? ""}</span><span>{latest?.date ?? ""}</span></div>
        </div>
        <div className="settings-card-block usage-detail-card">
          <div className="usage-card-heading"><div><h3>{t("settings.usageToolsTitle")}</h3><span>{t("settings.usageToolsHint")}</span></div><strong>{facets.sources.length}</strong></div>
          <div className="usage-ranking-list">{facets.sources.slice(0, 8).map((item) => <div className="usage-ranking-row" key={item.id}><div className="usage-ranking-label"><span>{item.label}</span><strong>{formatTokens(item.totalTokens)} · {item.turnCount}</strong></div><div className="usage-ranking-track"><span className="usage-ranking-fill" style={{ width: `${Math.max(3, (item.totalTokens / Math.max(1, facets.sources[0]?.totalTokens ?? 1)) * 100)}%` }} /></div></div>)}</div>
        </div>
        <div className="settings-card-block usage-detail-card">
          <div className="usage-card-heading"><div><h3>{t("settings.usageSessionsTitle")}</h3><span>{t("settings.usageSessionsHint")}</span></div><strong>{facets.sessions.length}</strong></div>
          <div className="usage-ranking-list">{facets.sessions.slice(0, 8).map((item) => <div className="usage-ranking-row" key={item.id}><div className="usage-ranking-label"><span>{item.label}</span><strong>{formatTokens(item.totalTokens)} · {item.turnCount}</strong></div><div className="usage-ranking-track"><span className="usage-ranking-fill" style={{ width: `${Math.max(3, (item.totalTokens / Math.max(1, facets.sessions[0]?.totalTokens ?? 1)) * 100)}%` }} /></div></div>)}</div>
        </div>
      </div></section>
      <section className="usage-dashboard-section usage-pricing-section"><div className="usage-section-heading"><div><span className="usage-section-kicker">Local Nexus estimate</span><h2>Pricing</h2><p>Selected range · cost estimates unless marked provider reported.</p></div><span className="usage-source-badge is-estimate">{costEstimate.priced ? "$" + costEstimate.total.toFixed(2) : "—"}</span></div><div className="usage-pricing-summary-grid"><div><span>Provider reported</span><strong>—</strong><small>No request-level cost</small></div><div><span>Provider reconciled</span><strong>—</strong><small>No reconciled requests</small></div><div><span>Catalog estimate</span><strong>{costEstimate.priced ? "$" + costEstimate.total.toFixed(2) : "—"}</strong><small>{costEstimate.priced} priced models</small></div><div><span>Unpriced</span><strong>{costEstimate.unpriced}</strong><small>No catalog price</small></div></div><div className="usage-cost-model-list"><h3>Cost by model</h3><p className="usage-cost-model-hint">Selected range · catalog estimates unless marked provider reported</p>{costEstimate.rows.slice(0, 12).map((row) => <div className="usage-cost-model-row" key={row.id}><div><span>{row.label}</span><small>Catalog estimate · model usage</small></div><strong>{row.cost == null ? "Unpriced" : "$" + row.cost.toFixed(2)}</strong><i><b style={{ width: `${Math.max(4, ((row.cost ?? 0) / Math.max(0.01, costEstimate.total)) * 100)}%` }} /></i></div>)}</div></section>
      <section className="usage-dashboard-section usage-cost-sources"><div className="usage-section-heading"><div><span className="usage-section-kicker">Cost transparency</span><h2>Cost sources</h2><p>Every value is labeled by how it was obtained.</p></div></div><div className="usage-source-grid"><div><span>Provider reported</span><strong>—</strong><small>No request-level cost</small></div><div><span>Provider reconciled</span><strong>—</strong><small>No reconciled requests</small></div><div><span>Catalog estimate</span><strong>{costEstimate.priced ? `$${costEstimate.total.toFixed(2)}` : "—"}</strong><small>{costEstimate.priced} priced models</small></div><div><span>Unpriced / unavailable</span><strong>{costEstimate.unpriced}</strong><small>No catalog value</small></div></div></section>
      <section className="usage-dashboard-section usage-provider-accounts"><div className="usage-section-heading"><div><span className="usage-section-kicker">Configured providers</span><h2>Provider accounts</h2><p>Quota and spend data for configured providers.</p></div></div><div className="usage-provider-grid">{configuredProviders.length ? configuredProviders.map((item) => <div className="usage-provider-card" key={item.id}><div><strong>{item.name ?? item.id}</strong><span>{item.baseUrl ?? "Configured provider"}</span></div><em>Account data unavailable</em><div className="usage-provider-slots"><span>Wallet <b>—</b></span><span>Spend <b>—</b></span><span>Reset <b>—</b></span></div><small>Local token usage and catalog estimates remain available.</small></div>) : <div className="usage-provider-card usage-provider-card-muted"><div><strong>No configured providers</strong><span>Provider accounts</span></div><em>Unavailable</em><p>Configure a provider to view account data.</p></div>}</div></section>
      <footer className="usage-provenance">{t("settings.usageNativeFooter", { turns: totals.turnCount })}<span>{t("settings.usageNativeDisclaimer")}</span></footer>
    </div>
  );
}
