import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Mode } from "@pi-desktop/shared";
import { WORKFLOW_CAPABILITIES, type WorkflowCapability, type WorkflowStage } from "./workflows";
import type { WorkflowManifest } from "./workflows";

export const WORKFLOW_PACKAGE_FORMAT_VERSION = 1;
const WORKFLOW_BODY_FILE = "WORKFLOW.md";
const WORKFLOW_MANIFEST_FILE = "workflow.json";
const ALL_CAPABILITIES = [...WORKFLOW_CAPABILITIES];
const STAGES: readonly WorkflowStage[] = [
  "active", "discovery", "diagnosis", "implementation", "verification",
  "proposed_design", "approved_plan", "executing", "verified", "paused",
  "isolation", "integration", "review_requested", "review_feedback", "parallelizing", "delegated_execution",
];

export type WorkflowPackageLevel = "global" | "project";
export type WorkflowPackageFixture = { positivePrompt: string; negativePrompt: string; expectedStage: WorkflowStage };
export type WorkflowPackageManifest = {
  formatVersion: number;
  id: string;
  version: string;
  name: string;
  description: string;
  instructionFile: typeof WORKFLOW_BODY_FILE;
  supportedModes: Mode[];
  requiredCapabilities: WorkflowCapability[];
  priority: number;
  defaultStage: WorkflowStage;
  automatic: boolean;
  /** Literal normalized words only. Package metadata never runs code or regex. */
  activationTerms: string[];
  fixtures: WorkflowPackageFixture[];
  enabled: boolean;
};
export type WorkflowPackageInput = Omit<WorkflowPackageManifest, "formatVersion" | "id" | "instructionFile"> & {
  id?: string;
  body: string;
  level?: WorkflowPackageLevel;
  projectPath?: string;
};
export type WorkflowPackageRecord = Pick<WorkflowPackageManifest, "id" | "version" | "name" | "description" | "supportedModes" | "requiredCapabilities" | "priority" | "defaultStage" | "enabled"> & {
  level: WorkflowPackageLevel;
  projectPath?: string;
  path: string;
  compatibility: { status: "compatible" | "upgrade_required" | "unsupported"; message: string };
};

function root(dataDir: string, level: WorkflowPackageLevel, projectPath?: string): string {
  if (level === "project") {
    if (!projectPath?.trim()) throw new Error("Project path required");
    return join(projectPath, ".agents", "workflows");
  }
  return join(dataDir, "agents", "workflows");
}

function slug(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48);
}

function packageName(id: string): string {
  return id.split("/").at(-1) ?? "";
}

function idFor(input: WorkflowPackageInput): string {
  const level = input.level ?? "global";
  const raw = (input.id ?? slug(input.name)).trim().toLowerCase();
  const namespace = level === "project" ? "project" : "user";
  return raw.includes("/") ? raw : `${namespace}/${raw}`;
}

function validTerms(value: unknown): value is string[] {
  return Array.isArray(value) && value.length > 0 && value.every((term) =>
    typeof term === "string" && /^[a-z0-9][a-z0-9 -]{1,47}$/i.test(term.trim()),
  );
}

