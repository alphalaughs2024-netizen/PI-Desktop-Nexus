import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Mode } from "@pi-desktop/shared";

/** Capability labels are host facts, not permissions or model-granted tools. */
export const WORKFLOW_CAPABILITIES = [
  "core-agent-tools",
  "skill-loader",
  "plugin-development-tools",
  "file-tools",
  "terminal-tools",
  "test-execution",
] as const;
export type WorkflowCapability = (typeof WORKFLOW_CAPABILITIES)[number];
export type WorkflowStage =
  | "active"
  | "discovery"
  | "diagnosis"
  | "implementation"
  | "verification"
  | "proposed_design"
  | "approved_plan"
  | "executing"
  | "verified"
  | "paused";
export type WorkflowReasonCategory =
  | "core_operations"
  | "plugin_workspace"
  | "plugin_authoring_request"
  | "feature_request"
  | "approved_implementation"
  | "reproducible_failure"
  | "diagnosed_fix"
  | "completion_verification"
  | "plan_mode"
  | "plan_proposed"
  | "plan_approved"
  | "plan_execution_completed"
  | "plan_execution_paused"
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
  fixtures: readonly {
    positivePrompt: string;
    negativePrompt: string;
    expectedStage: WorkflowStage;
  }[];
};

export const AGENT_OPERATIONS_WORKFLOW_ID = "nexus/guidance/agent-operations";
export const PLUGIN_DEVELOPMENT_WORKFLOW_ID = "nexus/guidance/plugin-development";
export const BRAINSTORMING_WORKFLOW_ID = "nexus/quality/brainstorming";
export const SYSTEMATIC_DEBUGGING_WORKFLOW_ID = "nexus/quality/systematic-debugging";
export const TEST_DRIVEN_DEVELOPMENT_WORKFLOW_ID = "nexus/quality/test-driven-development";
export const VERIFICATION_WORKFLOW_ID = "nexus/quality/verification-before-completion";
export const WRITING_PLANS_WORKFLOW_ID = "nexus/planning/writing-plans";
export const EXECUTING_PLANS_WORKFLOW_ID = "nexus/planning/executing-plans";

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
    fixtures: [{ positivePrompt: "Inspect this workspace safely.", negativePrompt: "What are Nexus operations?", expectedStage: "active" }],
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
    fixtures: [{ positivePrompt: "Create a Nexus plugin.", negativePrompt: "What are Nexus plugins?", expectedStage: "active" }],
  },
  {
    id: BRAINSTORMING_WORKFLOW_ID,
    version: "1",
    name: "Discovery and design",
    description: "Clarify a requested feature, inspect the relevant workspace, and present a bounded design before implementation.",
    skillFile: "brainstorming.md",
    supportedModes: ["agent", "plan", "goal"],
    requiredCapabilities: ["core-agent-tools", "skill-loader", "file-tools"],
    priority: 80,
    defaultStage: "discovery",
    fixtures: [{ positivePrompt: "Add a project activity feed.", negativePrompt: "What is product discovery?", expectedStage: "discovery" }],
  },
  {
    id: SYSTEMATIC_DEBUGGING_WORKFLOW_ID,
    version: "1",
    name: "Systematic debugging",
    description: "Reproduce an observed failure, gather evidence, isolate root cause, and then test one focused fix.",
    skillFile: "systematic-debugging.md",
    supportedModes: ["agent", "plan", "goal"],
    requiredCapabilities: ["core-agent-tools", "skill-loader", "file-tools", "terminal-tools"],
    priority: 90,
    defaultStage: "diagnosis",
    fixtures: [{ positivePrompt: "This test fails every time with ECONNREFUSED.", negativePrompt: "Explain debugging techniques.", expectedStage: "diagnosis" }],
  },
  {
    id: TEST_DRIVEN_DEVELOPMENT_WORKFLOW_ID,
    version: "1",
    name: "Test-first implementation",
    description: "Express the intended change with a focused failing test before making the smallest implementation change.",
    skillFile: "test-driven-development.md",
    supportedModes: ["agent"],
    requiredCapabilities: ["core-agent-tools", "skill-loader", "file-tools", "terminal-tools", "test-execution"],
    priority: 85,
    defaultStage: "implementation",
    fixtures: [{ positivePrompt: "Implement the approved design now.", negativePrompt: "What is test-driven development?", expectedStage: "implementation" }],
  },
  {
    id: VERIFICATION_WORKFLOW_ID,
    version: "1",
    name: "Verification before completion",
    description: "Select and run fresh, relevant checks before claiming a change is fixed, complete, or passing.",
    skillFile: "verification-before-completion.md",
    supportedModes: ["agent", "plan", "goal"],
    requiredCapabilities: ["core-agent-tools", "skill-loader", "terminal-tools", "test-execution"],
    priority: 95,
    defaultStage: "verification",
    fixtures: [{ positivePrompt: "Verify this fix before marking it complete.", negativePrompt: "Discuss verification strategies.", expectedStage: "verification" }],
  },
  {
    id: WRITING_PLANS_WORKFLOW_ID,
    version: "1",
    name: "Plan authoring",
    description: "Inspect the workspace and submit a concrete implementation plan through Nexus Plan mode for explicit approval.",
    skillFile: "writing-plans.md",
    supportedModes: ["plan"],
    requiredCapabilities: ["core-agent-tools", "skill-loader", "file-tools", "terminal-tools"],
    priority: 95,
    defaultStage: "proposed_design",
    fixtures: [{ positivePrompt: "Create an implementation plan for the approved design.", negativePrompt: "What is an implementation plan?", expectedStage: "proposed_design" }],
  },
  {
    id: EXECUTING_PLANS_WORKFLOW_ID,
    version: "1",
    name: "Plan execution",
    description: "Carry out a host-approved plan, retain its current lifecycle stage, and verify the completed work.",
    skillFile: "executing-plans.md",
    supportedModes: ["agent"],
    requiredCapabilities: ["core-agent-tools", "skill-loader", "file-tools", "terminal-tools", "test-execution"],
    priority: 96,
    defaultStage: "executing",
    fixtures: [{ positivePrompt: "Execute the approved Nexus plan.", negativePrompt: "How does plan execution work?", expectedStage: "executing" }],
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
  /** Small stable instruction derived from host lifecycle state, never plan text. */
  nextAction?: string;
};

