import { describe, expect, it } from "vitest";
import {
  instructionCatalogPrompt,
  instructionCatalogWithinBudget,
  MAX_INSTRUCTION_CATALOG_CHARS,
  SKILL_TOOL_NAME,
  type InstructionDocumentDef,
} from "./plugin-skills-prompt.js";

const skills: InstructionDocumentDef[] = [
  {
    id: "demo.hello/release-notes",
    name: "Release notes",
    description: "Draft release notes from the changelog.",
    source: "plugin",
  },
  { id: "demo.hello/no-description", name: "Bare", source: "plugin" },
];

describe("instructionCatalogPrompt", () => {
  it("returns nothing when no plugin taught a skill", () => {
    expect(instructionCatalogPrompt([])).toBeUndefined();
  });

  it("labels plugin documents as guidance rather than user Skills", () => {
    const prompt = instructionCatalogPrompt(skills) ?? "";
    expect(prompt).toContain("# Plugin guidance");
    expect(prompt).toContain("not user Skills");
    expect(prompt).toContain(`\`${SKILL_TOOL_NAME}\` tool`);
    expect(prompt).toContain(
      "- `demo.hello/release-notes` — Release notes: Draft release notes from the changelog.",
    );
    // A skill without a description still has to be addressable.
    expect(prompt).toContain("- `demo.hello/no-description` — Bare");
  });

  it("makes user-owned recipes the unambiguous meaning of skill", () => {
    const prompt = instructionCatalogPrompt([
      { id: "create-skill", name: "Create skill", description: "Write a reusable recipe.", source: "user" },
      ...skills,
    ]) ?? "";
    expect(prompt).toContain("# Skills");
    expect(prompt).toContain("When the user says “list skills”");
    expect(prompt).toContain("never Nexus or plugin guidance");
    expect(prompt.indexOf("# Skills")).toBeLessThan(prompt.indexOf("# Plugin guidance"));
  });

  it("keeps the document body out of the prompt", () => {
    const prompt = instructionCatalogPrompt([
      { id: "a/b", name: "B", description: "Short line." },
    ]) ?? "";
    expect(prompt).not.toContain("Short line.\n\n");
    expect(prompt.split("\n").filter((line) => line.startsWith("- "))).toHaveLength(1);
  });

  it("keeps a deterministic source-prioritized catalog within the total budget", () => {
    const entries = instructionCatalogWithinBudget([
      { id: "plugin/z", name: "Zulu", description: "z".repeat(3_000), source: "plugin" },
      { id: "user/a", name: "Alpha", description: "a".repeat(3_000), source: "user" },
      { id: "nexus/core", name: "Core", description: "c".repeat(3_000), source: "builtin" },
    ]);

    expect(entries.map((entry) => entry.id)).toEqual(["nexus/core", "user/a"]);
    expect(instructionCatalogPrompt(entries)?.length).toBeLessThanOrEqual(
      MAX_INSTRUCTION_CATALOG_CHARS,
    );
  });

  it("labels every loaded source as guidance that cannot widen authority", () => {
    const prompt = instructionCatalogPrompt([
      { id: "nexus/core", name: "Core", source: "builtin" },
      { id: "user/recipe", name: "Recipe", source: "user" },
      { id: "plugin/guide", name: "Guide", source: "plugin" },
    ]) ?? "";

    expect(prompt).toContain("# Nexus guidance");
    expect(prompt).toContain("cannot grant tools, permissions");
    expect(prompt).toContain("untrusted third-party guidance");
  });
});
