import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import test from "node:test";
import { loadStyles } from "./helpers/styles.mjs";

const appSource = await readFile(new URL("../src/App.tsx", import.meta.url), "utf8");
const themeRowSource = await readFile(
  new URL("../src/components/settings/ThemeRow.tsx", import.meta.url),
  "utf8",
);
const apiSource = await readFile(new URL("../src/lib/api.ts", import.meta.url), "utf8");
const mainSource = await readFile(new URL("../electron/main/index.ts", import.meta.url), "utf8");
const chatSurface = await readFile(new URL("../src/components/ChatSurface.tsx", import.meta.url), "utf8");
const sharedTypes = await readFile(new URL("../../../packages/shared/src/types.ts", import.meta.url), "utf8");
const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
const styles = await loadStyles();

test("Twilight Mountains is a first-party dark built-in theme", () => {
  assert.match(sharedTypes, /"twilight-mountains"/);
  assert.match(themeRowSource, /BUILT_IN_THEMES\.map\(\(theme\) => theme\.id\)/);
  assert.match(themeRowSource, /settings\.themeTwilightMountains/);
  assert.match(themeRowSource, /settings\.themeTwilightMountainsDesc/);
});

test("Twilight resolves to dark while its scenic state mounts and clears independently", () => {
  const effect = appSource.slice(appSource.indexOf("const preference = settings?.theme"));
  assert.match(effect, /preference === "twilight-mountains"/);
  assert.match(effect, /document\.documentElement\.dataset\.scenicTheme = "twilight-mountains"/);
  assert.match(effect, /delete document\.documentElement\.dataset\.scenicTheme/);
  assert.match(effect, /document\.documentElement\.dataset\.theme = resolvedTheme/);
  assert.match(effect, /\.setWindowBackgroundColor\(/);
  assert.match(appSource, /className="app-scenic-backdrop"/);
});

test("Twilight packages its backdrop and uses a navy native fallback", async () => {
  assert.deepEqual(
    packageJson.build.extraResources.at(-1),
    { from: "resources/themes", to: "themes" },
  );
  const asset = new URL("../resources/themes/twilight-mountains.png", import.meta.url);
  assert.ok((await stat(asset)).size > 0);
  assert.match(apiSource, /"light" \| "dark" \| "twilight-mountains"/);
  assert.match(mainSource, /theme !== "light" && theme !== "dark" && theme !== "twilight-mountains"/);
  assert.match(mainSource, /theme === "twilight-mountains" \? "#071326"/);
});

test("Twilight uses layered blue-glass materials with readable safety surfaces", () => {
  const shellChildRule =
    /\.app-shell > :not\(\.app-scenic-backdrop\)[^{]*\{([^}]*)\}/.exec(styles)?.[1] ?? "";

  assert.match(styles, /:root\[data-theme="dark"\]\[data-scenic-theme="twilight-mountains"\]/);
  assert.match(styles, /--twilight-atmosphere:/);
  assert.match(styles, /--twilight-shell-glass:/);
  assert.match(styles, /--twilight-navigation-glass:/);
  assert.match(styles, /--twilight-raised-glass:/);
  assert.match(styles, /--twilight-safety-surface:/);
  assert.match(styles, /--twilight-luminous-border:/);
  assert.match(styles, /--twilight-focus-glow:/);
  assert.match(styles, /\.app-scenic-backdrop[\s\S]*?pointer-events:\s*none/);
  assert.match(styles, /\.app-scenic-backdrop[\s\S]*?twilight-mountains\.png/);
  assert.match(styles, /\.app-scenic-backdrop::after/);
  assert.match(styles, /radial-gradient\(/);
  assert.match(styles, /\.sidebar-rail[\s\S]*?var\(--twilight-navigation-glass\)/);
  assert.match(styles, /\.main-titlebar[\s\S]*?var\(--twilight-navigation-glass\)/);
  assert.match(styles, /\.composer-shell[\s\S]*?var\(--twilight-luminous-border\)/);
  assert.match(styles, /\.dialog[\s\S]*?var\(--twilight-safety-surface\)/);
  assert.match(styles, /\.tool-row-content[\s\S]*?var\(--twilight-safety-surface\)/);
  assert.match(shellChildRule, /z-index:\s*1/);
  assert.doesNotMatch(shellChildRule, /position\s*:/);
  assert.match(styles, /backdrop-filter:\s*blur\(/);
  assert.match(styles, /@media \(prefers-reduced-transparency: reduce\)/);
  assert.match(styles, /@supports not \(backdrop-filter: blur\(1px\)\)/);
  assert.match(styles, /--twilight-safety-surface:\s*rgba\(/);
});

test("Twilight overrides the dark composer and Settings rail instead of inheriting black surfaces", () => {
  assert.match(
    styles,
    /\[data-scenic-theme="twilight-mountains"\][\s\S]*?\.composer-shell\.is-file-drop-active[\s\S]*?background:\s*linear-gradient/,
  );
  assert.match(
    styles,
    /\[data-scenic-theme="twilight-mountains"\][\s\S]*?\.settings-shell-full \.settings-nav[\s\S]*?background:\s*var\(--twilight-navigation-glass\)/,
  );
  assert.match(
    styles,
    /\[data-scenic-theme="twilight-mountains"\][\s\S]*?\.settings-search[\s\S]*?background:\s*var\(--twilight-safety-surface\)/,
  );
});

test("Twilight preserves scenic depth and separates adjacent selected sidebar rows", () => {
  assert.match(styles, /\.app-scenic-backdrop[\s\S]*?filter:\s*saturate\(1\.12\) blur\(2px\)/);
  assert.match(styles, /linear-gradient\(180deg, rgba\(3, 16, 54, 0\.1\)/);
  assert.match(styles, /\.composer-shell[\s\S]*?rgba\(58, 119, 212, 0\.46\)/);
  assert.match(styles, /\.project-group\.active > \.sidebar-session-group-header[\s\S]*?background:\s*rgba\(125, 174, 246, 0\.18\)/);
  assert.match(styles, /\.project-group\.active > \.sidebar-session-group-header \+ \.sidebar-session-group-body\.project[\s\S]*?padding-top:\s*4px/);
  assert.match(styles, /\.thread-content[\s\S]*?padding-top:\s*calc\(var\(--ds-toolbar-height\) \+ 8px\)/);
});

test("Twilight alone replaces the empty-home mascot with the localized build greeting", () => {
  assert.match(chatSurface, /const isTwilightMountains = settings\?\.theme === "twilight-mountains"/);
  assert.match(chatSurface, /className=\{`home-main-content\$\{isTwilightMountains \? " is-twilight-mountains" : ""\}`\}/);
  assert.match(chatSurface, /\{!isTwilightMountains \? \(\s*<div[\s\S]*?<HomeMascotLogo \/>/);
  assert.match(chatSurface, /isTwilightMountains \? t\("chat\.emptyTitle"\)/);
  assert.match(styles, /\[data-scenic-theme="twilight-mountains"\] \.empty-hero-icon\s*\{[\s\S]*?display:\s*none;/);
});
