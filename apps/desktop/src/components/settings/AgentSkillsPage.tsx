import { useCallback, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import {
  GLOBAL_SCOPE,
  type AgentCapabilityLevel,
  type BuiltinSkillRecord,
  type UserSkillRecord,
  type WorkflowPackageRecord,
  type WorkflowPackageInput,
} from "@pi-desktop/shared";
import { api } from "../../lib/api";
import { useAppStore } from "../../stores/app-store";
import { useHostCollection } from "../../hooks/use-host-collection";
import {
  AgentCapabilityPage,
  AgentProjectPicker,
  CapabilityButton,
  CapabilityEmpty,
  CapabilityGroupHeader,
  CapabilityPanel,
  CapabilityRow,
  CapabilityRowMenu,
  CapabilityToggle,
  CapabilityToolbar,
  matchesCapabilitySearch,
  projectDisplayName,
  useAgentProjects,
  useArmedDelete,
  type CapabilityFilter,
  type CapabilityMenuItem,
} from "./AgentCapabilityLayout";
import {
  SkillEditorSheet,
  draftFromSkill,
  emptySkillDraft,
  type SkillDraft,
} from "./SkillEditorSheet";
import {
  IconBookOpen,
  IconClose,
  IconDownload,
  IconFileText,
  IconFolderOpen,
  IconPencil,
  IconPlus,
  IconTrash,
} from "../icons";

import { Button, TooltipButton } from "../ui";
const GLOBAL_SKILLS_PATH = "~/.pi-desktop-nexus/agents/skills";

function projectSkillsPath(projectPath: string | null): string {
  return projectPath ? `${projectPath}/.agents/skills` : "<project-root>/.agents/skills";
}

type SkillEditorState = {
  draft: SkillDraft;
  editing: UserSkillRecord | null;
  level: AgentCapabilityLevel;
};

type BuiltinSkillViewerState = {
  skill: BuiltinSkillRecord;
  body: string;
};

function BuiltinSkillViewer({
  skill,
  body,
  onClose,
}: BuiltinSkillViewerState & { onClose: () => void }) {
  const { t } = useTranslation();
  const dialog = (
    <div
      className="overlay ext-sheet-overlay"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="dialog ext-sheet" role="dialog" aria-modal aria-labelledby="builtin-skill-viewer-title">
        <div className="ext-sheet-head">
          <div>
            <h3 id="builtin-skill-viewer-title" className="ext-sheet-title">{skill.name || skill.id}</h3>
            <p className="ext-sheet-sub">{t("settings.nexusSkillReadOnly")}</p>
          </div>
          <TooltipButton
            type="button"
            className="ext-sheet-close"
            ariaLabel={t("common.close")}
            tooltip={t("common.close")}
            onClick={onClose}
          >
            <IconClose size={14} />
          </TooltipButton>
        </div>
        <div className="ext-sheet-body">
          <pre className="ext-skill-body" aria-label={t("settings.inspectNexusSkill", { name: skill.name || skill.id })}>{body}</pre>
        </div>
        <div className="ext-sheet-actions">
          <span className="ext-sheet-note">{t("settings.nexusSkillReadOnly")}</span>
          <div className="ext-sheet-actions-end">
            <Button variant="primary" onClick={onClose}>{t("common.close")}</Button>
          </div>
        </div>
      </div>
    </div>
  );

  return typeof document === "undefined" ? dialog : createPortal(dialog, document.body);
}

type SkillCollection = {
  builtin: BuiltinSkillRecord[];
  global: UserSkillRecord[];
  project: UserSkillRecord[];
  workflows: WorkflowPackageRecord[];
};

const EMPTY_SKILL_COLLECTION: SkillCollection = { builtin: [], global: [], project: [], workflows: [] };

export function AgentSkillsPage() {
  const { t } = useTranslation();
  const showToast = useAppStore((state) => state.showToast);
  const { selectedProjectPath, setSelectedProjectPath, options } = useAgentProjects();
  const fetchSkills = useCallback(async (): Promise<SkillCollection> => {
    const [global, project, builtin, workflows] = await Promise.all([
      api.listUserSkills({
        level: "global",
        ...(selectedProjectPath ? { projectPath: selectedProjectPath } : {}),
      }),
      selectedProjectPath
        ? api.listUserSkills({ level: "project", projectPath: selectedProjectPath })
        : Promise.resolve({ skills: [] as UserSkillRecord[] }),
      api.listBuiltinSkills(),
      api.listWorkflowPackages(selectedProjectPath ?? undefined),
    ]);
    return { builtin: builtin.skills ?? [], global: global.skills ?? [], project: project.skills ?? [], workflows: workflows.workflows ?? [] };
  }, [selectedProjectPath]);
  const {
    data: { builtin: builtinSkills, global: globalSkills, project: projectSkills, workflows: workflowPackages },
    setData: setSkills,
    loading,
    refreshing,
    reload: load,
  } = useHostCollection(fetchSkills, EMPTY_SKILL_COLLECTION, (error) =>
    showToast(error instanceof Error ? error.message : String(error), { variant: "error" }),
  );
  const [filter, setFilter] = useState<CapabilityFilter>("all");
  const [search, setSearch] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [editor, setEditor] = useState<SkillEditorState | null>(null);
  const [builtinViewer, setBuiltinViewer] = useState<BuiltinSkillViewerState | null>(null);
  const [saving, setSaving] = useState(false);
  const [workflowBusyId, setWorkflowBusyId] = useState<string | null>(null);
  const { armed, setArmed } = useArmedDelete();

  const rowKey = (level: AgentCapabilityLevel, id: string) => `${level}:${id}`;

  const patchRow = (
    level: AgentCapabilityLevel,
    id: string,
    patch: Partial<UserSkillRecord>,
  ) => {
    setSkills((current) => ({
      ...current,
      [level]: current[level].map((row) => (row.id === id ? { ...row, ...patch } : row)),
    }));
  };

  const levelQuery = (level: AgentCapabilityLevel) => ({
    level,
    ...(selectedProjectPath ? { projectPath: selectedProjectPath } : {}),
  });

  /**
   * The switch flips locally first and only reverts if the host refuses, so one
   * row's request never blanks the list or freezes the others.
   */
  const toggle = async (skill: UserSkillRecord, level: AgentCapabilityLevel) => {
    const key = rowKey(level, skill.id);
    if (busyId === key) return;
    const next = !skill.enabled;
    setBusyId(key);
    patchRow(level, skill.id, { enabled: next });
    try {
      await api.setUserSkillEnabled(skill.id, next, levelQuery(level));
      showToast(
        t(next ? "settings.capabilityEnabled" : "settings.capabilityDisabled", {
          name: skill.name || skill.id,
        }),
        { variant: "success" },
      );
    } catch (error) {
      patchRow(level, skill.id, { enabled: skill.enabled });
      showToast(error instanceof Error ? error.message : String(error), { variant: "error" });
    } finally {
      setBusyId(null);
    }
  };

  const toggleBuiltin = async (skill: BuiltinSkillRecord) => {
    const key = `builtin:${skill.id}`;
    if (busyId === key) return;
    const next = !skill.enabled;
    setBusyId(key);
    setSkills((current) => ({
      ...current,
      builtin: current.builtin.map((row) => row.id === skill.id ? { ...row, enabled: next } : row),
    }));
    try {
      await api.setBuiltinSkillEnabled(skill.id, next);
    } catch (error) {
      setSkills((current) => ({
        ...current,
        builtin: current.builtin.map((row) => row.id === skill.id ? { ...row, enabled: skill.enabled } : row),
      }));
      showToast(error instanceof Error ? error.message : String(error), { variant: "error" });
    } finally {
      setBusyId(null);
    }
  };

  const inspectBuiltin = async (skill: BuiltinSkillRecord) => {
    const key = `builtin:${skill.id}`;
    if (busyId === key) return;
    setBusyId(key);
    try {
      const result = await api.readBuiltinSkill(skill.id);
      setBuiltinViewer({ skill: result.skill ?? skill, body: result.body ?? "" });
    } catch (error) {
      showToast(error instanceof Error ? error.message : String(error), { variant: "error" });
    } finally {
      setBusyId(null);
    }
  };

  const setBuiltinProjectOverride = async (skill: BuiltinSkillRecord, enabled: boolean | null) => {
    if (!selectedProjectPath) return;
    const key = `project-workflow:${skill.id}`;
    if (busyId === key) return;
    setBusyId(key);
    try {
      await api.setProjectWorkflowEnabled(selectedProjectPath, skill.id, enabled);
      showToast(enabled === null ? "Project workflow now follows the global setting." : `Project workflow ${enabled ? "enabled" : "disabled"}.`, { variant: "success" });
    } catch (error) {
      showToast(error instanceof Error ? error.message : String(error), { variant: "error" });
    } finally {
      setBusyId(null);
    }
  };

  /** Where a new or imported skill lands: the filtered level, global when both. */
  const targetLevel: AgentCapabilityLevel = filter === "project" ? "project" : "global";

  const openCreate = () => {
    if (targetLevel === "project" && !selectedProjectPath) {
      showToast(t("settings.selectProjectFirst"), { variant: "error" });
      return;
    }
    setEditor({
      draft: {
        ...emptySkillDraft(),
        scope:
          targetLevel === "global"
            ? GLOBAL_SCOPE
            : { mode: "projects", projects: [selectedProjectPath!] },
      },
      editing: null,
      level: targetLevel,
    });
  };

  const openEdit = async (skill: UserSkillRecord, level: AgentCapabilityLevel) => {
    const key = rowKey(level, skill.id);
    setBusyId(key);
    try {
      const result = await api.readUserSkill(skill.id, levelQuery(level));
      setEditor({
        draft: draftFromSkill(result.skill ?? skill, result.body ?? ""),
        editing: result.skill ?? skill,
        level,
      });
    } catch (error) {
      showToast(error instanceof Error ? error.message : String(error), { variant: "error" });
    } finally {
      setBusyId(null);
    }
  };

  const save = async () => {
    if (!editor) return;
    const { draft, editing, level } = editor;
    const projectPath = level === "project" ? selectedProjectPath ?? undefined : undefined;
    const payload = {
      name: draft.name.trim(),
      description: draft.description.trim(),
      body: draft.body,
      enabled: draft.enabled,
      scope: draft.scope,
      level,
      ...(projectPath ? { projectPath } : {}),
    };
    setSaving(true);
    try {
      if (editing) await api.updateUserSkill(editing.id, payload);
      else await api.createUserSkill(payload);
      await load();
      showToast(
        t(editing ? "settings.skillSaved" : "settings.skillCreated", { name: payload.name }),
        { variant: "success" },
      );
      setEditor(null);
    } catch (error) {
      showToast(error instanceof Error ? error.message : String(error), { variant: "error" });
    } finally {
      setSaving(false);
    }
  };

  const reveal = async (skill: UserSkillRecord, level: AgentCapabilityLevel) => {
    try {
      await api.revealUserSkill(skill.id, levelQuery(level));
    } catch (error) {
      showToast(error instanceof Error ? error.message : String(error), { variant: "error" });
    }
  };

  const remove = async (skill: UserSkillRecord, level: AgentCapabilityLevel) => {
    const key = rowKey(level, skill.id);
    setBusyId(key);
    try {
      await api.removeUserSkill(skill.id, levelQuery(level));
      await load();
      showToast(t("settings.capabilityDeleted", { name: skill.name || skill.id }), {
        variant: "success",
      });
    } catch (error) {
      showToast(error instanceof Error ? error.message : String(error), { variant: "error" });
    } finally {
      setBusyId(null);
      setArmed(null);
    }
  };

  const importSkill = async (level: AgentCapabilityLevel = targetLevel) => {
    if (level === "project" && !selectedProjectPath) {
      showToast(t("settings.selectProjectFirst"), { variant: "error" });
      return;
    }
    setBusyId("import");
    try {
      const result = await api.importUserSkill({
        level,
        ...(level === "project" && selectedProjectPath
          ? { projectPath: selectedProjectPath }
          : {}),
      });
      if (!result.canceled) {
        await load();
        if (result.skill) {
          showToast(t("settings.skillImported", { name: result.skill.name }), {
            variant: "success",
          });
        }
      }
    } catch (error) {
      showToast(error instanceof Error ? error.message : String(error), { variant: "error" });
    } finally {
      setBusyId(null);
    }
  };

  const createWorkflow = async () => {
    const level = targetLevel;
    if (level === "project" && !selectedProjectPath) {
      showToast(t("settings.selectProjectFirst"), { variant: "error" });
      return;
    }
    const draft: WorkflowPackageInput = {
      name: "New workflow",
      description: "Describe when this workflow helps.",
      version: "1.0.0",
      body: "# New workflow\n\nWrite Nexus-native guidance here. This package cannot grant tools or permissions.\n",
      level,
      ...(level === "project" ? { projectPath: selectedProjectPath! } : {}),
      supportedModes: ["agent"],
      requiredCapabilities: ["core-agent-tools", "skill-loader"],
      priority: 50,
      defaultStage: "active",
      automatic: true,
      activationTerms: ["use", "workflow"],
      fixtures: [{ positivePrompt: "Use this workflow.", negativePrompt: "What is a workflow?", expectedStage: "active" }],
    };
    setWorkflowBusyId("create");
    try {
      const result = await api.createWorkflowPackage(draft);
      await load();
      showToast(`Workflow package ${result.workflow.name} created. Edit workflow.json and WORKFLOW.md in its package folder.`, { variant: "success" });
    } catch (error) {
      showToast(error instanceof Error ? error.message : String(error), { variant: "error" });
    } finally { setWorkflowBusyId(null); }
  };

  const toggleWorkflow = async (workflow: WorkflowPackageRecord) => {
    const key = `workflow:${workflow.id}`;
    setWorkflowBusyId(key);
    try { await api.setWorkflowPackageEnabled(workflow.id, !workflow.enabled, workflow.projectPath); await load(); }
    catch (error) { showToast(error instanceof Error ? error.message : String(error), { variant: "error" }); }
    finally { setWorkflowBusyId(null); }
  };

  const previewWorkflow = async (workflow: WorkflowPackageRecord) => {
    const key = `preview:${workflow.id}`;
    setWorkflowBusyId(key);
    try {
      const fixtures = await api.runWorkflowPackageFixtures(workflow.id, workflow.projectPath);
      const passed = fixtures.result.fixtures.every((fixture) => fixture.passed);
      showToast(passed ? `Workflow fixtures passed for ${workflow.name}.` : `Workflow fixtures need attention for ${workflow.name}.`, { variant: passed ? "success" : "error" });
    } catch (error) { showToast(error instanceof Error ? error.message : String(error), { variant: "error" }); }
    finally { setWorkflowBusyId(null); }
  };

  const visible = useMemo(() => {
    const match = (skill: Pick<UserSkillRecord, "name" | "id" | "description">) =>
      matchesCapabilitySearch(search, skill.name, skill.id, skill.description);
    return {
      builtin: builtinSkills.filter(match),
      global: globalSkills.filter(match),
      project: projectSkills.filter(match),
      workflows: workflowPackages.filter(match),
    };
  }, [builtinSkills, globalSkills, projectSkills, search]);

  const counts = {
    all: visible.builtin.length + visible.global.length + visible.project.length + visible.workflows.length,
    global: visible.global.length,
    project: visible.project.length,
  };

  const projectName = useMemo(
    () =>
      options.find((project) => project.path === selectedProjectPath)?.name ??
      (selectedProjectPath ? projectDisplayName(selectedProjectPath) : undefined),
    [options, selectedProjectPath],
  );

  const renderRow = (skill: UserSkillRecord, level: AgentCapabilityLevel) => {
    const key = rowKey(level, skill.id);
    const name = skill.name || skill.id;
    const busy = busyId === key;
    const isArmed = armed === key;
    const items: CapabilityMenuItem[] = [
      {
        key: "reveal",
        label: t("extensions.skills.reveal"),
        icon: <IconFolderOpen size={14} />,
        onSelect: () => {
          setMenuFor(null);
          void reveal(skill, level);
        },
      },
      {
        key: "remove",
        label: isArmed ? t("settings.capabilityRemoveConfirm") : t("extensions.skills.remove"),
        icon: <IconTrash size={14} />,
        danger: true,
        onSelect: () => {
          if (isArmed) {
            setMenuFor(null);
            void remove(skill, level);
          } else {
            setArmed(key);
          }
        },
      },
    ];
    return (
      <CapabilityRow
        key={key}
        glyph={<IconBookOpen size={16} />}
        name={name}
        off={!skill.enabled}
        menuOpen={menuFor === key}
        badges={
          <>
            <span className="agent-capability-badge is-level">
              {level === "global"
                ? t("settings.capabilityFilterGlobal")
                : t("settings.capabilityFilterProject")}
            </span>
            {skill.source === "imported" ? (
              <span className="agent-capability-badge">{t("settings.imported")}</span>
            ) : null}
          </>
        }
        description={skill.description || t("settings.noCapabilityDescription")}
        actions={
          <>
            <TooltipButton
              type="button"
              className="settings-icon-button"
              ariaLabel={t("extensions.skills.rowActions", { name })}
              tooltip={t("extensions.skills.edit")}
              disabled={busy}
              onClick={() => void openEdit(skill, level)}
            >
              <IconPencil size={15} />
            </TooltipButton>
            <CapabilityRowMenu
              label={t("extensions.skills.rowActions", { name })}
              items={items}
              disabled={busy}
              open={menuFor === key}
              onOpenChange={(open) => {
                setMenuFor(open ? key : null);
                if (!open) setArmed(null);
              }}
            />
            <CapabilityToggle
              checked={skill.enabled}
              busy={busy}
              label={t("settings.toggleCapability", { name })}
              onChange={() => void toggle(skill, level)}
            />
          </>
        }
      />
    );
  };

  const renderBuiltinRow = (skill: BuiltinSkillRecord) => {
    const key = `builtin:${skill.id}`;
    return (
      <CapabilityRow
        key={key}
        glyph={<IconBookOpen size={16} />}
        name={skill.name || skill.id}
        off={!skill.enabled}
        badges={<span className="agent-capability-badge">{t("settings.nexusSkillVersion", { version: skill.version })}</span>}
        description={skill.description || t("settings.noCapabilityDescription")}
        actions={
          <>
            <TooltipButton
              type="button"
              className="settings-icon-button"
              ariaLabel={t("settings.inspectNexusSkill", { name: skill.name || skill.id })}
              tooltip={t("settings.inspectNexusSkill", { name: skill.name || skill.id })}
              disabled={busyId === key}
              onClick={() => void inspectBuiltin(skill)}
            >
              <IconFileText size={15} />
            </TooltipButton>
            <CapabilityToggle
              checked={skill.enabled}
              busy={busyId === key}
              label={t("settings.toggleCapability", { name: skill.name || skill.id })}
              onChange={() => void toggleBuiltin(skill)}
            />
            {selectedProjectPath ? (
              <CapabilityRowMenu
                label="Project workflow setting"
                open={menuFor === `project-workflow:${skill.id}`}
                onOpenChange={(open) => setMenuFor(open ? `project-workflow:${skill.id}` : null)}
                items={[
                  { key: "enable", label: "Enable in this project", onSelect: () => void setBuiltinProjectOverride(skill, true) },
                  { key: "disable", label: "Disable in this project", onSelect: () => void setBuiltinProjectOverride(skill, false) },
                  { key: "inherit", label: "Use global setting", onSelect: () => void setBuiltinProjectOverride(skill, null) },
                ]}
              />
            ) : null}
          </>
        }
      />
    );
  };

  const renderWorkflowRow = (workflow: WorkflowPackageRecord) => (
    <CapabilityRow
      key={`workflow:${workflow.id}`}
      glyph={<IconBookOpen size={16} />}
      name={workflow.name}
      off={!workflow.enabled || workflow.compatibility.status !== "compatible"}
      badges={<><span className="agent-capability-badge">v{workflow.version}</span><span className="agent-capability-badge">{workflow.level}</span><span className="agent-capability-badge">{workflow.compatibility.status.replace("_", " ")}</span></>}
      description={workflow.description}
      actions={<>
        <TooltipButton type="button" className="settings-icon-button" ariaLabel={`Run fixtures for ${workflow.name}`} tooltip="Run activation fixtures" disabled={workflowBusyId !== null} onClick={() => void previewWorkflow(workflow)}><IconFileText size={15} /></TooltipButton>
        <TooltipButton type="button" className="settings-icon-button" ariaLabel={`Reveal ${workflow.name}`} tooltip="Reveal workflow package" disabled={workflowBusyId !== null} onClick={() => void api.revealWorkflowPackage(workflow.id, workflow.projectPath)}><IconFolderOpen size={15} /></TooltipButton>
        <CapabilityToggle checked={workflow.enabled} busy={workflowBusyId === `workflow:${workflow.id}`} label={t("settings.toggleCapability", { name: workflow.name })} onChange={() => void toggleWorkflow(workflow)} />
      </>}
    />
  );

  const showGlobal = filter !== "project";
  const showProject = filter !== "global";
  const newSkillTitle =
    targetLevel === "project"
      ? t("settings.capabilityCreateInProject")
      : t("settings.capabilityCreateInGlobal");
  const importButton = (level: AgentCapabilityLevel) => (
    <CapabilityButton
      busy={busyId === "import"}
      title={
        level === "project"
          ? t("settings.capabilityImportToProject")
          : t("settings.capabilityImportToGlobal")
      }
      onClick={() => void importSkill(level)}
    >
      <IconDownload size={14} />
      {t("settings.importSkill")}
    </CapabilityButton>
  );

  return (
    <AgentCapabilityPage
      description={t("settings.skillsDescription")}
      note={t("settings.capabilityPriority")}
      toolbar={
        <CapabilityToolbar
          filter={filter}
          onFilterChange={setFilter}
          counts={counts}
          search={search}
          onSearchChange={setSearch}
          searchPlaceholder={t("extensions.skills.searchPlaceholder")}
          projectPicker={
            <AgentProjectPicker
              value={selectedProjectPath}
              options={options}
              label={t("settings.selectProject")}
              onChange={setSelectedProjectPath}
            />
          }
          actions={
            <>
              <CapabilityButton variant="primary" title={newSkillTitle} onClick={openCreate}>
                <IconPlus size={14} />
                {t("settings.newSkill")}
              </CapabilityButton>
              <CapabilityButton title="Create a workflow package" busy={workflowBusyId === "create"} onClick={() => void createWorkflow()}>
                <IconPlus size={14} />
                New workflow
              </CapabilityButton>
            </>
          }
        />
      }
    >
      <CapabilityPanel
        loading={loading}
        refreshing={refreshing}
        loadingLabel={t("settings.loadingCapabilities")}
      >
        {counts.all === 0 && search.trim() ? (
          <CapabilityEmpty
            message={t("settings.capabilityNoMatches")}
            hint={t("settings.capabilityNoMatchesHint")}
            icon={<IconBookOpen size={18} />}
          />
        ) : (
          <>
            {filter !== "project" ? (
              <>
                <CapabilityGroupHeader
                  label={t("settings.nexusWorkflowSkills")}
                  path={t("settings.nexusWorkflowSkillsPath")}
                  count={visible.builtin.length}
                />
                {visible.builtin.map(renderBuiltinRow)}
              </>
            ) : null}
            {showGlobal ? (
              <>
                <CapabilityGroupHeader label="Workflow packages" path="~/.pi-desktop-nexus/agents/workflows" count={visible.workflows.filter((workflow) => workflow.level === "global").length} />
                {visible.workflows.filter((workflow) => workflow.level === "global").map(renderWorkflowRow)}
              </>
            ) : null}
            {showProject && selectedProjectPath ? (
              <>
                <CapabilityGroupHeader label="Project workflow packages" path={`${selectedProjectPath}/.agents/workflows`} count={visible.workflows.filter((workflow) => workflow.level === "project").length} />
                {visible.workflows.filter((workflow) => workflow.level === "project").map(renderWorkflowRow)}
              </>
            ) : null}
            {showGlobal ? (
              <>
                <CapabilityGroupHeader
                  label={t("settings.globalLevel")}
                  path={GLOBAL_SKILLS_PATH}
                  count={visible.global.length}
                  action={importButton("global")}
                />
                {visible.global.length === 0 ? (
                  <CapabilityEmpty
                    message={t("settings.skillsEmpty")}
                    icon={<IconBookOpen size={18} />}
                    action={
                      <CapabilityButton variant="primary" onClick={openCreate}>
                        <IconPlus size={14} />
                        {t("extensions.skills.add")}
                      </CapabilityButton>
                    }
                  />
                ) : (
                  visible.global.map((skill) => renderRow(skill, "global"))
                )}
              </>
            ) : null}
            {showProject ? (
              <>
                <CapabilityGroupHeader
                  label={t("settings.projectLevel")}
                  path={projectSkillsPath(selectedProjectPath)}
                  count={visible.project.length}
                  action={selectedProjectPath ? importButton("project") : undefined}
                />
                {!selectedProjectPath ? (
                  <CapabilityEmpty message={t("settings.selectProjectFirst")} />
                ) : visible.project.length === 0 ? (
                  <CapabilityEmpty
                    message={t("settings.skillsEmpty")}
                    icon={<IconBookOpen size={18} />}
                  />
                ) : (
                  visible.project.map((skill) => renderRow(skill, "project"))
                )}
              </>
            ) : null}
          </>
        )}
      </CapabilityPanel>

      {editor ? (
        <SkillEditorSheet
          draft={editor.draft}
          setDraft={(draft) => setEditor((current) => (current ? { ...current, draft } : current))}
          editing={editor.editing}
          saving={saving}
          level={editor.level}
          projectName={projectName}
          onClose={() => {
            if (!saving) setEditor(null);
          }}
          onSave={() => void save()}
          onReveal={
            editor.editing
              ? () => void reveal(editor.editing!, editor.level)
              : undefined
          }
        />
      ) : null}
      {builtinViewer ? (
        <BuiltinSkillViewer
          {...builtinViewer}
          onClose={() => setBuiltinViewer(null)}
        />
      ) : null}
    </AgentCapabilityPage>
  );
}