export function validateWorkflowPackageInput(value: unknown): { ok: boolean; error?: string } {
  if (!value || typeof value !== "object") return { ok: false, error: "workflow package must be an object" };
  const input = value as Partial<WorkflowPackageInput>;
  const level = input.level ?? "global";
  if (level !== "global" && level !== "project") return { ok: false, error: "invalid package level" };
  if (level === "project" && !input.projectPath?.trim()) return { ok: false, error: "project path required" };
  const id = idFor(input as WorkflowPackageInput);
  if (!/^(?:user|project)\/[a-z0-9][a-z0-9-]{0,47}$/.test(id)) return { ok: false, error: "workflow id must use the user/ or project/ namespace" };
  if ((level === "global" && !id.startsWith("user/")) || (level === "project" && !id.startsWith("project/"))) return { ok: false, error: "workflow id namespace must match package level" };
  if (!input.version?.trim() || !input.name?.trim() || !input.description?.trim() || !input.body?.trim()) return { ok: false, error: "missing required metadata" };
  if (!/^\d+\.\d+\.\d+(?:[-+][a-z0-9.-]+)?$/i.test(input.version.trim())) return { ok: false, error: "version must use semantic version format" };
  if (!Array.isArray(input.supportedModes) || input.supportedModes.length === 0 || input.supportedModes.some((mode) => !["agent", "plan", "goal"].includes(mode))) return { ok: false, error: "invalid supported modes" };
  if (!Array.isArray(input.requiredCapabilities) || input.requiredCapabilities.some((capability) => !WORKFLOW_CAPABILITIES.includes(capability as WorkflowCapability))) return { ok: false, error: "unknown required capability" };
  if (!Number.isFinite(input.priority) || input.priority! < 0 || input.priority! > 100) return { ok: false, error: "priority must be between 0 and 100" };
  if (!STAGES.includes(input.defaultStage as WorkflowStage)) return { ok: false, error: "invalid workflow stage" };
  if (typeof input.automatic !== "boolean" || !validTerms(input.activationTerms)) return { ok: false, error: "automatic activation requires literal activation terms" };
  if (!Array.isArray(input.fixtures) || input.fixtures.length === 0 || input.fixtures.some((fixture) => !fixture || typeof fixture.positivePrompt !== "string" || !fixture.positivePrompt.trim() || typeof fixture.negativePrompt !== "string" || !fixture.negativePrompt.trim() || !STAGES.includes(fixture.expectedStage))) return { ok: false, error: "invalid workflow fixtures" };
  return { ok: true };
}

function asManifest(input: WorkflowPackageInput): WorkflowPackageManifest {
  return {
    formatVersion: WORKFLOW_PACKAGE_FORMAT_VERSION,
    id: idFor(input),
    version: input.version.trim(),
    name: input.name.trim(),
    description: input.description.trim(),
    instructionFile: WORKFLOW_BODY_FILE,
    supportedModes: [...input.supportedModes],
    requiredCapabilities: [...input.requiredCapabilities],
    priority: input.priority,
    defaultStage: input.defaultStage,
    automatic: input.automatic,
    activationTerms: input.activationTerms.map((term) => term.trim().toLowerCase()),
    fixtures: input.fixtures.map((fixture) => ({ ...fixture })),
    enabled: input.enabled !== false,
  };
}

function compatibility(manifest: Partial<WorkflowPackageManifest>): WorkflowPackageRecord["compatibility"] {
  if (manifest.formatVersion === WORKFLOW_PACKAGE_FORMAT_VERSION) return { status: "compatible", message: "Compatible with this Nexus workflow format." };
  if (typeof manifest.formatVersion === "number" && manifest.formatVersion < WORKFLOW_PACKAGE_FORMAT_VERSION) return { status: "upgrade_required", message: "This package uses an older workflow format and must be upgraded before use." };
  return { status: "unsupported", message: "This package uses a newer or invalid workflow format." };
}

function isManifest(value: unknown): value is WorkflowPackageManifest {
  if (!value || typeof value !== "object") return false;
  const manifest = value as Partial<WorkflowPackageManifest>;
  return typeof manifest.id === "string" && /^(?:user|project)\/[a-z0-9][a-z0-9-]{0,47}$/.test(manifest.id) &&
    typeof manifest.name === "string" && typeof manifest.description === "string" && typeof manifest.version === "string" &&
    manifest.instructionFile === WORKFLOW_BODY_FILE && Array.isArray(manifest.supportedModes) && Array.isArray(manifest.requiredCapabilities) &&
    Array.isArray(manifest.activationTerms) && Array.isArray(manifest.fixtures) && typeof manifest.priority === "number" &&
    typeof manifest.automatic === "boolean" && typeof manifest.enabled === "boolean" && STAGES.includes(manifest.defaultStage as WorkflowStage);
}

