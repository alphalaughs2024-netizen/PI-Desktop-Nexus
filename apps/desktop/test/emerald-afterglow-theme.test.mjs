import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import test from "node:test";

const styles = await readFile(new URL("../src/styles/emerald-afterglow.css", import.meta.url), "utf8").catch(() => "");
const appSource = await readFile(new URL("../src/App.tsx", import.meta.url), "utf8");
const chatSource = await readFile(new URL("../src/components/ChatSurface.tsx", import.meta.url), "utf8");
const sharedTypes = await readFile(new URL("../../../packages/shared/src/types.ts", import.meta.url), "utf8");
const registry = await readFile(new URL("../../../packages/shared/src/built-in-themes.ts", import.meta.url), "utf8");
const scenicThemes = await readFile(new URL("../src/components/settings/ScenicThemesSection.tsx", import.meta.url), "utf8");
const apiSource = await readFile(new URL("../src/lib/api.ts", import.meta.url), "utf8");
const mainSource = await readFile(new URL("../electron/main/index.ts", import.meta.url), "utf8");

test("Emerald Afterglow is a dark scenic theme with a packaged native fallback", async () => {
  assert.match(sharedTypes, /"emerald-afterglow"/);
  assert.match(registry, /id: "emerald-afterglow"[\s\S]*?base: "dark"[\s\S]*?scenic: true[\s\S]*?backdropBlur: true[\s\S]*?nativeFallback: "emerald-afterglow"/);
  assert.match(appSource, /emerald-afterglow/);
  assert.match(apiSource, /"emerald-afterglow"/);
  assert.match(mainSource, /emerald-afterglow/);
  assert.match(scenicThemes, /"emerald-afterglow": "emerald-afterglow\.png"/);
  assert.ok((await stat(new URL("../resources/themes/emerald-afterglow.png", import.meta.url))).size > 0);
});

test("Emerald's forest glass is isolated, pointer-inert, and Settings-safe", () => {
  assert.match(styles, /:root\[data-theme="dark"\]\[data-scenic-theme="emerald-afterglow"\]/);
  assert.match(styles, /\.app-scenic-backdrop[\s\S]*?pointer-events:\s*none/);
  assert.match(styles, /--emerald-backdrop-blur:\s*var\(--scenic-backdrop-blur,\s*6px\)/);
  assert.match(styles, /settings-card-block[\s\S]*?background:\s*transparent/);
  assert.match(styles, /settings-panel:has\(> \.settings-row\)[\s\S]*?background:\s*transparent/);
  assert.match(styles, /settings-panel\.shortcut-map[\s\S]*?background:\s*transparent/);
  assert.match(styles, /provider-list-panel[\s\S]*?background:\s*transparent/);
  assert.match(styles, /model-provider-panel[\s\S]*?background:\s*transparent/);
  assert.match(styles, /agent-capability-panel[\s\S]*?background:\s*transparent/);
  assert.match(styles, /@media \(prefers-reduced-transparency: reduce\)/);
  assert.match(styles, /@supports not \(backdrop-filter: blur\(1px\)\)/);
  assert.doesNotMatch(styles, /\[data-scenic-theme="emerald-afterglow"\]\s+(?:code|button|input|div|section)\s*\{/);
});

test("Emerald keeps mascot-free empty home behavior presentation-only", () => {
  assert.match(chatSource, /isScenicMascotFree/);
  assert.match(chatSource, /chat\.emptyTitle/);
  assert.match(styles, /empty-hero-icon[\s\S]*?display:\s*none/);
});
