import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseSkillFrontmatter } from "@pi-desktop/plugin-sdk";
import type { InstructionDocumentDef } from "@pi-desktop/agent-runtime";
import type { BuiltinSkillRecord } from "@pi-desktop/shared";

/**
 * Skills Nexus ships itself.
 *
 * These ride the same catalog-plus-`Skill`-tool path as plugin-contributed
 * skills (D174), so a first-party skill and a third-party one are
 * indistinguishable to the model — but they need no permission grant, because
 * the host is not a plugin.
 */

/** Bundled skill teaching the plugin-development loop. */
export const PLUGIN_DEV_SKILL_FILE = "plugin-development.md";
export const PLUGIN_DEV_SKILL_ID = "nexus/guidance/plugin-development";
export const AGENT_OPERATIONS_SKILL_FILE = "agent-operations.md";
export const AGENT_OPERATIONS_SKILL_ID = "nexus/guidance/agent-operations";
const LEGACY_PLUGIN_DEV_SKILL_ID = "pi-desktop/plugin-development";
const LEGACY_AGENT_OPERATIONS_SKILL_ID = "pi-desktop/agent-operations";
const BUILTIN_SKILL_VERSION = "1";

/** electron-builder copies `resources/skills` to `<resources>/skills`. */
function resolveBuiltinSkillPath(fileName: string): string | null {
  const candidates = [
    join(process.resourcesPath || "", "skills", fileName),
    join(__dirname, "../../resources/skills", fileName),
    join(__dirname, "../../../resources/skills", fileName),
  ];
  for (const candidate of candidates) {
    if (candidate && existsSync(candidate)) return candidate;
  }
  return null;
}

/**
 * True when this workspace looks like plugin development: a plugin manifest at
 * the root, or a plugin already loaded from inside it.
 *
 * The gate matters. A plugin-authoring primer in every session would burn
 * context for the vast majority of sessions that never write a plugin; the
 * three plugin tools stay registered regardless. An explicit authoring request
 * also activates the guide before scaffolding creates the first manifest.
 */
export function isPluginWorkspace(
  workspacePath: string | null | undefined,
  pluginPaths: string[] = [],
): boolean {
  if (!workspacePath) return false;
  const manifestPath = join(workspacePath, "manifest.json");
  if (existsSync(manifestPath)) {
    try {
      const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
      if (
        manifest &&
        typeof manifest === "object" &&
        typeof manifest.schemaVersion === "number" &&
        typeof manifest.main === "string"
      ) {
        return true;
      }
    } catch {
      // An unparseable manifest is not evidence either way.
    }
  }
  const prefix = workspacePath.endsWith("/") ? workspacePath : `${workspacePath}/`;
  return pluginPaths.some((path) => path === workspacePath || path.startsWith(prefix));
}

/**
 * True only for a user request to author a plugin, rather than a generic
 * question that happens to mention plugins. This keeps the authoring guide out
 * of ordinary projects while making it available before a new plugin exists.
 */
export function isPluginAuthoringRequest(content: unknown): boolean {
  if (typeof content !== "string") return false;
  return /\b(?:create|scaffold|build|develop|debug|validate|check|package|pack)\b[\s\S]{0,64}\bplugins?\b/i.test(
    content,
  );
}

/** Front matter carries the skill's title and applicability line. */
function readBuiltinSkill(fileName: string): string | null {
  const path = resolveBuiltinSkillPath(fileName);
  if (!path) return null;
  try {
    return readFileSync(path, "utf8");
  } catch {
    return null;
  }
}

export type BuiltinSkillInput = {
  workspacePath?: string | null;
  /** Directories of currently loaded plugins, used to detect a dev workspace. */
  pluginPaths?: string[];
  /** The current user prompt explicitly asks to author a plugin. */
  pluginAuthoringRequested?: boolean;
  dataDir?: string;
};

const builtinSkillFile = (dataDir: string) => join(dataDir, "agent-capabilities", "builtin-skills.json");

function disabledBuiltinSkillIds(dataDir?: string): Set<string> {
  if (!dataDir) return new Set();
  try {
    const raw = JSON.parse(readFileSync(builtinSkillFile(dataDir), "utf8")) as { disabled?: unknown };
    return new Set(Array.isArray(raw.disabled) ? raw.disabled.filter((id): id is string => typeof id === "string") : []);
  } catch {
    return new Set();
  }
}

