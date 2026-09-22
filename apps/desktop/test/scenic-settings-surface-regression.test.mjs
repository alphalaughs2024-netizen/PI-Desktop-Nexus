import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const themes = [
  "twilight-mountains",
  "alpine-light",
  "obsidian-horizon",
  "emerald-afterglow",
];

const styles = Object.fromEntries(
  await Promise.all(
    themes.map(async (theme) => [
      theme,
      await readFile(new URL(`../src/styles/${theme}.css`, import.meta.url), "utf8"),
    ]),
  ),
);
const projectsStyles = await readFile(new URL("../src/styles/projects.css", import.meta.url), "utf8");
const scenicStyles = await readFile(new URL("../src/styles/scenic-themes.css", import.meta.url), "utf8");

test("scenic Settings dissolves the Project archive parent while preserving row tiles", () => {
  const parentRule = /:root\[data-scenic-theme\] \.settings-shell-full \.settings-panel\.projects-list\s*\{([^}]*)\}/.exec(scenicStyles)?.[1] ?? "";
  assert.match(parentRule, /background:\s*transparent/);
  assert.match(parentRule, /border:\s*0/);
  assert.match(parentRule, /box-shadow:\s*none/);
  assert.match(parentRule, /overflow:\s*visible/);
  assert.match(scenicStyles, /:root\[data-scenic-theme\][\s\S]*\.projects-list/);
  assert.equal(Object.keys(styles).length, 4);
  assert.match(projectsStyles, /\.projects-row-block\s*\{[\s\S]*?background:/);
  assert.match(projectsStyles, /\.projects-name-title\s*\{[\s\S]*?color:\s*var\(--ds-text-primary\)/);
});

test("scenic Settings fallbacks keep Project archive parent transparency", () => {
  assert.match(scenicStyles, /prefers-reduced-transparency: reduce[\s\S]*?\.settings-panel\.projects-list[\s\S]*?background:\s*transparent/);
  assert.match(scenicStyles, /supports not \(backdrop-filter: blur\(1px\)\)[\s\S]*?\.settings-panel\.projects-list[\s\S]*?background:\s*transparent/);
});
