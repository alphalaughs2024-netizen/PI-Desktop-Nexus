import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const packageJson = JSON.parse(readFileSync(join(import.meta.dirname, "..", "package.json"), "utf8"));

test("Electron native dependency setup is explicit", () => {
  assert.equal(packageJson.scripts.postinstall, undefined);
  assert.equal(packageJson.scripts["prepare:native"], "electron-builder install-app-deps");
  for (const script of ["predev", "pack", "dist", "dist:mac", "dist:win", "dist:linux"]) {
    assert.match(packageJson.scripts[script], /prepare:native/);
  }
});
