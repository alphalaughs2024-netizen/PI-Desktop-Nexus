import { describe, expect, it } from "vitest";
import { selectContextClaims } from "./context-provenance.js";

const claim = (id: string, text: string, state = "reviewed") => ({ id, projectPath: "C:/project", claim: text, category: "notes" as const, impact: "", scope: "project", recheckGuidance: "", tags: [], evidence: [], provenance: { kind: "manual" as const }, verification: { state: state as "reviewed" | "conflicted" | "superseded", note: "" }, relationships: [], createdAt: 0, updatedAt: 0, freshness: "fresh" as const });

describe("context provenance selection", () => {
  it("deduplicates and excludes conflicted claims", () => {
    const result = selectContextClaims([claim("a", "same"), claim("a", "same"), claim("b", "conflict", "conflicted")]);
    expect(result.map((item) => item.reason)).toEqual(["verified project context", "duplicate", "conflicted"]);
  });
  it("enforces a bounded token budget", () => {
    const result = selectContextClaims([claim("a", "1234567890"), claim("b", "1234567890")], 2);
    expect(result[0]?.include).toBe(true);
    expect(result[1]?.reason).toBe("budget");
  });
});
