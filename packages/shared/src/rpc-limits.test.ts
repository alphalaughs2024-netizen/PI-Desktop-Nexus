import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { MAX_HOST_STDIN_LINE_BYTES } from "./rpc-limits.js";

describe("host stdin line cap", () => {
  it("matches host-core MAX_STDIN_LINE_BYTES", () => {
    expect(MAX_HOST_STDIN_LINE_BYTES).toBe(64 * 1024 * 1024);
    const rust = readFileSync(
      new URL("../../../crates/host-core/src/rpc/mod.rs", import.meta.url),
      "utf8",
    );
    expect(rust).toMatch(/const MAX_STDIN_LINE_BYTES: u64 = 64 \* 1024 \* 1024;/);
  });
});
