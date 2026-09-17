import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "../components/ui";
import { api, type ManagedWorktreeInventoryRow } from "../lib/api";
import { useAppStore } from "../stores/app-store";

function statusLabel(row: ManagedWorktreeInventoryRow, t: (key: string) => string) {
  if (!row.exists) return t("settings.workspaceMissing");
  if (!row.clean) return t("settings.workspaceDirty");
  return row.mergedIntoCurrent ? t("settings.workspaceMerged") : t("settings.workspaceActive");
}

export function WorkspacesPage() {
  const { t } = useTranslation();
  const [worktrees, setWorktrees] = useState<ManagedWorktreeInventoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const selectSession = useAppStore((state) => state.selectSession);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    try {
      const result = await api.listManagedWorktrees();
      setWorktrees(result.worktrees);
    } catch {
      setError(t("errors.HOST_UNAVAILABLE"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => { void refresh(); }, [refresh]);

  const openSession = async (row: ManagedWorktreeInventoryRow) => {
    const result = await api.openManagedWorktreeSession(row);
    if (result.session?.id) await selectSession(result.session.id);
  };

  const groups = new Map<string, ManagedWorktreeInventoryRow[]>();
  for (const row of worktrees) groups.set(row.repositoryPath, [...(groups.get(row.repositoryPath) ?? []), row]);

  return (
    <div className="settings-stack workspaces-page">
      <div className="settings-intro-row">
        <p>{t("settings.workspacesDesc")}</p>
        <Button variant="secondary" onClick={() => void refresh()} disabled={loading}>{t("settings.refresh")}</Button>
      </div>
      {error ? <div className="settings-recovery" role="status">{error}</div> : null}
      {!loading && groups.size === 0 ? <div className="settings-empty">{t("settings.workspacesEmpty")}</div> : null}
      {[...groups.entries()].map(([repositoryPath, rows]) => (
        <section key={repositoryPath} className="settings-card-block">
          <h2 className="settings-card-title">{repositoryPath}</h2>
          {rows.map((row) => (
            <div className="settings-row workspace-row" key={`${row.repositoryPath}:${row.branch}`}>
              <div className="settings-row-copy">
                <div className="settings-row-title">{row.branch}</div>
                <div className="settings-row-desc">{row.worktreePath}</div>
                <div className="settings-row-desc">{statusLabel(row, t)} · {t("settings.workspaceTasks", { count: row.linkedSessionCount })} · {new Date(row.createdAt).toLocaleDateString()}</div>
              </div>
              <div className="settings-row-control workspace-actions">
                <Button variant="secondary" onClick={() => void openSession(row)} disabled={!row.exists}>{t("settings.workspaceOpen")}</Button>
                <Button variant="secondary" onClick={() => void api.revealManagedWorktree(row)} disabled={!row.exists}>{t("settings.workspaceReveal")}</Button>
                <Button variant="secondary" onClick={() => void api.cleanupManagedWorktree(row).then(refresh)} disabled={!row.clean || !row.mergedIntoCurrent}>{t("settings.workspaceCleanup")}</Button>
              </div>
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}
