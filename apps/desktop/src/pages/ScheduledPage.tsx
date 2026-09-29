import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { ProjectRecord, ProviderPublic, ScheduledTask, ScheduledTaskRun } from "@pi-desktop/shared";
import { useAppStore } from "../stores/app-store";
import { api } from "../lib/api";
import { Badge, Button, Field, Input, Select, Textarea } from "../components/ui";
import { IconClock } from "../components/icons";
import "../styles/scheduled.css";

type Draft = {
  title: string; prompt: string; cadence: ScheduledTask["cadence"];
  workspacePath: string; providerId: string; modelId: string;
  permissionMode: "ask" | "accept-edits" | "auto"; time: string; weekday: number;
};
const blank = (): Draft => ({ title: "", prompt: "", cadence: "manual", workspacePath: "", providerId: "", modelId: "", permissionMode: "ask", time: "09:00", weekday: 0 });
function fromTask(task: ScheduledTask): Draft {
  return { title: task.title, prompt: task.prompt, cadence: task.cadence,
    workspacePath: task.workspacePath ?? "", providerId: task.providerId ?? "", modelId: task.modelId ?? "",
    permissionMode: task.permissionMode ?? "ask",
    time: `${String(task.schedule?.hour ?? 9).padStart(2, "0")}:${String(task.schedule?.minute ?? 0).padStart(2, "0")}`,
    weekday: task.schedule?.weekday ?? 0 };
}

