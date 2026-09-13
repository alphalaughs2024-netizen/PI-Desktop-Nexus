import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const styles = await readFile(new URL("../src/styles/obsidian-horizon.css", import.meta.url), "utf8").catch(() => "");
const appSource = await readFile(new URL("../src/App.tsx", import.meta.url), "utf8");
const chatSource = await readFile(new URL("../src/components/ChatSurface.tsx", import.meta.url), "utf8");
const sharedTypes = await readFile(new URL("../../../packages/shared/src/types.ts", import.meta.url), "utf8");
const registry = await readFile(new URL("../../../packages/shared/src/built-in-themes.ts", import.meta.url), "utf8");
const apiSource = await readFile(new URL("../src/lib/api.ts", import.meta.url), "utf8");
const mainSource = await readFile(new URL("../electron/main/index.ts", import.meta.url), "utf8");

test("Obsidian Horizon is registered as an isolated dark scenic theme", async () => {
  assert.match(sharedTypes, /"obsidian-horizon"/);
  assert.match(registry, /id: "obsidian-horizon"[\s\S]*?base: "dark"[\s\S]*?scenic: true[\s\S]*?backdropBlur: true/);
  assert.match(appSource, /obsidian-horizon/);
  assert.match(apiSource, /"obsidian-horizon"/);
  assert.match(mainSource, /obsidian-horizon/);
  assert.ok((await stat(new URL("../resources/themes/obsidian-horizon.png", import.meta.url))).size > 0);
});

test("Obsidian stylesheet is scoped, pointer-inert, cinematic, and Settings-safe", () => {
  assert.match(styles, /:root\[data-theme="dark"\]\[data-scenic-theme="obsidian-horizon"\]/);
  assert.match(styles, /\.app-scenic-backdrop[\s\S]*?pointer-events:\s*none/);
  assert.match(styles, /data-scenic-backdrop-blur="low"[\s\S]*?2px/);
  assert.match(styles, /data-scenic-backdrop-blur="medium"[\s\S]*?6px/);
  assert.match(styles, /data-scenic-backdrop-blur="high"[\s\S]*?12px/);
  assert.match(styles, /settings-card-block[\s\S]*?background:\s*transparent/);
  assert.match(styles, /settings-panel:has\(> \.settings-row\)[\s\S]*?background:\s*transparent/);
  assert.match(styles, /settings-panel\.shortcut-map[\s\S]*?background:\s*transparent/);
  assert.match(styles, /provider-list-panel[\s\S]*?background:\s*transparent/);
  assert.match(styles, /model-provider-panel[\s\S]*?background:\s*transparent/);
  assert.doesNotMatch(styles, /\[data-scenic-theme="obsidian-horizon"\]\s+(?:code|button|input|div|section)\s*\{/);
});

test("Obsidian keeps scenic empty-home behavior presentation-only", () => {
  assert.match(chatSource, /isScenicMascotFree/);
  assert.match(chatSource, /chat\.emptyTitle/);
  assert.match(styles, /empty-hero-icon[\s\S]*?display:\s*none/);
});
