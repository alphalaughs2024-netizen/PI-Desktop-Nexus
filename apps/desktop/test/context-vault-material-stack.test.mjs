import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const styles = await readFile(new URL("../src/styles/work-panel.css", import.meta.url), "utf8");
const component = await readFile(new URL("../src/components/workpanel/ContextVaultTab.tsx", import.meta.url), "utf8");

test("Context Vault owns one translucent outer surface and transparent inner layers", () => {
  assert.match(styles, /\.context-vault-tab \{[^}]*background: var\(--context-vault-surface\)/);
  assert.match(styles, /\.context-vault-workspace \{[^}]*background: transparent/);
  assert.match(styles, /\.context-vault-main \{[^}]*background: transparent/);
  assert.match(styles, /\.context-vault-empty \{[^}]*background: transparent/);
  assert.match(styles, /\.context-vault-rail \{[^}]*background: var\(--context-vault-surface-raised\)/);
  assert.match(styles, /\.context-vault-search-shell \{[^}]*background: var\(--context-vault-control-surface\)/);
  assert.match(styles, /\.context-vault-empty-icon \{[^}]*var\(--context-vault-empty-surface\)/);
});

test("Phase 1 does not alter Context Vault behavior or JSX disabled logic", () => {
  assert.match(component, /disabled=\{busy !== null\}/);
  assert.match(component, /disabled=\{busy !== null \|\| claims\.length === 0\}/);
});
