import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { DiffFile, PlanProposal, SessionSummary, WorkspaceDiff } from "@pi-desktop/shared";
import { api } from "../lib/api";
import { useAppStore } from "../stores/app-store";
import { Badge, Button } from "./ui";
import { IconActivity, IconBranch, IconCheck } from "./icons";

type ProjectWorkbenchProps = {
  projectPath: string;
  sessions: SessionSummary[];
  active: boolean;
  onOpenSession: (sessionId: string) => void;
};

function changeTotals(files: DiffFile[]) {
  return files.reduce(
    (result, file) => ({
      additions: result.additions + file.additions,
      deletions: result.deletions + file.deletions,
    }),
    { additions: 0, deletions: 0 },
  );
}

function proposalLabel(proposal: PlanProposal): string {
  if (proposal.executionState === "running") return "running";
  if (proposal.executionState === "completed") return "completed";
  if (proposal.status === "pending") return "awaiting approval";
  if (proposal.status === "approved") return "approved";
  if (proposal.status === "rejected") return "rejected";
  if (proposal.status === "interrupted") return "interrupted";
  return proposal.status;
}

export function ProjectWorkbench({ projectPath, sessions, active, onOpenSession }: ProjectWorkbenchProps) {
  const { t } = useTranslation();
  const planCheckpoints = useAppStore((state) => state.planCheckpoints);
  const [diff, setDiff] = useState<WorkspaceDiff | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  const refreshDiff = useCallback(() => {
    if (!active) {
      setDiff(null);
      setError(false);
      return Promise.resolve();
    }
    setLoading(true);
    setError(false);
    return api.workspaceDiff().then(setDiff).catch(() => setError(true)).finally(() => setLoading(false));
  }, [active]);

  useEffect(() => {
    let cancelled = false;
    if (!active) {
      setDiff(null);
      setError(false);
      return;
    }
    setLoading(true);
    setError(false);
    void api.workspaceDiff().then((result) => {
      if (!cancelled) setDiff(result);
    }).catch(() => {
      if (!cancelled) setError(true);
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [active, projectPath]);

  const proposals = useMemo(() => {
    const ids = new Set(sessions.map((session) => session.id));
    return Object.values(planCheckpoints)
      .filter((proposal) => ids.has(proposal.sessionId))
      .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
  }, [planCheckpoints, sessions]);

  const totals = diff ? changeTotals(diff.files) : null;

  return (
    <div className="project-workbench">
      <div className="project-workbench-grid">
        <section className="project-workbench-card">
          <div className="project-workbench-heading">
            <span><IconBranch size={14} />{t("project.workbenchLocalChanges")}</span>
            {active ? <Badge tone={diff?.clean ? "success" : "warning"}>{diff?.clean ? t("project.workbenchClean") : t("project.workbenchChanged")}</Badge> : <Badge tone="neutral">{t("project.workbenchActivateToInspect")}</Badge>}
          </div>
          {!active ? <p className="project-workbench-muted">{t("project.workbenchActivateHint")}</p> : loading ? <p className="project-workbench-muted">{t("common.loading")}</p> : error ? <div className="project-workbench-recovery"><span>{t("project.workbenchDiffUnavailable")}</span><Button size="sm" variant="secondary" onClick={() => void refreshDiff()}>{t("errors.action.retry")}</Button></div> : diff ? <>
            <div className="project-workbench-stats"><strong>{diff.files.length}</strong> {t("project.workbenchFiles")} <span className="diff-count-add">+{totals?.additions ?? 0}</span> <span className="diff-count-del">−{totals?.deletions ?? 0}</span>{diff.truncated ? <Badge tone="warning">{t("project.workbenchTruncated")}</Badge> : null}</div>
            {diff.files.length ? <div className="project-workbench-files">{diff.files.slice(0, 8).map((file) => <div className="project-workbench-file" key={`${file.oldPath ?? ""}:${file.path}`}><span>{file.path}</span><span className="project-workbench-file-count"><span className="diff-count-add">+{file.additions}</span> <span className="diff-count-del">−{file.deletions}</span></span></div>)}</div> : <p className="project-workbench-muted">{t("project.workbenchNoChanges")}</p>}
          </> : null}
        </section>

        <section className="project-workbench-card">
          <div className="project-workbench-heading"><span><IconActivity size={14} />{t("project.workbenchContracts")}</span><Badge tone={proposals.length ? "warning" : "neutral"}>{proposals.length}</Badge></div>
          {proposals.length ? <div className="project-workbench-contracts">{proposals.slice(0, 4).map((proposal) => {
            const session = sessions.find((candidate) => candidate.id === proposal.sessionId);
            return <button type="button" className="project-workbench-contract" key={proposal.id} onClick={() => onOpenSession(proposal.sessionId)}><span className="project-workbench-contract-title">{proposal.title || proposal.kind}</span><span className="project-workbench-contract-meta">{proposal.kind} · {proposalLabel(proposal)} · {session?.title || proposal.sessionId}</span></button>;
          })}</div> : <p className="project-workbench-muted">{t("project.workbenchNoContracts")}</p>}
        </section>
      </div>
      <div className="project-workbench-note"><IconCheck size={13} />{t("project.workbenchEvidenceHint")}</div>
    </div>
  );
}