export type WorkflowResolutionInput = {
  prompt?: unknown;
  mode: Mode;
  workspace: { isPluginWorkspace: boolean };
  capabilities: readonly string[];
  globalDisabledIds: readonly string[];
  projectOverrides: Record<string, boolean>;
  session: WorkflowSessionRecord;
};

export type ResolvedWorkflow = {
  id: string;
  name: string;
  version: string;
  stage: WorkflowStage;
  source: WorkflowActivationSource;
  reasonCategory: WorkflowReasonCategory;
  nextAction?: string;
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
  if (!manifest.version?.trim() || !manifest.name?.trim() || !manifest.description?.trim() || !manifest.skillFile?.trim() || !Array.isArray(manifest.fixtures) || manifest.fixtures.length === 0) {
    return { ok: false, error: "missing required metadata" };
  }
  if (!Array.isArray(manifest.supportedModes) || manifest.supportedModes.length === 0 || manifest.supportedModes.some((mode) => !["agent", "plan", "goal"].includes(mode))) {
    return { ok: false, error: "invalid supportedModes" };
  }
  if (!Array.isArray(manifest.requiredCapabilities) || manifest.requiredCapabilities.some((capability) => !WORKFLOW_CAPABILITIES.includes(capability as WorkflowCapability))) {
    return { ok: false, error: "invalid requiredCapabilities" };
  }
  if (!Number.isFinite(manifest.priority) || ![
    "active", "discovery", "diagnosis", "implementation", "verification",
    "proposed_design", "approved_plan", "executing", "verified", "paused",
  ].includes(manifest.defaultStage ?? "")) {
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
  if (manifest.id === BRAINSTORMING_WORKFLOW_ID && isFeatureRequest(input.prompt)) return "feature_request";
  if (manifest.id === SYSTEMATIC_DEBUGGING_WORKFLOW_ID && isReproducibleFailure(input.prompt)) return "reproducible_failure";
  if (manifest.id === TEST_DRIVEN_DEVELOPMENT_WORKFLOW_ID) {
    if (input.session.primaryId === BRAINSTORMING_WORKFLOW_ID && input.session.stage === "discovery" && isApprovedImplementationRequest(input.prompt)) return "approved_implementation";
    if (input.session.primaryId === SYSTEMATIC_DEBUGGING_WORKFLOW_ID && input.session.stage === "diagnosis" && isFixRequest(input.prompt)) return "diagnosed_fix";
  }
  if (
    manifest.id === WRITING_PLANS_WORKFLOW_ID &&
    input.mode === "plan" &&
    !(input.session.primaryId === EXECUTING_PLANS_WORKFLOW_ID && input.session.stage === "paused") &&
    input.session.primaryId !== WRITING_PLANS_WORKFLOW_ID
  ) return "plan_mode";
  // Approval switches the durable session to Agent before the runner starts.
  // Select execution guidance for that handoff even if the asynchronous host
  // notification has not arrived in Electron yet.
  if (
    manifest.id === EXECUTING_PLANS_WORKFLOW_ID &&
    input.mode === "agent" &&
    input.session.primaryId === WRITING_PLANS_WORKFLOW_ID &&
    input.session.stage === "approved_plan"
  ) return "plan_approved";
  if (manifest.id === VERIFICATION_WORKFLOW_ID && isCompletionVerificationRequest(input.prompt, input.session)) return "completion_verification";
  return undefined;
}

const PLAN_NEXT_ACTIONS: Record<Extract<WorkflowStage, "proposed_design" | "approved_plan" | "executing" | "verified" | "paused">, string> = {
  proposed_design: "Inspect the workspace and submit a concrete plan proposal for approval.",
  approved_plan: "The plan is approved; wait for Nexus to start its host-owned execution.",
  executing: "Continue the approved plan and verify each completed task.",
  verified: "Review the completed plan against its requested outcome and report the evidence.",
  paused: "Review the interrupted execution and resume only through a new approved plan.",
};

/**
 * Translate durable host-plan events into workflow state. Plan content is
 * deliberately absent: the immutable host artifact remains the source of truth.
 */
export function transitionPlanWorkflowSession(
  session: WorkflowSessionRecord,
  event: "proposed" | "approved" | "executing" | "verified" | "paused",
): WorkflowSessionRecord {
  const now = new Date().toISOString();
  const stageByEvent: Record<typeof event, WorkflowStage> = {
    proposed: "proposed_design",
    approved: "approved_plan",
    executing: "executing",
    verified: "verified",
    paused: "paused",
  };
  const stage = stageByEvent[event];
  const primaryId = event === "executing" || event === "verified" || event === "paused"
    ? EXECUTING_PLANS_WORKFLOW_ID
    : WRITING_PLANS_WORKFLOW_ID;
  const reasonCategory: WorkflowReasonCategory = event === "proposed"
    ? "plan_proposed"
    : event === "approved" || event === "executing"
      ? "plan_approved"
      : event === "verified"
        ? "plan_execution_completed"
        : "plan_execution_paused";
  return {
    ...session,
    primaryId,
    stage,
    source: "automatic",
    reasonCategory,
    nextAction: PLAN_NEXT_ACTIONS[stage as keyof typeof PLAN_NEXT_ACTIONS],
    activatedAt: session.primaryId === primaryId ? session.activatedAt ?? now : now,
    updatedAt: now,
  };
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

/** A feature request names a prospective change; generic explanations do not. */
export function isFeatureRequest(value: unknown): boolean {
  const prompt = text(value);
  if (!prompt || /\b(?:what is|explain|discuss|tell me about|should we use)\b/.test(prompt)) return false;
  return /\b(?:add|create|build|implement|introduce|redesign|change)\b/.test(prompt) &&
    /\b(?:feature|screen|page|panel|workflow|button|setting|support|integration|ability|feed|endpoint|command|ui|system)\b/.test(prompt) &&
    !isPluginAuthoringWorkflowRequest(prompt);
}

/** Require an actual observed failure, not a request to explain debugging. */
export function isReproducibleFailure(value: unknown): boolean {
  const prompt = text(value);
  if (!prompt || /\b(?:what is|explain|discuss|technique|tutorial)\b/.test(prompt)) return false;
  return /\b(?:fails?|failing|failed|error|exception|crash(?:es|ed)?|broken|regression|does not work|won't start|cannot connect|refused)\b/.test(prompt) &&
    /\b(?:test|app|build|plugin|screen|request|command|every time|reproduc|error|exception|crash|bug)\b/.test(prompt);
}

function isApprovedImplementationRequest(value: unknown): boolean {
  const prompt = text(value);
  return /\b(?:yes|approved|go ahead|proceed|implement|build|start)\b/.test(prompt) &&
    /\b(?:implement|build|start|approved|design|plan|it|this)\b/.test(prompt);
}

function isFixRequest(value: unknown): boolean {
  return /\b(?:fix|implement|apply|make the change|go ahead|proceed)\b/.test(text(value));
}

function isCompletionVerificationRequest(value: unknown, session: WorkflowSessionRecord): boolean {
  const prompt = text(value);
  if (!prompt || /\b(?:what is|explain|discuss)\b/.test(prompt)) return false;
  const hasCompletionIntent = /\b(?:complete|completion|finish|finished|done|ship|ready|mark (?:it )?complete)\b/.test(prompt);
  const asksForEvidence = /\b(?:verify|verification|test|check|validate|confirm)\b/.test(prompt);
  return (hasCompletionIntent || asksForEvidence) &&
    [TEST_DRIVEN_DEVELOPMENT_WORKFLOW_ID, SYSTEMATIC_DEBUGGING_WORKFLOW_ID, PLUGIN_DEVELOPMENT_WORKFLOW_ID].includes(session.primaryId ?? "");
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
  const automaticCandidates = compatible.filter((manifest) => automaticReason(manifest, input));
  // Operations is baseline supporting guidance, not a stage transition. It
  // must not displace a persisted quality or plan lifecycle workflow on an
  // ordinary follow-up prompt.
  const triggeredCandidates = automaticCandidates.filter(
    (manifest) => manifest.id !== AGENT_OPERATIONS_WORKFLOW_ID,
  );
  const persisted = !manuallySelected && triggeredCandidates.length === 0 && input.session.primaryId
    ? compatible.find((manifest) => manifest.id === input.session.primaryId)
    : undefined;
  const candidates = (manuallySelected
    ? [manuallySelected]
    : triggeredCandidates.length
      ? triggeredCandidates
      : persisted
        ? [persisted]
        : automaticCandidates)
    .sort((left, right) => right.priority - left.priority || left.id.localeCompare(right.id));
  const primaryManifest = candidates[0];
  if (!primaryManifest) return { supportingIds: [], availableIds, unavailable };
  const source: WorkflowActivationSource = manuallySelected
    ? "manual"
    : persisted
      ? input.session.source ?? "automatic"
      : "automatic";
  const reasonCategory = manuallySelected
    ? "manual"
    : persisted
      ? input.session.reasonCategory ?? "core_operations"
      : automaticReason(primaryManifest, input)!;
  const stage = persisted ? input.session.stage ?? primaryManifest.defaultStage : primaryManifest.defaultStage;
  const nextAction = persisted
    ? input.session.nextAction
    : primaryManifest.id === WRITING_PLANS_WORKFLOW_ID
      ? PLAN_NEXT_ACTIONS.proposed_design
      : undefined;
  const supportingIds = compatible
    .filter((manifest) => manifest.id !== primaryManifest.id && manifest.id === AGENT_OPERATIONS_WORKFLOW_ID)
    .map((manifest) => manifest.id);
  return {
    primary: {
      id: primaryManifest.id,
      name: primaryManifest.name,
      version: primaryManifest.version,
      stage,
      source,
      reasonCategory,
      ...(nextAction ? { nextAction } : {}),
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
    ...(typeof raw.nextAction === "string" ? { nextAction: raw.nextAction } : {}),
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
    ...(resolution.primary?.nextAction ? { nextAction: resolution.primary.nextAction } : {}),
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
