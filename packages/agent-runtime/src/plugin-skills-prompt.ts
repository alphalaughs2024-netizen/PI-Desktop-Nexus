import type { InstructionDocumentDef } from "./plugin-skills.js";

export type { InstructionDocumentDef };

/** Tool the model calls to pull a skill document into context on demand. */
export const SKILL_TOOL_NAME = "Skill";

/**
 * Render the skill catalog for the system prompt (D174: skills are
 * model-invoked). Only id/name/description ship up front — the body is loaded
 * through the `Skill` tool when the model decides a skill applies, so a long
 * document costs nothing until it is needed.
 */
function catalogLines(skills: InstructionDocumentDef[]): string[] {
  return skills.map((skill) => {
    const description = skill.description?.trim();
    return `- \`${skill.id}\` — ${skill.name}${description ? `: ${description}` : ""}`;
  });
}

export function instructionCatalogPrompt(skills: InstructionDocumentDef[]): string | undefined {
  if (!skills.length) return undefined;
  const userSkills = skills.filter((skill) => skill.source === "user");
  const pluginGuidance = skills.filter((skill) => skill.source !== "user");
  const sections: string[] = [];
  if (userSkills.length) {
    sections.push(
      [
        "# Skills",
        "",
        `These are the user's reusable task recipes, stored globally or for this project. When the user says “list skills”, “load a skill”, “use a skill”, “create a skill”, or otherwise says “skill” without naming a plugin, they mean this section — never plugin guidance. Load a relevant recipe with the \`${SKILL_TOOL_NAME}\` tool using its exact id before doing the task; do not guess at its content. To create a skill, follow an applicable recipe here if one exists. Load each recipe at most once per task.`,
        "",
        ...catalogLines(userSkills),
      ].join("\n"),
    );
  }
  if (pluginGuidance.length) {
    sections.push(
      [
        "# Plugin guidance",
        "",
        `Plugins are installed capability packages: they may provide tools, panels, commands, services, or supporting instructions. The entries below are instructions shipped by plugins or PI-Desktop, not user Skills. Do not include them when the user asks to list available skills, and do not load them for a generic skill request. Load one only when the user explicitly names its plugin or when its plugin capability is needed for the task. Use the \`${SKILL_TOOL_NAME}\` tool with its exact id.`,
        "",
        ...catalogLines(pluginGuidance),
      ].join("\n"),
    );
  }
  return sections.join("\n\n");
}

/** @deprecated Internal callers should use instructionCatalogPrompt. */
export const pluginSkillsPrompt = instructionCatalogPrompt;
