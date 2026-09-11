/**
 * Instruction catalog: documents contributed by user recipes, plugins, or the
 * PI-Desktop host. Plugin manifests still call their contribution `skills` for
 * compatibility, but the aggregate is intentionally broader.
 *
 * Only the catalog — id, name, description — travels into the system prompt;
 * the model loads a body on demand with the `Skill` tool (D174). Reading the
 * files therefore belongs entirely to Electron main, which owns the plugin
 * registry and the permission grants. This module owns the catalog shape and
 * the reuse digest so the sidecar and main agree on both.
 */

/** One catalog entry as the model sees it in the system prompt. */
export type InstructionDocumentDef = {
  /** `<pluginId>/<skillId>` — the exact id the `Skill` tool expects. */
  id: string;
  name: string;
  description?: string;
  /**
   * Who owns this instruction document. User-owned recipes are intentionally
   * distinct from instruction documents shipped by plugins or PI-Desktop.
   */
  source?: "user" | "plugin" | "builtin";
};

/** Fixed provider-neutral ceiling for skill metadata in a system prompt. */
export const MAX_INSTRUCTION_CATALOG_CHARS = 8_000;

function sourcePriority(source: InstructionDocumentDef["source"]): number {
  switch (source) {
    case "builtin":
      return 0;
    case "user":
      return 1;
    default:
      return 2;
  }
}

/** Stable source-first ordering before prompt-budget selection. */
export function sortInstructionCatalog(
  documents: InstructionDocumentDef[],
): InstructionDocumentDef[] {
  return [...documents].sort((a, b) =>
    sourcePriority(a.source) - sourcePriority(b.source) ||
    a.name.localeCompare(b.name, undefined, { sensitivity: "base" }) ||
    a.id.localeCompare(b.id),
  );
}

/**
 * Stable fingerprint of a skill catalog.
 *
 * `AgentRuntime.matches()` compares this so enabling a plugin, revoking its
 * prompt permission, or editing a skill's front matter starts a fresh runtime
 * instead of reusing a session whose catalog is already stale. Bodies are not
 * part of it: they never enter the prompt, and the `Skill` tool reads them
 * fresh from disk on every call.
 */
export function instructionCatalogDigest(documents?: InstructionDocumentDef[]): string {
  if (!documents?.length) return "";
  return documents
    .map((skill) => `${skill.id}:${skill.name}:${skill.description ?? ""}:${skill.source ?? "plugin"}`)
    .join("|");
}

/** @deprecated Internal callers should use InstructionDocumentDef. */
export type PluginSkillDef = InstructionDocumentDef;
/** @deprecated Internal callers should use instructionCatalogDigest. */
export const pluginSkillsDigest = instructionCatalogDigest;
