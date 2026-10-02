import { expect, it } from "vitest";
import { NEXUS_DELEGATION_GUIDANCE } from "./delegation-guidance.js";

it("gives models an actionable delegation decision", () => {
  expect(NEXUS_DELEGATION_GUIDANCE).toContain("call Task immediately");
  expect(NEXUS_DELEGATION_GUIDANCE).toContain("ownership.access=read");
  expect(NEXUS_DELEGATION_GUIDANCE).toContain("one mutating worker");
  expect(NEXUS_DELEGATION_GUIDANCE).toContain("TaskWait before finalizing");
  expect(NEXUS_DELEGATION_GUIDANCE).toContain("Do not delegate just to narrate delegation");
});
