import { useEffect, useState } from "react";
import type { WorkflowSessionStatus } from "@pi-desktop/shared";
import { api } from "../lib/api";
import { useAppStore } from "../stores/app-store";

export function ActiveWorkflowCard({ sessionId }: { sessionId?: string | null }) {
  const [status, setStatus] = useState<WorkflowSessionStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [body, setBody] = useState<string | null>(null);
  const primary = status?.primary;

  useEffect(() => {
    if (!sessionId) {
      setStatus(null);
      return;
    }
    const load = () => api.workflowStatus(sessionId).then(setStatus).catch(() => setStatus(null));
    void load();
    return api.onWorkflowChanged((event) => {
      if (!event.sessionId || event.sessionId === sessionId) void load();
    });
  }, [sessionId]);

  if (!sessionId || !primary) return null;
  const dismiss = async () => {
    setBusy(true);
    try {
      setStatus(await api.dismissSessionWorkflow(sessionId, primary.id));
    } finally {
      setBusy(false);
    }
  };
  const inspect = async () => {
    const next = !expanded;
    setExpanded(next);
    if (next && body === null) {
      const result = await api.readWorkflow(primary.id).catch(() => null);
      setBody(result?.body ?? "Workflow guidance is unavailable.");
    }
  };
  return (
    <aside className="active-workflow-card" aria-label="Active workflow">
      <div className="active-workflow-copy">
        <strong>{primary.name}</strong>
        <span>Stage: {primary.stage} · Activated: {primary.reasonCategory.replaceAll("_", " ")}</span>
        {primary.nextAction ? <span>{primary.nextAction}</span> : null}
      </div>
      <div className="active-workflow-actions">
        <button type="button" onClick={() => void inspect()}>
          {expanded ? "Hide" : "Inspect"}
        </button>
        <button type="button" disabled={busy} onClick={() => void dismiss()}>Dismiss</button>
        <button type="button" onClick={() => {
          const store = useAppStore.getState();
          store.setSettingsTab("skills");
          store.setPage("settings");
        }}>Settings</button>
      </div>
      {expanded ? <pre className="active-workflow-body">{body ?? "Loading workflow guidance…"}</pre> : null}
    </aside>
  );
}
