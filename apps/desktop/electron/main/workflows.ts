import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Mode } from "@pi-desktop/shared";

/** Capability labels are host facts, not permissions or model-granted tools. */
export const WORKFLOW_CAPABILITIES = [
  "core-agent-tools",
  "skill-loader",
  "plugin-development-tools",
] as const;
export type WorkflowCapability = (typeof WORKFLOW_CAPABILITIES)[number];
export type WorkflowStage = "active" | "discovery" | "diagnosis" | "implementation" | "verification";
export type WorkflowReasonCategory =
  | "core_operations"
  | "plugin_workspace"
  | "plugin_authoring_request"
  | "manual";
export type WorkflowActivationSource = "automatic" | "manual";

export type WorkflowManifest = {
  id: string;
  version: string;
  name: string;
  description: string;
  skillFile: string;
  supportedModes: Mode[];
  requiredCapabilities: WorkflowCapability[];
  priority: number;
  defaultStage: WorkflowStage;
};

export const AGENT_OPERATIONS_WORKFLOW_ID = "nexus/guidance/agent-operations";
export const PLUGIN_DEVELOPMENT_WORKFLOW_ID = "nexus/guidance/plugin-development";

export const WORKFLOW_MANIFESTS: readonly WorkflowManifest[] = [
  {
    id: AGENT_OPERATIONS_WORKFLOW_ID,
    version: "1",
    name: "Nexus agent operations",
    description: "Nexus-native guidance for safe inspection, editing, preview, shell, and delegation work.",
    skillFile: "agent-operations.md",
    supportedModes: ["agent", "plan", "goal"],
    requiredCapabilities: ["core-agent-tools", "skill-loader"],
    priority: 10,
    defaultStage: "active",
  },
  {
    id: PLUGIN_DEVELOPMENT_WORKFLOW_ID,
    version: "1",
    name: "Nexus plugin development",
    description: "Nexus-native workflow for creating, validating, and packaging a plugin.",
    skillFile: "plugin-development.md",
    supportedModes: ["agent", "plan"],
    requiredCapabilities: ["core-agent-tools", "skill-loader", "plugin-development-tools"],
    priority: 100,
    defaultStage: "active",
  },
] as const;

export type WorkflowSessionOverride = {
  manualActiveId?: string;
  dismissedIds?: string[];
};

export type WorkflowSessionRecord = WorkflowSessionOverride & {
  primaryId?: string;
  supportingIds?: string[];
  stage?: WorkflowStage;
  source?: WorkflowActivationSource;
  reasonCategory?: WorkflowReasonCategory;
  activatedAt?: string;
  updatedAt?: string;
};

export type WorkflowResolutionInput = {
  prompt?: unknown;
  mode: Mode;
  workspace: { isPluginWorkspace: boolean };
  capabilities: readonly string[];
  globalDisabledIds: readonly string[];
  projectOverrides: Record<string, boolean>;
  session: WorkflowSessionOverride;
};

export type ResolvedWorkflow = {
  id: string;
  name: string;
  version: string;
  stage: WorkflowStage;
  source: WorkflowActivationSource;
  reasonCategory: WorkflowReasonCategory;
};

export type WorkflowResolution = {
  primary?: ResolvedWorkflow;
  supportingIds: string[];
  availableIds: string[];
  unavailable: Array<{ id: string; reason: "disabled" | "unsupported_capability" | "unsupported_mode" | "dismissed" }>;
};

export function validateWorkflowManifest(value: unknown): { ok: boolean; error?: string } {
  if (!value || typeof value !== "object") return { ok: false, error: "manifest must be an object" };
  const manifest = value as Partial<WorkflowManifest>;
  if (!/^nexus\/[a-z0-9][a-z0-9/_-]*$/i.test(manifest.id ?? "")) return { ok: false, error: "invalid id" };
  if (!manifest.version?.trim() || !manifest.name?.trim() || !manifest.description?.trim() || !manifest.skillFile?.trim()) {
    return { ok: false, error: "missing required metadata" };
  }
  if (!Array.isArray(manifest.supportedModes) || manifest.supportedModes.length === 0 || manifest.supportedModes.some((mode) => !["agent", "plan", "goal"].includes(mode))) {
    return { ok: false, error: "invalid supportedModes" };
  }
  if (!Array.isArray(manifest.requiredCapabilities) || manifest.requiredCapabilities.some((capability) => !WORKFLOW_CAPABILITIES.includes(capability as WorkflowCapability))) {
    return { ok: false, error: "invalid requiredCapabilities" };
  }
  if (!Number.isFinite(manifest.priority) || !["active", "discovery", "diagnosis", "implementation", "verification"].includes(manifest.defaultStage ?? "")) {
    return { ok: false, error: "invalid priority or stage" };
  }
  return { ok: true };
}

