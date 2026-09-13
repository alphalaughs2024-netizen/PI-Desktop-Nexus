import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const composer = await readFile(new URL("../src/components/Composer.tsx", import.meta.url), "utf8");
const ui = await readFile(new URL("../src/components/ui.tsx", import.meta.url), "utf8");

test("Composer and tooltip hook keep unique declarations after model-menu changes", () => {
  assert.equal((composer.match(/composerProviderDisplayName,/g) ?? []).length, 1);
  assert.equal((composer.match(/composerProviderSearchText,/g) ?? []).length, 1);
  assert.equal((ui.match(/const dismiss = \(\) =>/g) ?? []).length, 1);
});
