import { describe, expect, it } from "vitest";
import {
  normalizeDelegationOwnership,
  concurrentMutationConflict,
  overlappingOwnership,
  type DelegationOwnership,
} from "./task-coordination.js";

describe("task coordination", () => {
  it("uses a conservative whole-workspace write scope when a mutating delegate omits ownership", () => {
    expect(normalizeDelegationOwnership(undefined, true)).toEqual({ access: "write", paths: ["*"] });
  });

  it("does not let a mutating delegate claim read-only ownership", () => {
    expect(normalizeDelegationOwnership({ access: "read", paths: ["src/a.ts"] }, true)).toEqual({
      access: "write",
      paths: ["src/a.ts"],
    });
  });

  it("detects intersecting write ownership and permits read-only overlap", () => {
    const existing: DelegationOwnership = { access: "write", paths: ["src/**"] };
    expect(overlappingOwnership(existing, { access: "write", paths: ["src/runtime.ts"] })).toBe(true);
    expect(overlappingOwnership(existing, { access: "read", paths: ["src/runtime.ts"] })).toBe(false);
    expect(overlappingOwnership(existing, { access: "write", paths: ["docs/**"] })).toBe(false);
  });

  it("refuses every concurrent mutation in the shared session workspace", () => {
    expect(concurrentMutationConflict(
      { access: "write", paths: ["src/**"] },
      { access: "write", paths: ["docs/**"] },
    )).toBe(true);
    expect(concurrentMutationConflict(
      { access: "write", paths: ["src/**"] },
      { access: "read", paths: ["src/runtime.ts"] },
    )).toBe(false);
  });
});