/** Keep generic plugin questions out of the authoring workflow. */
export function isPluginAuthoringWorkflowRequest(content: unknown): boolean {
  return typeof content === "string" && /\b(?:create|scaffold|build|develop|debug|validate|check|package|pack)\b[\s\S]{0,64}\bplugins?\b/i.test(content);
}

function enabled(manifest: WorkflowManifest, input: WorkflowResolutionInput): boolean {
  if (input.session.dismissedIds?.includes(manifest.id)) return false;
  if (Object.hasOwn(input.projectOverrides, manifest.id)) return input.projectOverrides[manifest.id] === true;
  return !input.globalDisabledIds.includes(manifest.id);
}

function unavailableReason(manifest: WorkflowManifest, input: WorkflowResolutionInput): WorkflowResolution["unavailable"][number]["reason"] | undefined {
  if (input.session.dismissedIds?.includes(manifest.id)) return "dismissed";
  if (!enabled(manifest, input)) return "disabled";
  if (!manifest.supportedModes.includes(input.mode)) return "unsupported_mode";
  if (manifest.requiredCapabilities.some((capability) => !input.capabilities.includes(capability))) return "unsupported_capability";
  return undefined;
}

function automaticReason(manifest: WorkflowManifest, input: WorkflowResolutionInput): WorkflowReasonCategory | undefined {
  if (manifest.id === AGENT_OPERATIONS_WORKFLOW_ID) return "core_operations";
  if (manifest.id === PLUGIN_DEVELOPMENT_WORKFLOW_ID) {
    if (input.workspace.isPluginWorkspace) return "plugin_workspace";
    if (isPluginAuthoringWorkflowRequest(input.prompt)) return "plugin_authoring_request";
  }
  return undefined;
}

export function resolveWorkflows(input: WorkflowResolutionInput): WorkflowResolution {
  const unavailable: WorkflowResolution["unavailable"] = [];
  const compatible = WORKFLOW_MANIFESTS.filter((manifest) => {
    const reason = unavailableReason(manifest, input);
    if (reason) {
      unavailable.push({ id: manifest.id, reason });
      return false;
    }
    return true;
  });
  const availableIds = compatible.map((manifest) => manifest.id);
  const manuallySelected = input.session.manualActiveId
    ? compatible.find((manifest) => manifest.id === input.session.manualActiveId)
    : undefined;
  const candidates = (manuallySelected ? [manuallySelected] : compatible.filter((manifest) => automaticReason(manifest, input)))
    .sort((left, right) => right.priority - left.priority || left.id.localeCompare(right.id));
  const primaryManifest = candidates[0];
  if (!primaryManifest) return { supportingIds: [], availableIds, unavailable };
  const source: WorkflowActivationSource = manuallySelected ? "manual" : "automatic";
  const reasonCategory = manuallySelected ? "manual" : automaticReason(primaryManifest, input)!;
  const supportingIds = compatible
    .filter((manifest) => manifest.id !== primaryManifest.id && manifest.id === AGENT_OPERATIONS_WORKFLOW_ID)
    .map((manifest) => manifest.id);
  return {
    primary: {
      id: primaryManifest.id,
      name: primaryManifest.name,
      version: primaryManifest.version,
      stage: primaryManifest.defaultStage,
      source,
      reasonCategory,
    },
    supportingIds,
    availableIds,
    unavailable,
  };
}

function workflowRoot(dataDir: string) {
  return join(dataDir, "agent-capabilities", "workflows");
}
function sessionPath(dataDir: string, sessionId: string) {
  return join(workflowRoot(dataDir), "sessions", `${sessionId}.json`);
}
function projectPath(dataDir: string, project: string) {
  const digest = createHash("sha256").update(project).digest("hex").slice(0, 24);
  return join(workflowRoot(dataDir), "projects", `${digest}.json`);
}
function legacyBuiltinSettingsPath(dataDir: string) {
  return join(dataDir, "agent-capabilities", "builtin-skills.json");
}
function readJson(path: string): Record<string, unknown> {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
  } catch {
    return {};
  }
}
function writeJson(path: string, value: Record<string, unknown>) {
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, JSON.stringify(value, null, 2), "utf8");
}

