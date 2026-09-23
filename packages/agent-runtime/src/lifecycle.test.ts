import { describe, expect, it } from "vitest";
import { createPromptLifecycleEvent } from "./lifecycle.js";

describe("prompt lifecycle metadata", () => {
  it("creates deterministic bounded events", () => {
    const input = {
      sessionId: "session-1",
      sequence: 1,
      kind: "steering_requested" as const,
      preview: "  hello   world  ".repeat(100),
      sensitive: true,
    };
    const first = createPromptLifecycleEvent(input);
    const second = createPromptLifecycleEvent(input);
    expect(first).toEqual(second);
    expect(first.preview).toHaveLength(240);
    expect(first.sensitive).toBe(true);
    expect(first.id).toMatch(/^lifecycle-[0-9a-f]+-1$/);
  });
});
