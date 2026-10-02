import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { nativeReviewChangesFromMessages, reviewChangesFromMessages, summarizeReviewChanges } from "../../lib/workspace-review";
import { useAppStore } from "../../stores/app-store";
import { IconDiff } from "../icons";
import { ReviewChangeCard } from "../ReviewChangeCard";
import { WorkTabEmpty } from "./WorkTabEmpty";

export function ReviewTab() {
  const { t } = useTranslation();
  const messages = useAppStore((state) => state.messages);
  const entries = useMemo(() => reviewChangesFromMessages(messages), [messages]);
  const summary = useMemo(() => summarizeReviewChanges(entries), [entries]);
  const nativeEntries = useMemo(() => nativeReviewChangesFromMessages(messages), [messages]);

  if (entries.length === 0 && nativeEntries.length === 0) {
    return (
      <WorkTabEmpty
        icon={IconDiff}
        title={t("panel.review.noChanges")}
        body={t("panel.review.noChangesHint")}
      />
    );
  }

  return (
    <div className="review-tab">
      <div className="review-toolbar">
        <span className="review-summary">
          {t("panel.review.changes", { count: summary.changeCount + nativeEntries.length })}
        </span>
        {nativeEntries.length === 0 && <span className="review-toolbar-counts diff-counts">
          <span className="diff-count-add">+{summary.additions}</span>
          <span className="diff-count-del">−{summary.deletions}</span>
        </span>}
      </div>
      <div className="review-scroll">
        {nativeEntries.map(({ id, message, change }) => <details key={id} className="native-review-change">
          <summary><span>{change.operation === "add" ? "A" : change.operation === "delete" ? "D" : "M"}</span><strong>{change.oldPath ? `${change.oldPath} → ` : ""}{change.path}</strong>{message.agentName && <small>{message.agentName}</small>}</summary>
          {change.truncated && <div className="review-change-note">{t("panel.review.tooLarge")}</div>}
          <pre>{change.diff || t("panel.review.noLineDetails")}</pre>
        </details>)}
        {entries.map((entry) => (
          <ReviewChangeCard
            key={entry.change.snapshotId}
            message={entry.message}
            compact
          />
        ))}
      </div>
    </div>
  );
}