function readPackage(directory: string, level: WorkflowPackageLevel, projectPath?: string): { workflow: WorkflowPackageManifest; body: string; path: string; level: WorkflowPackageLevel; projectPath?: string } | null {
  try {
    const manifestPath = join(directory, WORKFLOW_MANIFEST_FILE);
    const workflow = JSON.parse(readFileSync(manifestPath, "utf8")) as unknown;
    const body = readFileSync(join(directory, WORKFLOW_BODY_FILE), "utf8");
    if (!isManifest(workflow) || !body.trim()) return null;
    return { workflow, body, path: manifestPath, level, ...(projectPath ? { projectPath } : {}) };
  } catch { return null; }
}

function directories(directory: string): string[] {
  try { return readdirSync(directory, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name); } catch { return []; }
}

export function listWorkflowPackages(dataDir: string, projectPath?: string | null): WorkflowPackageRecord[] {
  const levels: Array<[WorkflowPackageLevel, string | undefined]> = [["global", undefined]];
  if (projectPath?.trim()) levels.push(["project", projectPath]);
  return levels.flatMap(([level, project]) => directories(root(dataDir, level, project)).flatMap((name) => {
    const entry = readPackage(join(root(dataDir, level, project), name), level, project);
    if (!entry) return [];
    const status = compatibility(entry.workflow);
    return [{
      id: entry.workflow.id, name: entry.workflow.name, description: entry.workflow.description, version: entry.workflow.version,
      enabled: entry.workflow.enabled, supportedModes: entry.workflow.supportedModes, requiredCapabilities: entry.workflow.requiredCapabilities,
      priority: entry.workflow.priority, defaultStage: entry.workflow.defaultStage, level, path: entry.path, ...(project ? { projectPath: project } : {}), compatibility: status,
    }];
  })).sort((left, right) => left.name.localeCompare(right.name));
}

export function readWorkflowPackage(dataDir: string, id: string, projectPath?: string | null) {
  const record = listWorkflowPackages(dataDir, projectPath).find((candidate) => candidate.id === id);
  if (!record) throw new Error("Workflow package not found");
  const entry = readPackage(join(root(dataDir, record.level, record.projectPath), packageName(id)), record.level, record.projectPath);
  if (!entry) throw new Error("Workflow package is invalid");
  return { ...entry, record };
}

export function createWorkflowPackage(dataDir: string, input: WorkflowPackageInput): WorkflowPackageRecord {
  const validation = validateWorkflowPackageInput(input);
  if (!validation.ok) throw new Error(validation.error);
  const workflow = asManifest(input);
  const level = input.level ?? "global";
  const directory = join(root(dataDir, level, input.projectPath), packageName(workflow.id));
  if (existsSync(directory)) throw new Error("Workflow package already exists");
  mkdirSync(directory, { recursive: true });
  writeFileSync(join(directory, WORKFLOW_MANIFEST_FILE), JSON.stringify(workflow, null, 2), "utf8");
  writeFileSync(join(directory, WORKFLOW_BODY_FILE), input.body.trim() + "\n", "utf8");
  return listWorkflowPackages(dataDir, input.projectPath).find((record) => record.id === workflow.id)!;
}

export function updateWorkflowPackage(dataDir: string, id: string, input: WorkflowPackageInput): WorkflowPackageRecord {
  const current = readWorkflowPackage(dataDir, id, input.projectPath);
  if (id !== idFor(input)) throw new Error("Workflow package ids cannot be changed");
  const validation = validateWorkflowPackageInput(input);
  if (!validation.ok) throw new Error(validation.error);
  const workflow = asManifest(input);
  writeFileSync(current.path, JSON.stringify(workflow, null, 2), "utf8");
  writeFileSync(join(current.path, "..", WORKFLOW_BODY_FILE), input.body.trim() + "\n", "utf8");
  return listWorkflowPackages(dataDir, input.projectPath).find((record) => record.id === id)!;
}

export function removeWorkflowPackage(dataDir: string, id: string, projectPath?: string | null): void {
  const current = readWorkflowPackage(dataDir, id, projectPath);
  rmSync(join(current.path, ".."), { recursive: true, force: false });
}

