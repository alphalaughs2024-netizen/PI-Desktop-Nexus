import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const desktopRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const root = join(desktopRoot, "../..");
const commands = readFileSync(join(root, "apps/desktop/electron/main/builtin-commands.ts"), "utf8");
const execution = readFileSync(join(root, "apps/desktop/src/lib/commands.ts"), "utf8");

test("Phase 10 exposes and executes the canonical Browser command", () => {
  assert.match(commands, /builtin\.browser\.open/);
  assert.match(commands, /Open Browser/);
  assert.match(commands, /Work Panel/);
  assert.match(execution, /builtin\.browser\.open/);
  assert.match(execution, /CORE_BROWSER_TAB/);
  assert.match(execution, /openWorkPanelTab/);
});
