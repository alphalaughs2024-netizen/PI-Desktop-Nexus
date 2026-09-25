import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const styles = await readFile(new URL("../src/styles/work-panel.css", import.meta.url), "utf8");

test("Context Vault uses translucent semantic surfaces while preserving readable controls", () => {
  assert.match(styles, /--context-vault-surface: color-mix/);
  assert.match(styles, /--context-vault-control-surface: color-mix/);
  assert.match(styles, /backdrop-filter: blur\(16px\)/);
  assert.match(styles, /--context-vault-control-text: var\(--ds-text-primary\)/);
  assert.match(styles, /--context-vault-control-disabled-text: var\(--ds-text-secondary\)/);
});
