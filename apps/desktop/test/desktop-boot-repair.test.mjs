import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const desktopRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = join(desktopRoot, "../..");
const packageJson = JSON.parse(readFileSync(join(desktopRoot, "package.json"), "utf8"));
const mainSource = readFileSync(join(desktopRoot, "electron/main/index.ts"), "utf8");
const cleanScript = readFileSync(join(repoRoot, "scripts/clean-desktop-output.mjs"), "utf8");

test("desktop build clears stale output before electron-vite", () => {
  assert.match(packageJson.scripts.build, /clean-desktop-output\.mjs/);
  assert.match(cleanScript, /rmSync\(resolve\(desktopRoot, "out"\)/);
});

test("main reports renderer load failure and presents a retry surface", () => {
  assert.match(mainSource, /did-fail-load/);
  assert.match(mainSource, /render-process-gone/);
  assert.match(mainSource, /RENDERER_LOAD_FAILED/);
  assert.match(mainSource, /RENDERER_PROCESS_GONE/);
  assert.match(mainSource, /location\.reload\(\)/);
  assert.match(mainSource, /renderer loaded/);
});