export function globalDisabledWorkflowIds(dataDir: string): string[] {
  const raw = readJson(legacyBuiltinSettingsPath(dataDir)).disabled;
  return Array.isArray(raw) ? raw.filter((id): id is string => typeof id === "string") : [];
}

export function projectWorkflowOverrides(dataDir: string, project?: string | null): Record<string, boolean> {
  if (!project?.trim()) return {};
  const raw = readJson(projectPath(dataDir, project)).overrides;
  if (!raw || typeof raw !== "object") return {};
  return Object.fromEntries(Object.entries(raw).filter(([, value]) => typeof value === "boolean")) as Record<string, boolean>;
}

export function setProjectWorkflowEnabled(dataDir: string, project: string, id: string, enabled: boolean | null): void {
  if (!WORKFLOW_MANIFESTS.some((manifest) => manifest.id === id)) throw new Error("Workflow not found");
  if (!project.trim()) throw new Error("Project path required");
  const path = projectPath(dataDir, project);
  const current = projectWorkflowOverrides(dataDir, project);
  if (enabled === null) delete current[id]; else current[id] = enabled;
  writeJson(path, { projectPath: project, overrides: current });
}

export function loadWorkflowSession(dataDir: string, sessionId: string): WorkflowSessionRecord {
  const raw = readJson(sessionPath(dataDir, sessionId));
  return {
    ...(typeof raw.manualActiveId === "string" ? { manualActiveId: raw.manualActiveId } : {}),
    ...(Array.isArray(raw.dismissedIds) ? { dismissedIds: raw.dismissedIds.filter((id): id is string => typeof id === "string") } : {}),
    ...(typeof raw.primaryId === "string" ? { primaryId: raw.primaryId } : {}),
    ...(Array.isArray(raw.supportingIds) ? { supportingIds: raw.supportingIds.filter((id): id is string => typeof id === "string") } : {}),
    ...(typeof raw.stage === "string" ? { stage: raw.stage as WorkflowStage } : {}),
    ...(raw.source === "automatic" || raw.source === "manual" ? { source: raw.source } : {}),
    ...(typeof raw.reasonCategory === "string" ? { reasonCategory: raw.reasonCategory as WorkflowReasonCategory } : {}),
    ...(typeof raw.activatedAt === "string" ? { activatedAt: raw.activatedAt } : {}),
    ...(typeof raw.updatedAt === "string" ? { updatedAt: raw.updatedAt } : {}),
  };
}

export function saveWorkflowResolution(dataDir: string, sessionId: string, session: WorkflowSessionRecord, resolution: WorkflowResolution): WorkflowSessionRecord {
  const now = new Date().toISOString();
  const previousPrimary = session.primaryId;
  const next: WorkflowSessionRecord = {
    ...(session.manualActiveId ? { manualActiveId: session.manualActiveId } : {}),
    ...(session.dismissedIds?.length ? { dismissedIds: [...new Set(session.dismissedIds)].sort() } : {}),
    ...(resolution.primary ? { primaryId: resolution.primary.id, stage: resolution.primary.stage, source: resolution.primary.source, reasonCategory: resolution.primary.reasonCategory } : {}),
    ...(resolution.supportingIds.length ? { supportingIds: resolution.supportingIds } : {}),
    ...(resolution.primary ? { activatedAt: previousPrimary === resolution.primary.id ? session.activatedAt ?? now : now } : {}),
    updatedAt: now,
  };
  writeJson(sessionPath(dataDir, sessionId), next);
  return next;
}

export function setWorkflowSessionOverride(dataDir: string, sessionId: string, patch: WorkflowSessionOverride): WorkflowSessionRecord {
  const current = loadWorkflowSession(dataDir, sessionId);
  const next: WorkflowSessionRecord = { ...current, ...patch, updatedAt: new Date().toISOString() };
  if (!next.manualActiveId) delete next.manualActiveId;
  if (!next.dismissedIds?.length) delete next.dismissedIds;
  writeJson(sessionPath(dataDir, sessionId), next);
  return next;
}

export function clearWorkflowSession(dataDir: string, sessionId: string): void {
  const path = sessionPath(dataDir, sessionId);
  if (existsSync(path)) unlinkSync(path);
}
