/** Project-scoped access to plugin-contributed instruction documents. */
export type PluginGuidanceDocument = { id: string; pluginId: string };

export type PluginGuidanceRegistry = {
  getSkills(): PluginGuidanceDocument[];
  loadSkillBody(id: string): { id: string; name: string; body: string };
};

/** Recheck scope when a document body is requested, not only when listed. */
export function loadScopedPluginGuidance(
  registry: PluginGuidanceRegistry,
  id: string,
  projectPath: string | null,
  isActive: (pluginId: string, projectPath: string | null) => boolean,
): { id: string; name: string; body: string } {
  const document = registry.getSkills().find((candidate) => candidate.id === id);
  if (!document) throw new Error(`unknown plugin guidance "${id}"`);
  if (!isActive(document.pluginId, projectPath)) {
    throw new Error(`plugin guidance "${id}" is not enabled for this project`);
  }
  return registry.loadSkillBody(id);
}
