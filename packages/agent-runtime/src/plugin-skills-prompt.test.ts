import { describe, expect, it } from "vitest";
import {
  instructionCatalogPrompt,
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
    expect(prompt.startsWith("# Plugin guidance")).toBe(true);
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
    expect(prompt).toContain("never plugin guidance");
    expect(prompt.indexOf("# Skills")).toBeLessThan(prompt.indexOf("# Plugin guidance"));
  });

  it("keeps the document body out of the prompt", () => {
    const prompt = instructionCatalogPrompt([
      { id: "a/b", name: "B", description: "Short line." },
    ]) ?? "";
    expect(prompt).not.toContain("Short line.\n\n");
    expect(prompt.split("\n").filter((line) => line.startsWith("- "))).toHaveLength(1);
  });
});
