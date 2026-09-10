import assert from "node:assert/strict";
import test from "node:test";

test("plugin guidance implementation is isolated behind a scope boundary", async () => {
  const source = await import("node:fs/promises").then(({ readFile }) =>
    readFile(new URL("../electron/main/plugin-guidance.ts", import.meta.url), "utf8"),
  );
  assert.match(source, /loadScopedPluginGuidance/);
  assert.match(source, /not enabled for this project/);
  assert.match(source, /registry\.loadSkillBody/);
});
