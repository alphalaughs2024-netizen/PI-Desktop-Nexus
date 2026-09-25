import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const themeNames = ["twilight-mountains", "alpine-light", "obsidian-horizon", "emerald-afterglow"];
const themeSources = await Promise.all(themeNames.map((name) => readFile(new URL(`../src/styles/${name}.css`, import.meta.url), "utf8")));
const styles = await readFile(new URL("../src/styles/work-panel.css", import.meta.url), "utf8");

test("Context Vault has one translucent winning token mapping per scenic theme", () => {
  for (const source of themeSources) {
    const mappings = source.match(/context-vault-tab \{[^}]*--context-vault-surface:[^}]*\}/g) ?? [];
    assert.equal(mappings.length, 1);
    assert.match(mappings[0], /--context-vault-surface: rgba\([^;]+, \.(?:18|24|28)/);
  }
  assert.match(styles, /\.context-vault-tab \{ position: relative; padding: 0; background: var\(--context-vault-surface\)/);
  assert.doesNotMatch(styles, /context-vault-tab \{[^}]*background: var\(--ds-bg-primary\)/);
});
