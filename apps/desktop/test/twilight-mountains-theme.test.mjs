import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import test from "node:test";
import { loadStyles } from "./helpers/styles.mjs";

const appSource = await readFile(new URL("../src/App.tsx", import.meta.url), "utf8");
const themeRowSource = await readFile(
  new URL("../src/components/settings/ThemeRow.tsx", import.meta.url),
  "utf8",
);
const twilightBackdropBlurRowSource = await readFile(
  new URL("../src/components/settings/TwilightBackdropBlurRow.tsx", import.meta.url),
  "utf8",
);
const settingsPageSource = await readFile(
  new URL("../src/pages/SettingsPage.tsx", import.meta.url),
  "utf8",
);
const apiSource = await readFile(new URL("../src/lib/api.ts", import.meta.url), "utf8");
const mainSource = await readFile(new URL("../electron/main/index.ts", import.meta.url), "utf8");
const chatSurface = await readFile(new URL("../src/components/ChatSurface.tsx", import.meta.url), "utf8");
const twilightStyles = await readFile(new URL("../src/styles/twilight-mountains.css", import.meta.url), "utf8");
const alpineStyles = await readFile(new URL("../src/styles/alpine-light.css", import.meta.url), "utf8");
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
  assert.match(effect, /document\.documentElement\.dataset\.scenicTheme = preference/);
  assert.match(effect, /document\.documentElement\.dataset\.scenicBackdropBlur/);
  assert.match(effect, /delete document\.documentElement\.dataset\.scenicTheme/);
  assert.match(effect, /delete document\.documentElement\.dataset\.scenicBackdropBlur/);
  assert.match(effect, /document\.documentElement\.dataset\.theme = resolvedTheme/);
  assert.match(effect, /\.setWindowBackgroundColor\(/);
  assert.match(
    appSource,
    /\}, \[settings\?\.theme, settings\?\.scenicBackdropBlur, settings\?\.twilightBackdropBlur, pluginThemes\]\);/,
  );
  assert.match(appSource, /className="app-scenic-backdrop"/);
});

