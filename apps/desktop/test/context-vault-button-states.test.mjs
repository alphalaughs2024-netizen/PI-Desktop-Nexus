import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const styles = await readFile(new URL("../src/styles/work-panel.css", import.meta.url), "utf8");
const component = await readFile(new URL("../src/components/workpanel/ContextVaultTab.tsx", import.meta.url), "utf8");
const themes = await Promise.all(["twilight-mountains", "alpine-light", "obsidian-horizon", "emerald-afterglow"].map((name) => readFile(new URL(`../src/styles/${name}.css`, import.meta.url), "utf8")));

test("Context Vault button states have explicit enabled and disabled semantics", () => {
  for (const theme of themes) {
    for (const token of ["primary-surface", "primary-hover", "primary-text", "secondary-surface", "secondary-hover", "secondary-border", "secondary-text", "disabled-primary-surface", "disabled-primary-border", "disabled-primary-text", "disabled-secondary-surface", "disabled-secondary-border", "disabled-secondary-text", "focus"]) assert.match(theme, new RegExp(`--context-vault-${token}`));
  }
  assert.match(styles, /\.context-vault-action-primary:disabled, \.context-vault-empty-action:disabled/);
  assert.match(styles, /\.context-vault-action-secondary:disabled/);
  assert.match(styles, /opacity: 1/);
  assert.match(styles, /context-vault-action-primary:disabled:hover/);
});

test("Ready empty projects keep primary actions available while loading/busy state is explicit", () => {
  assert.match(component, /const actionsDisabled = claimsLoading \|\| busy !== null/);
  assert.match(component, /context-vault-empty-action[^>]*disabled=\{actionsDisabled\}/);
  assert.match(component, /context-vault-operation-status/);
  assert.match(component, /disabled=\{actionsDisabled \|\| claims\.length === 0\}/);
});