export function setWorkflowPackageEnabled(dataDir: string, id: string, enabled: boolean, projectPath?: string | null): WorkflowPackageRecord {
  const current = readWorkflowPackage(dataDir, id, projectPath);
  current.workflow.enabled = enabled;
  writeFileSync(current.path, JSON.stringify(current.workflow, null, 2), "utf8");
  return listWorkflowPackages(dataDir, projectPath).find((record) => record.id === id)!;
}

export type WorkflowPackagePreview = { wouldActivate: boolean; stage?: WorkflowStage; reason: "matched" | "manual_only" | "disabled" | "unsupported_mode" | "unsupported_capability" | "incompatible" | "no_match" };
export function previewWorkflowPackage(dataDir: string, id: string, input: { prompt: string; mode: Mode; capabilities?: readonly string[]; projectPath?: string | null }): WorkflowPackagePreview {
  const current = readWorkflowPackage(dataDir, id, input.projectPath);
  const workflow = current.workflow;
  if (current.record.compatibility.status !== "compatible") return { wouldActivate: false, reason: "incompatible" };
  if (!workflow.enabled) return { wouldActivate: false, reason: "disabled" };
  if (!workflow.supportedModes.includes(input.mode)) return { wouldActivate: false, reason: "unsupported_mode" };
  const capabilities = input.capabilities ?? ALL_CAPABILITIES;
  if (workflow.requiredCapabilities.some((capability) => !capabilities.includes(capability))) return { wouldActivate: false, reason: "unsupported_capability" };
  if (!workflow.automatic) return { wouldActivate: false, reason: "manual_only" };
  const text = input.prompt.trim().toLowerCase();
  const matched = workflow.activationTerms.every((term) => text.includes(term));
  return matched ? { wouldActivate: true, stage: workflow.defaultStage, reason: "matched" } : { wouldActivate: false, reason: "no_match" };
}

export function runWorkflowPackageFixtures(dataDir: string, id: string, projectPath?: string | null) {
  const current = readWorkflowPackage(dataDir, id, projectPath);
  return {
    id: current.workflow.id,
    formatVersion: current.workflow.formatVersion,
    compatibility: current.record.compatibility,
    fixtures: current.workflow.fixtures.map((fixture) => {
      const positive = previewWorkflowPackage(dataDir, id, { prompt: fixture.positivePrompt, mode: current.workflow.supportedModes[0]!, projectPath });
      const negative = previewWorkflowPackage(dataDir, id, { prompt: fixture.negativePrompt, mode: current.workflow.supportedModes[0]!, projectPath });
      return { expectedStage: fixture.expectedStage, passed: positive.wouldActivate && positive.stage === fixture.expectedStage && !negative.wouldActivate };
    }),
  };
}

/** Convert only a compatible, enabled package into host-owned resolver input. */
export function workflowPackageManifest(dataDir: string, id: string, projectPath?: string | null): WorkflowManifest | null {
  const current = readWorkflowPackage(dataDir, id, projectPath);
  if (!current.workflow.enabled || current.record.compatibility.status !== "compatible") return null;
  const workflow = current.workflow;
  return {
    id: workflow.id,
    version: workflow.version,
    name: workflow.name,
    description: workflow.description,
    skillFile: WORKFLOW_BODY_FILE,
    supportedModes: workflow.supportedModes,
    requiredCapabilities: workflow.requiredCapabilities,
    priority: workflow.priority,
    defaultStage: workflow.defaultStage,
    fixtures: workflow.fixtures,
    ...(workflow.automatic ? { activationTerms: workflow.activationTerms } : {}),
  };
}

export function activeWorkflowPackageManifests(dataDir: string, projectPath?: string | null): WorkflowManifest[] {
  return listWorkflowPackages(dataDir, projectPath).flatMap((record) => {
    try { const manifest = workflowPackageManifest(dataDir, record.id, projectPath); return manifest ? [manifest] : []; } catch { return []; }
  });
}
