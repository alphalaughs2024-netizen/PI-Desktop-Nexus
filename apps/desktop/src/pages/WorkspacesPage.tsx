import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Badge, Button } from "../components/ui";
import { IconBranch, IconFolderOpen } from "../components/icons";
import { api, type ManagedWorktreeInventoryRow } from "../lib/api";
import { useAppStore } from "../stores/app-store";

type WorkspaceAction = "open" | "reveal" | "cleanup";
type PendingActionKey = `${string}:${WorkspaceAction}`;

function statusLabel(row: ManagedWorktreeInventoryRow, t: (key: string) => string) {
  if (!row.exists) return t("settings.workspaceMissing");
  if (!row.clean) return t("settings.workspaceDirty");
  return row.mergedIntoCurrent ? t("settings.workspaceMerged") : t("settings.workspaceActive");
}

function statusTone(row: ManagedWorktreeInventoryRow): "neutral" | "success" | "error" | "warning" {
  if (!row.exists) return "error";
  if (!row.clean) return "warning";
  return row.mergedIntoCurrent ? "success" : "neutral";
}

function shortenPath(path: string, maxLength = 72): string {
  if (path.length <= maxLength) return path;
  return `…${path.slice(-(maxLength - 1))}`;
}

export function WorkspacesPage() {
  const { t, i18n } = useTranslation();
  const [worktrees, setWorktrees] = useState<ManagedWorktreeInventoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [pendingActions, setPendingActions] = useState<Set<PendingActionKey>>(
    () => new Set(),
  );
  const pendingActionsRef = useRef<Set<PendingActionKey>>(new Set());
  const selectSession = useAppStore((state) => state.selectSession);
  const openProject = useAppStore((state) => state.openProject);
  const showToast = useAppStore((state) => state.showToast);

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

  const runAction = async (row: ManagedWorktreeInventoryRow, action: WorkspaceAction) => {
    const rowKey = `${row.repositoryPath}:${row.branch}`;
    const actionKey = `${rowKey}:${action}` as PendingActionKey;
    if (pendingActionsRef.current.has(actionKey)) return;
    pendingActionsRef.current.add(actionKey);
    setPendingActions(new Set(pendingActionsRef.current));
    try {
      if (action === "open") {
        const result = await api.openManagedWorktreeSession(row);
        if (result.session?.id) await selectSession(result.session.id);
      } else if (action === "reveal") {
        await api.revealManagedWorktree(row);
      } else {
        await api.cleanupManagedWorktree(row);
        await refresh();
      }
    } catch (cause) {
      showToast(cause instanceof Error ? cause.message : String(cause), { variant: "error" });
    } finally {
      pendingActionsRef.current.delete(actionKey);
      setPendingActions(new Set(pendingActionsRef.current));
    }
  };

  const openProjectFromEmpty = async () => {
    try {
      await openProject();
    } catch (cause) {
      showToast(cause instanceof Error ? cause.message : String(cause), { variant: "error" });
    }
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
      {!loading && !error && groups.size === 0 ? (
        <div className="workspace-empty" role="status">
          <div className="workspace-empty-icon" aria-hidden="true"><IconBranch size={24} aria-hidden="true" /></div>
          <div className="workspace-empty-copy">
            <h2>{t("settings.workspacesEmptyTitle")}</h2>
            <p>{t("settings.workspacesEmptyBody")}</p>
          </div>
          <Button variant="primary" onClick={() => void openProjectFromEmpty()}>
            <IconFolderOpen size={15} aria-hidden="true" />
            {t("settings.workspaceOpenProject")}
          </Button>
        </div>
      ) : null}
      {[...groups.entries()].map(([repositoryPath, rows]) => (
        <section key={repositoryPath} className="settings-card-block">
          <h2 className="settings-card-title" title={repositoryPath}>{shortenPath(repositoryPath)}</h2>
          {rows.map((row) => (
            (() => {
              const key = `${row.repositoryPath}:${row.branch}`;
              const pendingForRow = [...pendingActions].filter((actionKey) =>
                actionKey.startsWith(`${key}:`),
              );
              return (
            <div className="settings-row workspace-row" key={key} aria-busy={pendingForRow.length > 0}>
              <div className="settings-row-copy">
                <div className="settings-row-title">{row.branch}</div>
                <div className="settings-row-desc workspace-path" title={row.worktreePath}>{shortenPath(row.worktreePath)}</div>
                <div className="settings-row-desc workspace-meta">
                  <Badge className="workspace-status" tone={statusTone(row)}>{statusLabel(row, t)}</Badge>
                  <span>{t("settings.workspaceTasks", { count: row.linkedSessionCount })}</span>
                  <span>{new Date(row.createdAt).toLocaleDateString(i18n.resolvedLanguage ?? i18n.language)}</span>
                </div>
              </div>
              <div className="settings-row-control workspace-actions">
                <Button variant="secondary" onClick={() => void runAction(row, "open")} disabled={!row.exists || pendingForRow.includes(`${key}:open`)}>{t("settings.workspaceOpen")}</Button>
                <Button variant="secondary" onClick={() => void runAction(row, "reveal")} disabled={!row.exists || pendingForRow.includes(`${key}:reveal`)}>{t("settings.workspaceReveal")}</Button>
                <Button variant="secondary" onClick={() => void runAction(row, "cleanup")} disabled={!row.clean || !row.mergedIntoCurrent || pendingForRow.includes(`${key}:cleanup`)}>{t("settings.workspaceCleanup")}</Button>
              </div>
            </div>
              );
            })()
          ))}
        </section>
      ))}
    </div>
  );
}
