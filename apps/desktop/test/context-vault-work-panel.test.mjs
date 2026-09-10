import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const tab = await readFile(new URL("../src/components/workpanel/ContextVaultTab.tsx", import.meta.url), "utf8");
const styles = await readFile(new URL("../src/styles/work-panel.css", import.meta.url), "utf8");
const en = await readFile(new URL("../../../packages/i18n/src/locales/en/index.ts", import.meta.url), "utf8");
const zhCN = await readFile(new URL("../../../packages/i18n/src/locales/zh-CN/index.ts", import.meta.url), "utf8");

test("Context Vault has a localized native tab and visible controls", () => {
  assert.match(en, /contextVault: "Context Vault"/);
  assert.match(zhCN, /contextVault: "上下文保险库"/);
  assert.match(tab, /useTranslation/);
  assert.match(tab, /t\("panel\.tabs\.contextVault"\)/);
  assert.match(tab, /t\("contextVault\.evidencePath"\)/);
  assert.match(tab, /t\(`contextVault\.categories\.\$\{category\}`\)/);
});

test("Context Vault stacks and wraps instead of overflowing a narrow work panel", () => {
  assert.match(styles, /\.context-vault-header \{[\s\S]*?flex-wrap: wrap/);
  assert.match(styles, /\.context-vault-header > div:last-child \{[\s\S]*?flex-wrap: wrap/);
  assert.match(styles, /@media \(max-width: 560px\) \{[\s\S]*?\.context-vault-grid \{[\s\S]*?grid-template-columns: minmax\(0, 1fr\)/);
  assert.match(styles, /\.context-vault-list,\s*\.context-vault-editor \{[\s\S]*?min-width: 0/);
});
