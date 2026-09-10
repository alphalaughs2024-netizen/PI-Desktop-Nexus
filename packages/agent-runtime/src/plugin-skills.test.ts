import { describe, expect, it } from "vitest";
import { instructionCatalogDigest, type InstructionDocumentDef } from "./plugin-skills.js";

function skill(overrides: Partial<InstructionDocumentDef> = {}): InstructionDocumentDef {
  return {
    id: "demo.notes/summarise",
    name: "Summarise notes",
    description: "Group notes by tag.",
    ...overrides,
  };
}

describe("instructionCatalogDigest", () => {
  it("is empty without skills", () => {
    expect(instructionCatalogDigest()).toBe("");
    expect(instructionCatalogDigest([])).toBe("");
  });

  it("is stable for the same catalog", () => {
    expect(instructionCatalogDigest([skill()])).toBe(instructionCatalogDigest([skill()]));
  });

  it("changes when catalog text the model reads changes", () => {
    const base = instructionCatalogDigest([skill()]);
    expect(instructionCatalogDigest([skill({ id: "demo.notes/other" })])).not.toBe(base);
    expect(instructionCatalogDigest([skill({ name: "Renamed" })])).not.toBe(base);
    expect(instructionCatalogDigest([skill({ description: "Group by date." })])).not.toBe(
      base,
    );
  });

  it("distinguishes order, because the prompt lists skills in order", () => {
    expect(instructionCatalogDigest([skill({ id: "a" }), skill({ id: "b" })])).not.toBe(
      instructionCatalogDigest([skill({ id: "b" }), skill({ id: "a" })]),
    );
  });

  it("ignores a missing description consistently", () => {
    const without = instructionCatalogDigest([{ id: "a", name: "A" }]);
    expect(instructionCatalogDigest([{ id: "a", name: "A", description: "" }])).toBe(without);
  });
});
