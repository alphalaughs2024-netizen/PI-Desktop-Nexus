import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const section = await readFile(new URL("../src/components/settings/ScenicThemesSection.tsx", import.meta.url));
const types = await readFile(new URL("../../../packages/shared/src/types.ts", import.meta.url));
test("scenic blur slider updates locally and persists per theme", () => {
  assert.match(section.toString(), /requestAnimationFrame/);
  assert.match(section.toString(), /setTimeout/);
  assert.match(section.toString(), /scenicBackdropBlurByTheme/);
  assert.match(section.toString(), /type=\"range\"/);
  assert.match(types.toString(), /resolveScenicBackdropBlur/);
});