export function listBuiltinSkills(dataDir: string): BuiltinSkillRecord[] {
  const disabled = disabledBuiltinSkillIds(dataDir);
  return [
    { id: AGENT_OPERATIONS_SKILL_ID, fileName: AGENT_OPERATIONS_SKILL_FILE },
    { id: PLUGIN_DEV_SKILL_ID, fileName: PLUGIN_DEV_SKILL_FILE },
  ].flatMap(({ id, fileName }) => {
    const raw = readBuiltinSkill(fileName);
    const parsed = raw ? parseSkillFrontmatter(raw) : null;
    if (!parsed?.body) return [];
    return [{ id, name: parsed.name ?? id, description: parsed.description, enabled: !disabled.has(id), source: "nexus" as const, version: BUILTIN_SKILL_VERSION }];
  });
}

export function setBuiltinSkillEnabled(dataDir: string, id: string, enabled: boolean): BuiltinSkillRecord | null {
  const records = listBuiltinSkills(dataDir);
  const record = records.find((candidate) => candidate.id === id);
  if (!record) return null;
  const disabled = disabledBuiltinSkillIds(dataDir);
  if (enabled) disabled.delete(id); else disabled.add(id);
  const path = builtinSkillFile(dataDir);
  mkdirSync(join(dataDir, "agent-capabilities"), { recursive: true });
  writeFileSync(path, JSON.stringify({ disabled: [...disabled].sort() }, null, 2), "utf8");
  return { ...record, enabled };
}

/**
 * Catalog entries for the built-in skills that apply to the given session, read
 * fresh so a packaged update takes effect without a restart.
 */
export function builtinSkills(input: BuiltinSkillInput): InstructionDocumentDef[] {
  const skills: InstructionDocumentDef[] = [];
  const disabled = disabledBuiltinSkillIds(input.dataDir);
  const operations = readBuiltinSkill(AGENT_OPERATIONS_SKILL_FILE);
  if (!disabled.has(AGENT_OPERATIONS_SKILL_ID) && operations?.trim()) {
    const parsed = parseSkillFrontmatter(operations);
    if (parsed.body) {
      skills.push({
        id: AGENT_OPERATIONS_SKILL_ID,
        name: parsed.name ?? "Nexus agent operations",
        description: parsed.description,
        source: "builtin",
      });
    }
  }
  if (!input.pluginAuthoringRequested && !isPluginWorkspace(input.workspacePath, input.pluginPaths)) {
    return skills;
  }
  if (disabled.has(PLUGIN_DEV_SKILL_ID)) return skills;
  const raw = readBuiltinSkill(PLUGIN_DEV_SKILL_FILE);
  if (!raw?.trim()) return skills;
  const parsed = parseSkillFrontmatter(raw);
  if (!parsed.body) return skills;
  skills.push({
    id: PLUGIN_DEV_SKILL_ID,
    name: parsed.name ?? "Nexus plugin development",
    description: parsed.description,
    source: "builtin",
  });
  return skills;
}

/**
 * Load a built-in skill body for the `Skill` tool. Returns null for any id the
 * host does not ship, which is the caller's cue to try the plugin registry.
 */
export function loadBuiltinSkillBody(
  id: string,
): { id: string; name: string; body: string } | null {
  const canonicalId = id === LEGACY_AGENT_OPERATIONS_SKILL_ID
    ? AGENT_OPERATIONS_SKILL_ID
    : id === LEGACY_PLUGIN_DEV_SKILL_ID
      ? PLUGIN_DEV_SKILL_ID
      : id;
  const fileName = id === AGENT_OPERATIONS_SKILL_ID || id === LEGACY_AGENT_OPERATIONS_SKILL_ID
    ? AGENT_OPERATIONS_SKILL_FILE
    : id === PLUGIN_DEV_SKILL_ID || id === LEGACY_PLUGIN_DEV_SKILL_ID
      ? PLUGIN_DEV_SKILL_FILE
      : null;
  if (!fileName) return null;
  const raw = readBuiltinSkill(fileName);
  if (!raw?.trim()) return null;
  const parsed = parseSkillFrontmatter(raw);
  if (!parsed.body) return null;
  return {
    id: canonicalId,
    name: parsed.name ?? (canonicalId === AGENT_OPERATIONS_SKILL_ID
      ? "Nexus agent operations"
      : "Nexus plugin development"),
    body: parsed.body,
  };
}
