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

test("Twilight uses one inert backdrop, glass semantic tokens, and readable fallbacks", () => {
  const shellChildRule =
    /\.app-shell > :not\(\.app-scenic-backdrop\)[^{]*\{([^}]*)\}/.exec(styles)?.[1] ?? "";

  assert.match(styles, /:root\[data-theme="dark"\]\[data-scenic-theme="twilight-mountains"\]/);
  assert.match(styles, /\.app-scenic-backdrop[\s\S]*?pointer-events:\s*none/);
  assert.match(styles, /\.app-scenic-backdrop[\s\S]*?twilight-mountains\.png/);
  assert.match(styles, /\.app-scenic-backdrop::after/);
  assert.match(shellChildRule, /z-index:\s*1/);
  assert.doesNotMatch(shellChildRule, /position\s*:/);
  assert.match(styles, /backdrop-filter:\s*blur\(/);
  assert.match(styles, /@media \(prefers-reduced-transparency: reduce\)/);
  assert.match(styles, /@supports not \(backdrop-filter: blur\(1px\)\)/);
  assert.match(styles, /--ds-bg-elevated-opaque:\s*rgba\(/);
});