export function ScheduledPage() {
  const { t, i18n } = useTranslation();
  const showToast = useAppStore((s) => s.showToast);
  const selectSession = useAppStore((s) => s.selectSession);
  const setPage = useAppStore((s) => s.setPage);
  const [tasks, setTasks] = useState<ScheduledTask[]>([]);
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [providers, setProviders] = useState<ProviderPublic[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(blank);
  const [runs, setRuns] = useState<ScheduledTaskRun[]>([]);
  const [keepAwake, setKeepAwake] = useState(false);
  const [busy, setBusy] = useState(false);
  const selected = tasks.find((task) => task.id === selectedId);
  const provider = providers.find((item) => item.id === draft.providerId);
  const locale = i18n.resolvedLanguage ?? i18n.language;
  const update = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((current) => ({ ...current, [key]: value }));
  const cadenceLabel = (cadence: ScheduledTask["cadence"]) => t(`scheduled.cadence${cadence[0].toUpperCase()}${cadence.slice(1)}`);

  const refresh = async (id = selectedId) => {
    try {
      const result = await api.listScheduled();
      setTasks(result.tasks ?? []);
      if (id && id !== "new") setRuns((await api.listScheduledRuns(id, 50)).runs);
    } catch (error) { showToast(String(error), { variant: "error" }); }
  };
  useEffect(() => {
    void refresh();
    void Promise.all([api.listProjects(), api.listProviders(), api.getSettings()]).then(
      ([projectResult, providerResult, settings]) => {
        setProjects(projectResult.projects); setProviders(providerResult.providers);
        setKeepAwake(settings.keepAwakeDuringWork === true);
      }, (error) => showToast(String(error), { variant: "error" }),
    );
    const timer = window.setInterval(() => void refresh(), 30_000);
    return () => window.clearInterval(timer);
  }, [selectedId]);

  const select = (task: ScheduledTask | null) => {
    setSelectedId(task?.id ?? "new"); setDraft(task ? fromTask(task) : blank()); setRuns([]);
  };
  const schedule = draft.cadence === "manual" ? null : {
    hour: Number(draft.time.split(":")[0]), minute: Number(draft.time.split(":")[1]), weekday: draft.weekday,
  };
  const canSave = Boolean(draft.prompt.trim()) &&
    (!draft.workspacePath || projects.some((project) => project.path === draft.workspacePath)) &&
    (draft.cadence === "manual" || Boolean(provider?.enabled && provider.models.some((model) => model.id === draft.modelId)));
  const save = async () => {
    if (!canSave || busy) return;
    setBusy(true);
    try {
      const input = {
        title: draft.title.trim() || t("chat.untitledTask"), prompt: draft.prompt.trim(),
        cadence: draft.cadence, mode: "agent" as const, enabled: selected?.enabled ?? true,
        schedule, workspacePath: draft.workspacePath || null,
        providerId: draft.providerId || null, modelId: draft.modelId || null,
        permissionMode: draft.permissionMode,
      };
      const result = selected ? await api.updateScheduled({ ...input, id: selected.id }) : await api.createScheduled(input);
      setSelectedId(result.task.id); setDraft(fromTask(result.task)); await refresh(result.task.id);
    } catch (error) { showToast(String(error), { variant: "error" }); }
    finally { setBusy(false); }
  };
  const runNow = async (task: ScheduledTask) => {
    try {
      const result = await api.runScheduled(task.id);
      await selectSession(result.sessionId); setPage("chat");
    } catch (error) { showToast(String(error), { variant: "error" }); }
  };

  return <div className="thread-scroll"><div className="page-frame scheduled-page">
    <header className="page-header scheduled-header"><h1 className="page-title">{t("scheduled.title")}</h1><Button variant="primary" onClick={() => select(null)}>+ {t("scheduled.create")}</Button></header>
    <label className="scheduled-awake"><input type="checkbox" checked={keepAwake} onChange={async (event) => {
      const value = event.target.checked; setKeepAwake(value);
      try { await api.setSettings({ ...await api.getSettings(), keepAwakeDuringWork: value }); }
      catch (error) { setKeepAwake(!value); showToast(String(error), { variant: "error" }); }
    }} />Keep computer awake while an agent is working</label>
    <div className={`scheduled-layout ${selectedId ? "scheduled-has-editor" : ""}`}>
      <section className="scheduled-list" aria-label={t("scheduled.tasks")}>
        {tasks.length === 0 && <div className="scheduled-empty"><IconClock size={20} />{t("scheduled.emptyTitle")}</div>}
        {tasks.map((task) => <button key={task.id} type="button" className={`scheduled-item ${selectedId === task.id ? "active" : ""}`} onClick={() => select(task)}>
          <span className="scheduled-item-top"><strong>{task.title}</strong><Badge tone={task.enabled ? "success" : "neutral"}>{task.enabled ? t("scheduled.enabled") : t("scheduled.disabled")}</Badge></span>
          <span className="scheduled-item-prompt">{task.prompt}</span>
          <span className="scheduled-item-bottom">{cadenceLabel(task.cadence)}{task.nextRunAt ? ` · ${new Date(task.nextRunAt).toLocaleString(locale)}` : ""}</span>
          {task.reviewRequired && <span className="scheduled-warning">Review settings</span>}
        </button>)}
      </section>
      <section className="scheduled-editor" aria-label={selected ? selected.title : t("scheduled.create")}>
        {selectedId ? <>
          <div className="scheduled-editor-head"><Button variant="ghost" onClick={() => setSelectedId(null)}>Back</Button><h2>{selected ? selected.title : t("scheduled.create")}</h2>
            {selected && <Button variant="ghost" onClick={async () => { try { await api.deleteScheduled(selected.id); setSelectedId(null); await refresh(null); } catch (error) { showToast(String(error), { variant: "error" }); } }}>{t("scheduled.delete")}</Button>}
          </div>
          <div className="scheduled-fields">
            <Field label={t("nav.newTask")}><Input value={draft.title} onChange={(event) => update("title", event.target.value)} /></Field>
            <Field label={t("scheduled.prompt")}><Textarea rows={5} value={draft.prompt} onChange={(event) => update("prompt", event.target.value)} /></Field>
            <div className="scheduled-field-grid">
              <Field label="Project"><Select value={draft.workspacePath} onChange={(event) => update("workspacePath", event.target.value)}><option value="">No project</option>{draft.workspacePath && !projects.some((project) => project.path === draft.workspacePath) && <option value={draft.workspacePath}>Unavailable: {draft.workspacePath}</option>}{projects.map((project) => <option key={project.id} value={project.path}>{project.name}</option>)}</Select></Field>
              <Field label={t("scheduled.cadence")}><Select value={draft.cadence} onChange={(event) => update("cadence", event.target.value as Draft["cadence"])}>{(["manual", "hourly", "daily", "weekly"] as const).map((value) => <option key={value} value={value}>{cadenceLabel(value)}</option>)}</Select></Field>
              {(draft.cadence === "daily" || draft.cadence === "weekly") && <Field label="Local time"><Input type="time" value={draft.time} onChange={(event) => update("time", event.target.value)} /></Field>}
              {draft.cadence === "weekly" && <Field label="Day"><Select value={draft.weekday} onChange={(event) => update("weekday", Number(event.target.value))}>{["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"].map((day, index) => <option key={day} value={index}>{day}</option>)}</Select></Field>}
              <Field label="Provider"><Select value={draft.providerId} onChange={(event) => setDraft((current) => ({ ...current, providerId: event.target.value, modelId: "" }))}><option value="">Choose provider</option>{draft.providerId && !providers.some((item) => item.id === draft.providerId && item.enabled) && <option value={draft.providerId}>Unavailable: {draft.providerId}</option>}{providers.filter((item) => item.enabled).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</Select></Field>
              <Field label="Model"><Select value={draft.modelId} onChange={(event) => update("modelId", event.target.value)}><option value="">Choose model</option>{draft.modelId && !provider?.models.some((model) => model.id === draft.modelId) && <option value={draft.modelId}>Unavailable: {draft.modelId}</option>}{provider?.models.map((model) => <option key={model.id} value={model.id}>{model.alias || model.id}</option>)}</Select></Field>
              <Field label="Permission"><Select value={draft.permissionMode} onChange={(event) => update("permissionMode", event.target.value as Draft["permissionMode"])}><option value="ask">Ask</option><option value="accept-edits">Accept edits</option><option value="auto">Auto</option></Select></Field>
            </div>
          </div>
          <div className="scheduled-editor-actions"><Button variant="primary" disabled={!canSave || busy} onClick={() => void save()}>{selected ? "Save changes" : t("scheduled.create")}</Button>
            {selected && <><Button variant="secondary" onClick={async () => { try { await api.updateScheduled({ id: selected.id, enabled: !selected.enabled }); await refresh(); } catch (error) { showToast(String(error), { variant: "error" }); } }}>{selected.enabled ? "Pause" : "Enable"}</Button><Button variant="secondary" onClick={() => void runNow(selected)}>{t("scheduled.runNow")}</Button></>}
          </div>
          {selected && <div className="scheduled-history"><h3>{t("scheduled.recentRuns")}</h3>{runs.map((run) => <div className="scheduled-run" key={run.id}><span>{run.status}</span><time>{new Date(run.scheduledAt ?? run.startedAt).toLocaleString(locale)}</time>{run.errorCode && <span>{run.errorCode}</span>}</div>)}{selected.olderMissedCount > 0 && <div className="scheduled-run">{selected.olderMissedCount} older missed times</div>}{!runs.length && <div className="scheduled-run">{t("scheduled.never")}</div>}</div>}
        </> : <div className="scheduled-empty"><IconClock size={22} />{t("scheduled.emptyTitle")}</div>}
      </section>
    </div>
  </div></div>;
}
