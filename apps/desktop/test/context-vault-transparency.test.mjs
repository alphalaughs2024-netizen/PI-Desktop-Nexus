import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
const styles = await readFile(new URL("../src/styles/work-panel.css", import.meta.url), "utf8");
const themes = await Promise.all(["twilight-mountains", "alpine-light", "obsidian-horizon", "emerald-afterglow"].map((name) => readFile(new URL(`../src/styles/${name}.css`, import.meta.url), "utf8")));
test("Context Vault theme material stays translucent while control tokens stay explicit", () => {
  assert.match(styles, /background: var\(--context-vault-surface\)/);
  assert.match(styles, /backdrop-filter: blur\(16px\)/);
  for (const theme of themes) assert.match(theme, /--context-vault-surface: rgba/);
  assert.match(styles, /--context-vault-control-text: var\(--ds-text-primary\)/);
});
