import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { TokenUsageHistoryResult } from "@pi-desktop/shared";
import { api } from "../../lib/api";
import { Badge, Button, Select } from "../ui";

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

  return (
    <div className="settings-stack usage-page">
      <div className="usage-toolbar">
        <span className="settings-row-desc">{t("settings.usageDescription")}</span>
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
        <div className="usage-kpi"><span>{t("settings.usageTotal")}</span><strong>{formatTokens(totals.totalTokens)}</strong></div>
        <div className="usage-kpi"><span>{t("settings.usageInput")}</span><strong>{formatTokens(totals.inputTokens)}</strong></div>
        <div className="usage-kpi"><span>{t("settings.usageOutput")}</span><strong>{formatTokens(totals.outputTokens)}</strong></div>
        <div className="usage-kpi"><span>{t("settings.usageTurns")}</span><strong>{totals.turnCount}</strong></div>
      </div>
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
