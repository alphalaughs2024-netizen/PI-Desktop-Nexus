import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("../src/pages/SettingsPage.tsx", import.meta.url), "utf8");

test("presentation-only scenic saves skip provider refresh", () => {
  assert.match(source, /presentationOnly/);
  assert.match(source, /key === "theme"/);
  assert.match(source, /key === "scenicBackdropBlurByTheme"/);
  assert.match(source, /if \(!presentationOnly\) await refreshProviders\(\)/);
});
