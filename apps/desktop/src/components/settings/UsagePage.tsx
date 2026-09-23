import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { TokenUsageHistoryResult } from "@pi-desktop/shared";
import { api } from "../../lib/api";
import { Badge, Button, Select } from "../ui";
import { IconActivity } from "../icons";

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

function startDateFor(bucket: Bucket): number {
  const days = bucket === "month" ? 180 : bucket === "week" ? 84 : 30;
  return Date.now() - days * 86_400_000;
}

function heatLevel(value: number, max: number): number {
  if (!value) return 0;
  if (value >= max * 0.75) return 4;
  if (value >= max * 0.5) return 3;
  if (value >= max * 0.25) return 2;
  return 1;
}

export function UsagePage() {
  const { t, i18n } = useTranslation();
  const [bucket, setBucket] = useState<Bucket>("day");
  const [history, setHistory] = useState<TokenUsageHistoryResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = async (nextBucket = bucket) => {
    setLoading(true);
    setError(false);
    try {
      setHistory(await api.getTokenUsageHistory({
        bucket: nextBucket,
        startDate: startDateFor(nextBucket),
        endDate: Date.now(),
      }));
    } catch {
      setHistory(null);
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, [bucket]);

  const totals = history?.totals ?? EMPTY_TOTALS;
  const maxTotal = useMemo(
    () => Math.max(1, ...(history?.items ?? []).map((item) => item.totalTokens)),
    [history],
  );
  const locale = i18n.resolvedLanguage ?? i18n.language;
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
  const mix = useMemo(() => [
    { label: t("settings.usageInput"), value: totals.inputTokens, tone: "input" },
    { label: t("settings.usageOutput"), value: totals.outputTokens, tone: "output" },
    { label: t("settings.usageCacheRead"), value: totals.cacheReadTokens, tone: "cache" },
    { label: t("settings.usageReasoning"), value: totals.reasoningTokens, tone: "reasoning" },
  ].filter((entry) => entry.value > 0), [t, totals]);
  const maxMix = Math.max(1, ...mix.map((entry) => entry.value));
  const recentItems = useMemo(() => (history?.items ?? []).slice(-8).reverse(), [history]);
  const filterOptions = [t("settings.usageAllTools"), t("settings.usageAllModels"), t("settings.usageAllProviders")];

  return (
    <div className="settings-stack usage-page">
      <div className="usage-plugin-topbar">
        <strong>{t("settings.usagePluginTitle")}</strong>
        <div className="usage-plugin-filters" role="group" aria-label={t("settings.usageFilters")}>
          <div className="usage-range-pills">{["7D", "30D", "90D", "1Y", "ALL"].map((range) => <button className={range === "ALL" ? "active" : ""} key={range} type="button">{range}</button>)}</div>
          {filterOptions.map((label) => <button className="usage-filter-chip" key={label} type="button">{label}<span aria-hidden="true">⌄</span></button>)}
          <span className="usage-filter-search">{t("settings.usageFilterPlaceholder")}</span>
        </div>
      </div>
      <div className="usage-hero">
        <div>
          <div className="usage-eyebrow">{t("settings.usageEyebrow")}</div>
          <h2 className="usage-hero-title">{formatTokens(totals.totalTokens)}</h2>
          <p>{t("settings.usageHeroSub", { turns: totals.turnCount })}</p>
          <p className="usage-hero-note">{t("settings.usageDescription")}</p>
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
        <div className="settings-card-block usage-latest-card">
          <div className="usage-card-heading"><div><h3>{t("settings.usageLatest")}</h3><span>{t("settings.usageLatestHint")}</span></div><IconActivity size={17} /></div>
          <strong className="usage-latest-total">{formatTokens(latest?.totalTokens ?? 0)}</strong>
          <span className="usage-latest-meta">{latest ? new Date(latest.timestamp).toLocaleDateString(locale, { month: "short", day: "numeric" }) : t("settings.usageEmpty")}</span>
          <div className="usage-latest-line"><span>{t("settings.usageInput")}</span><strong>{formatTokens(latest?.inputTokens ?? 0)}</strong></div>
          <div className="usage-latest-line"><span>{t("settings.usageOutput")}</span><strong>{formatTokens(latest?.outputTokens ?? 0)}</strong></div>
        </div>
      </section>
      <section className="usage-dashboard-grid">
        <div className="settings-card-block usage-detail-card">
          <div className="usage-card-heading"><div><h3>{t("settings.usageMix")}</h3><span>{t("settings.usageMixHint")}</span></div><strong>{formatTokens(totals.totalTokens)}</strong></div>
          <div className="usage-ranking-list">
            {mix.map((entry) => <div className="usage-ranking-row" key={entry.label}>
              <div className="usage-ranking-label"><span>{entry.label}</span><strong>{formatTokens(entry.value)}</strong></div>
              <div className="usage-ranking-track"><span className={`usage-ranking-fill ${entry.tone}`} style={{ width: `${Math.max(3, (entry.value / maxMix) * 100)}%` }} /></div>
            </div>)}
          </div>
        </div>
        <div className="settings-card-block usage-detail-card usage-rhythm-card">
          <div className="usage-card-heading"><div><h3>{t("settings.usageRhythm")}</h3><span>{t("settings.usageRhythmHint")}</span></div><span>{history?.items.length ?? 0} {t("settings.usagePeriods")}</span></div>
          <div className="usage-bars" aria-label={t("settings.usageRhythm")}>
            {(history?.items ?? []).slice(-18).map((item) => <span key={item.date} title={`${item.date}: ${formatTokens(item.totalTokens)}`} style={{ height: `${Math.max(8, (item.totalTokens / maxTotal) * 100)}%` }} />)}
          </div>
          <div className="usage-axis"><span>{history?.items.at(-18)?.date ?? ""}</span><span>{latest?.date ?? ""}</span></div>
        </div>
        <div className="settings-card-block usage-detail-card">
          <div className="usage-card-heading"><div><h3>{t("settings.usagePeriodsTitle")}</h3><span>{t("settings.usagePeriodsHint")}</span></div><span>{totals.turnCount} {t("settings.usageTurnsShort")}</span></div>
          <div className="usage-period-list">
            {recentItems.map((item) => <div className="usage-period-row" key={item.date}><span>{new Date(item.timestamp).toLocaleDateString(locale, { month: "short", day: "numeric" })}</span><span className="usage-period-track"><i style={{ width: `${Math.max(3, (item.totalTokens / maxTotal) * 100)}%` }} /></span><strong>{formatTokens(item.totalTokens)}</strong></div>)}
          </div>
        </div>
        <div className="settings-card-block usage-detail-card usage-turn-card">
          <div className="usage-card-heading"><div><h3>{t("settings.usageTurnsTitle")}</h3><span>{t("settings.usageTurnsHint")}</span></div><IconActivity size={17} /></div>
          <strong className="usage-turn-total">{totals.turnCount}</strong>
          <span className="usage-latest-meta">{t("settings.usageCompleted")}</span>
          <div className="usage-turn-summary"><span>{t("settings.usageAverage")}</span><strong>{formatTokens(totals.turnCount ? totals.totalTokens / totals.turnCount : 0)}</strong></div>
        </div>
      </section>
      <section className="settings-card-block">
        <h3 className="settings-card-heading">{t("settings.usageHistory")}</h3>
        <div className="settings-panel usage-history-panel">
          {loading ? <div className="settings-recovery">{t("common.loading")}</div> : history?.items.length ? <div className="usage-history-list">
            {history.items.map((item) => <div className="usage-history-row" key={item.date}>
              <span className="usage-history-date">{new Date(item.timestamp).toLocaleDateString(locale, { month: "short", day: "numeric" })}</span>
              <div className="usage-history-bar-track"><span className="usage-history-bar" style={{ width: `${Math.max(2, (item.totalTokens / maxTotal) * 100)}%` }} /></div>
              <span className="usage-history-value">{formatTokens(item.totalTokens)}</span>
              <Badge tone="neutral">{t("settings.usageTurnCount", { count: item.turnCount })}</Badge>
            </div>)}
          </div> : <div className="settings-recovery">{t("settings.usageEmpty")}</div>}
        </div>
      </section>
      <section className="settings-card-block">
        <h3 className="settings-card-heading">{t("settings.usageBreakdown")}</h3>
        <div className="settings-panel usage-breakdown-grid">
          <div><span>{t("settings.usageCacheRead")}</span><strong>{formatTokens(totals.cacheReadTokens)}</strong></div>
          <div><span>{t("settings.usageCacheWrite")}</span><strong>{formatTokens(totals.cacheWriteTokens)}</strong></div>
          <div><span>{t("settings.usageReasoning")}</span><strong>{formatTokens(totals.reasoningTokens)}</strong></div>
        </div>
      </section>
    </div>
  );
}
