import { describe, expect, it } from "vitest";
import { composePromptSections } from "./prompt-composition.js";

describe("prompt composition", () => {
  it("keeps deterministic ordering and stable hashes", () => {
    const first = composePromptSections([
      { id: "runtime", source: "runtime", scope: "runtime", content: "base", reloadTrigger: "runtime" },
      { id: "project", source: "AGENTS.md", scope: "project", content: "rules", reloadTrigger: "project" },
    ], "initial");
    const second = composePromptSections([
      { id: "runtime", source: "runtime", scope: "runtime", content: "base", reloadTrigger: "runtime" },
      { id: "project", source: "AGENTS.md", scope: "project", content: "rules", reloadTrigger: "project" },
    ], "initial");
    expect(first.prompt).toBe("base\n\nrules");
    expect(first.snapshot.hash).toBe(second.snapshot.hash);
    expect(first.snapshot.sections.map((section) => section.order)).toEqual([0, 1]);
  });

  it("marks empty sections excluded and estimates token budget", () => {
    const result = composePromptSections([
      { id: "empty", source: "skill", scope: "session", content: "", reloadTrigger: "skill" },
      { id: "text", source: "workflow", scope: "workflow", content: "12345678", reloadTrigger: "workflow" },
    ], "workflow-change");
    expect(result.snapshot.sections[0]).toMatchObject({ included: false, estimatedTokens: 0 });
    expect(result.snapshot.estimatedTokens).toBe(2);
    expect(result.snapshot.reloadReason).toBe("workflow-change");
  });
});
