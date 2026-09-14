import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("../src/components/settings/ScenicThemesSection.tsx", import.meta.url), "utf8");

test("scenic blur keeps a draft until Apply", () => {
  assert.match(source, /draftValue/);
  assert.match(source, /t\("settings\.scenicApply"\)/);
  assert.match(source, /className="scenic-blur-apply"/);
  assert.match(source, /scenicBackdropBlurByTheme/);
  const sliderHandler = source.match(/onChange=\{\(event\) => updateBlur\([\s\S]*?\)\}/)?.[0] ?? "";
  assert.doesNotMatch(sliderHandler, /saveSettings/);
  assert.match(source, /disabled=\{draftValue === confirmedRef\.current\}/);
  assert.doesNotMatch(source, /timerRef|setTimeout\(/);
});