test("Twilight backdrop blur is persisted, validated, and available only with the scenic theme", () => {
  assert.match(sharedTypes, /type ScenicBackdropBlur = "low" \| "medium" \| "high"/);
  assert.match(sharedTypes, /DEFAULT_TWILIGHT_BACKDROP_BLUR/);
  assert.match(sharedTypes, /normalizeTwilightBackdropBlur/);
  assert.match(apiSource, /normalizeTwilightBackdropBlur/);
  assert.match(apiSource, /twilightBackdropBlur is invalid/);
  assert.match(twilightBackdropBlurRowSource, /value: "low"/);
  assert.match(twilightBackdropBlurRowSource, /value: "medium"/);
  assert.match(twilightBackdropBlurRowSource, /value: "high"/);
  assert.match(twilightBackdropBlurRowSource, /supportsScenicBackdropBlur/);
  assert.match(twilightBackdropBlurRowSource, /disabled=\{!enabled\}/);
  assert.match(twilightBackdropBlurRowSource, /showToast\(/);
  assert.match(settingsPageSource, /<ThemeRow settings=\{settings\} saveSettings=\{saveSettings\} \/>/);
  assert.match(settingsPageSource, /<ScenicBackdropBlurRow settings=\{settings\} saveSettings=\{saveSettings\} \/>/);
});

test("Twilight maps the persisted blur strengths only to its backdrop image", () => {
  assert.match(twilightStyles, /filter:\s*saturate\(1\.12\) blur\(var\(--twilight-backdrop-blur, 2px\)\)/);
  assert.match(twilightStyles, /\[data-scenic-backdrop-blur="low"\][\s\S]*?--twilight-backdrop-blur:\s*2px/);
  assert.match(twilightStyles, /\[data-scenic-backdrop-blur="medium"\][\s\S]*?--twilight-backdrop-blur:\s*6px/);
  assert.match(twilightStyles, /\[data-scenic-backdrop-blur="high"\][\s\S]*?--twilight-backdrop-blur:\s*12px/);
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

test("Alpine Light is a first-party scenic light theme with its own backdrop contract", async () => {
  assert.match(sharedTypes, /"alpine-light"/);
  assert.match(themeRowSource, /settings\.themeAlpineLight/);
  assert.match(appSource, /preference === "alpine-light"/);
  assert.match(alpineStyles, /data-scenic-theme="alpine-light"/);
  assert.match(alpineStyles, /alpine-light\.png/);
  assert.match(alpineStyles, /data-scenic-backdrop-blur="low"[\s\S]*?4px/);
  assert.match(alpineStyles, /data-scenic-backdrop-blur="medium"[\s\S]*?8px/);
  assert.match(alpineStyles, /data-scenic-backdrop-blur="high"[\s\S]*?16px/);
  assert.match(alpineStyles, /pointer-events:\s*none/);
  assert.match(alpineStyles, /prefers-reduced-transparency/);
  assert.ok((await stat(new URL("../resources/themes/alpine-light.png", import.meta.url))).size > 0);
  assert.match(apiSource, /"alpine-light"/);
  assert.match(mainSource, /theme === "alpine-light" \? "#d7e5f8"/);
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

test("Twilight gives every Settings control readable blue-glass materials", () => {
  const settingsGlassRule =
    /\.settings-shell-full\s*:is\(\.settings-row, \.shortcut-row, \.agent-capability-row, \.agent-capability-empty\)\s*\{([^}]*)\}/.exec(twilightStyles)?.[1] ?? "";
  const primaryButtonRule =
    /\.settings-shell-full \.btn-primary\s*\{([^}]*)\}/.exec(twilightStyles)?.[1] ?? "";

  assert.doesNotMatch(
    twilightStyles,
    /\.permission-card, \.tool-row-content, pre, code, \.plugins-setting-control/,
  );
  assert.match(settingsGlassRule, /background:\s*var\(--twilight-settings-surface\)/);
  assert.match(twilightStyles, /\.agent-capability-group\s*\{[\s\S]*?background:\s*var\(--twilight-settings-strip\)/);
  assert.match(twilightStyles, /\.agent-capability-group-path\s*\{[\s\S]*?background:\s*transparent/);
  assert.match(twilightStyles, /\.settings-shell-full\s*:is\(\.settings-search, \.field-input, \.field-select, \.field-textarea/);
  assert.match(twilightStyles, /\.settings-shell-full \.settings-segment\s*\{[\s\S]*?var\(--twilight-settings-control\)/);
  assert.match(twilightStyles, /\.settings-shell-full :is\([^)]*\.icon-btn/);
  assert.match(primaryButtonRule, /color:\s*#f8fbff/);
  assert.match(primaryButtonRule, /linear-gradient/);
  assert.match(twilightStyles, /\.settings-shell-full \.btn:disabled\s*\{[\s\S]*?color:\s*rgba\(232, 242, 255, 0\.7\)/);
});

test("Twilight keeps independent Settings rows out of a second parent tile", () => {
  const listPanelRule =
    /\.settings-shell-full :is\(\.settings-panel:has\(> \.settings-row\), \.settings-panel:has\(> \.shortcut-row\), \.settings-panel:has\(> \.agent-capability-row\)\)\s*\{([^}]*)\}/.exec(twilightStyles)?.[1] ?? "";

  assert.match(listPanelRule, /background:\s*transparent/);
  assert.match(listPanelRule, /border:\s*0/);
  assert.match(listPanelRule, /box-shadow:\s*none/);
  assert.match(twilightStyles, /\.settings-shell-full :is\(\.settings-row, \.shortcut-row, \.agent-capability-row, \.agent-capability-empty\)\s*\{[\s\S]*?var\(--twilight-settings-surface\)/);
});

test("Twilight styles portaled provider menus and Context Vault as readable blue surfaces", () => {
  const providerMenuRule =
    /\[data-scenic-theme="twilight-mountains"\] \.provider-service-menu\s*\{([^}]*)\}/.exec(twilightStyles)?.[1] ?? "";
  const providerSearchRule =
    /\[data-scenic-theme="twilight-mountains"\] \.provider-service-search\s*\{([^}]*)\}/.exec(twilightStyles)?.[1] ?? "";
  const contextPrimaryRule =
    /\.context-vault-action-primary\s*\{([^}]*)\}/.exec(twilightStyles)?.[1] ?? "";

  assert.match(providerMenuRule, /var\(--twilight-safety-surface\)/);
  assert.match(providerSearchRule, /border:/);
  assert.match(providerSearchRule, /background:/);
  assert.match(twilightStyles, /\.provider-service-option\.is-current\s*\{[\s\S]*?background:/);
  assert.match(contextPrimaryRule, /linear-gradient/);
  assert.doesNotMatch(contextPrimaryRule, /background:\s*var\(--ds-accent\)/);
  assert.match(twilightStyles, /\.context-vault-rail\s*\{[\s\S]*?background:/);
  assert.match(twilightStyles, /\.context-vault-search-shell[\s\S]*?var\(--twilight-settings-control\)/);
});

test("Twilight keeps workflow and native controls above the docked work panel", () => {
  assert.match(
    appSource,
    /<section className="main-pane">[\s\S]*?<WindowControls contained \/>/,
  );
  assert.match(twilightStyles, /\.window-control-btn\s*\{[\s\S]*?color:\s*rgba\(246, 249, 255, 0\.92\)/);
  assert.match(styles, /\.active-workflow-card\s*\{[\s\S]*?margin:\s*calc\(var\(--ds-toolbar-height\) \+ 10px\)/);
  assert.match(styles, /\.active-workflow-card\s*\{[\s\S]*?z-index:\s*11/);
});

test("Twilight preserves scenic depth and separates adjacent selected sidebar rows", () => {
  const projectSessionBodyRule =
    /\.sidebar-session-group-body\.project\s*\{([^}]*)\}/.exec(styles)?.[1] ?? "";

  assert.match(styles, /\.app-scenic-backdrop[\s\S]*?filter:\s*saturate\(1\.12\) blur\(var\(--twilight-backdrop-blur, 2px\)\)/);
  assert.match(styles, /linear-gradient\(180deg, rgba\(3, 16, 54, 0\.1\)/);
  assert.match(styles, /\.composer-shell[\s\S]*?rgba\(58, 119, 212, 0\.46\)/);
  assert.match(styles, /\.project-group\.active > \.sidebar-session-group-header[\s\S]*?background:\s*rgba\(125, 174, 246, 0\.18\)/);
  assert.match(styles, /\.project-group\.active > \.sidebar-session-group-header \+ \.sidebar-session-group-body\.project[\s\S]*?padding-top:\s*4px/);
  assert.match(projectSessionBodyRule, /gap:\s*4px/);
  assert.match(styles, /\.thread-content[\s\S]*?padding-top:\s*calc\(var\(--ds-toolbar-height\) \+ 8px\)/);
});

test("Twilight alone replaces the empty-home mascot with the localized build greeting", () => {
  assert.match(chatSurface, /const isScenicMascotFree/);
  assert.match(chatSurface, /className=\{`home-main-content\$\{isScenicMascotFree \? " is-twilight-mountains" : ""\}`\}/);
  assert.match(chatSurface, /\{!isScenicMascotFree \? \(\s*<div[\s\S]*?<HomeMascotLogo \/>/);
  assert.match(chatSurface, /isScenicMascotFree \? t\("chat\.emptyTitle"\)/);
  assert.match(styles, /\[data-scenic-theme="twilight-mountains"\] \.empty-hero-icon\s*\{[\s\S]*?display:\s*none;/);
  assert.match(alpineStyles, /\.empty-hero-icon\s*\{\s*display:\s*none/);
});
