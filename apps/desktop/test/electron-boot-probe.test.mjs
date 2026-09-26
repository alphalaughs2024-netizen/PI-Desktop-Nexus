import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const probe = readFileSync(join(repoRoot, "scripts/e2e-electron-boot.mjs"), "utf8");
const protocol = readFileSync(join(repoRoot, "packages/shared/src/protocol.ts"), "utf8");

test("Electron boot probe follows the shared application identity", () => {
  const appName = /export const APP_NAME = "([^"]+)"/.exec(protocol)?.[1];
  assert.ok(appName);
  assert.match(probe, new RegExp(`const APP_NAME = "${appName}"`));
  assert.match(probe, /probe\.appName === APP_NAME/);
});
