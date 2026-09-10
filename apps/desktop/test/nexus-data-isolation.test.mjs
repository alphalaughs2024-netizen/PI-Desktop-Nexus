import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const main = readFileSync(join(import.meta.dirname, "../electron/main/index.ts"), "utf8");

test("Nexus defaults its host state to a separate data directory", () => {
  assert.match(
    main,
    /const DEFAULT_DATA_DIR_NAME = "\.pi-desktop-nexus";/,
  );
  assert.match(
    main,
    /const dataDir =\s*process\.env\.PI_DESKTOP_DATA_DIR \|\| join\(homedir\(\), DEFAULT_DATA_DIR_NAME\);/s,
  );
  assert.match(
    main,
    /getScratchDir:[\s\S]*?join\(homedir\(\), DEFAULT_DATA_DIR_NAME\)/,
  );
  assert.doesNotMatch(
    main,
    /\.pi-desktop"/,
  );
});
