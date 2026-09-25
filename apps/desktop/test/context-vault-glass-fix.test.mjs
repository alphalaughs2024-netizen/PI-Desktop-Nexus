import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const styles = await readFile(new URL("../src/styles/work-panel.css", import.meta.url), "utf8");
const themes = await Promise.all(["twilight-mountains", "alpine-light", "obsidian-horizon", "emerald-afterglow"].map((name) => readFile(new URL(`../src/styles/${name}.css`, import.meta.url), "utf8")));

test("Context Vault final cascade keeps the panel translucent and controls stronger", () => {
  assert.match(styles, /\.context-vault-tab \{ position: relative; padding: 0; background: var\(--context-vault-surface\)/);
  assert.match(styles, /\.context-vault-workspace[\s\S]*background: var\(--context-vault-surface\)/);
  assert.match(styles, /\.context-vault-rail[\s\S]*background: var\(--context-vault-surface-raised\)/);
  for (const theme of themes) assert.match(theme, /--context-vault-surface: rgba\([^;]+, \.3/);
  assert.doesNotMatch(styles, /context-vault-tab \{[^}]*background: var\(--ds-bg-primary\)/);
});
