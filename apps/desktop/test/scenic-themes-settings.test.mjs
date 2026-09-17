import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const nav = await readFile(new URL("../src/lib/settings-search.ts", import.meta.url), "utf8");
const page = await readFile(new URL("../src/pages/SettingsPage.tsx", import.meta.url), "utf8");
const blur = await readFile(new URL("../src/components/settings/TwilightBackdropBlurRow.tsx", import.meta.url), "utf8");
const types = await readFile(new URL("../../../packages/shared/src/types.ts", import.meta.url), "utf8");

test("Scenic themes destination is directly below General", () => {
  assert.match(nav, /id: "general"[\s\S]*?id: "scenic-themes"[\s\S]*?id: "ai"/);
  assert.match(page, /tab === "scenic-themes"/);
});

test("scenic blur contract is numeric, bounded, and per-theme capable", () => {
  assert.match(types, /ScenicBackdropBlur = number/);
  assert.match(types, /scenicBackdropBlurByTheme/);
  assert.match(types, /Math\.max\(0, Math\.min\(20/);
  assert.match(blur, /type="range"/);
});

test("Scenic Themes renders Emerald Afterglow after Obsidian Horizon", async () => {
  const section = await readFile(new URL("../src/components/settings/ScenicThemesSection.tsx", import.meta.url), "utf8");
  assert.match(section, /"obsidian-horizon": obsidianHorizonPreviewUrl, "emerald-afterglow": emeraldAfterglowPreviewUrl/);
  assert.match(section, /"EmeraldAfterglow"/);
});

test("scenic preview cards use Vite-resolved packaged assets instead of runtime-relative resource paths", async () => {
  const section = await readFile(new URL("../src/components/settings/ScenicThemesSection.tsx", import.meta.url), "utf8");
  assert.ok(section.includes('import twilightMountainsPreviewUrl from "../../../resources/themes/twilight-mountains.png";'));
  assert.ok(section.includes('import alpineLightPreviewUrl from "../../../resources/themes/alpine-light.png";'));
  assert.ok(section.includes('import obsidianHorizonPreviewUrl from "../../../resources/themes/obsidian-horizon.png";'));
  assert.ok(section.includes('import emeraldAfterglowPreviewUrl from "../../../resources/themes/emerald-afterglow.png";'));
  assert.match(section, /style=\{\{ backgroundImage: `url\(\$\{ASSETS\[id\]\}\)` \}\}/);
  assert.doesNotMatch(section, /\.\.\/\.\.\/resources\/themes\/\$\{ASSETS\[id\]\}/);
});
