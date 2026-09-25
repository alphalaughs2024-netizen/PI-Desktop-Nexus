import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const tab = await readFile(new URL("../src/components/workpanel/ContextVaultTab.tsx", import.meta.url), "utf8");
const styles = await readFile(new URL("../src/styles/work-panel.css", import.meta.url), "utf8");
const api = await readFile(new URL("../src/lib/api.ts", import.meta.url), "utf8");
const main = await readFile(new URL("../electron/main/index.ts", import.meta.url), "utf8");
const protocol = await readFile(new URL("../../../packages/shared/src/protocol.ts", import.meta.url), "utf8");
const en = await readFile(new URL("../../../packages/i18n/src/locales/en/index.ts", import.meta.url), "utf8");
const zhCN = await readFile(new URL("../../../packages/i18n/src/locales/zh-CN/index.ts", import.meta.url), "utf8");
const workPanel = await readFile(new URL("../src/components/workpanel/WorkPanel.tsx", import.meta.url), "utf8");

test("Context Vault has a localized native tab and visible controls", () => {
  assert.match(en, /contextVault: "Context Vault"/);
  assert.match(zhCN, /contextVault: "上下文保险库"/);
  assert.match(tab, /useTranslation/);
  assert.match(tab, /t\("panel\.tabs\.contextVault"\)/);
  assert.match(tab, /t\("contextVault\.evidencePath"\)/);
  assert.match(tab, /t\(`contextVault\.categories\.\$\{item\}`\)/);
  assert.match(tab, /context-vault-action context-vault-action-primary/);
  assert.match(tab, /context-vault-action context-vault-action-secondary/);
});

test("Context Vault creates a project-scoped session instead of silently ignoring the opener", () => {
  assert.match(workPanel, /const activeSessionId = useAppStore\(\(s\) => s\.activeSessionId\);/);
  assert.match(workPanel, /const ensureSession = useCallback\(async \(\) =>/);
  assert.match(workPanel, /await newSession\(\{ projectPath: activeProjectPath \}\)/);
  assert.match(workPanel, /Select a project before opening a work panel tool/);
  assert.doesNotMatch(workPanel, /disabled=\{!activeSessionId\}/);
  assert.match(tab, /activeSession\?\.projectPath \?\? state\.activeProjectPath/);
});

test("Context Vault stacks and wraps instead of overflowing a narrow work panel", () => {
  assert.match(styles, /\.context-vault-actions \{[\s\S]*?flex-wrap: wrap/);
  assert.match(styles, /@media \(max-width: 720px\) \{[\s\S]*?\.context-vault-grid\.is-editing \{[\s\S]*?grid-template-columns: minmax\(0, 1fr\)/);
  assert.match(styles, /\.context-vault-list,\s*\.context-vault-editor \{[\s\S]*?min-width: 0/);
});

test("Context Vault gives its empty state the full panel and reserves a separate action toolbar", () => {
  assert.match(tab, /context-vault-actions/);
  assert.match(tab, /const isEditing = creating \|\| selected !== null/);
  assert.match(tab, /context-vault-grid\$\{isEditing \? " is-editing" : ""\}/);
  assert.match(styles, /\.context-vault-grid \{[\s\S]*?grid-template-columns: minmax\(0, 1fr\)/);
  assert.match(styles, /\.context-vault-actions \{[\s\S]*?flex-wrap: wrap/);
  assert.match(styles, /@media \(max-width: 720px\) \{[\s\S]*?\.context-vault-grid\.is-editing \{[\s\S]*?grid-template-columns: minmax\(0, 1fr\)/);
});

test("Context Vault gives buttons and form fields an explicit native surface", () => {
  assert.match(styles, /\.context-vault-action \{[\s\S]*?min-height: 30px[\s\S]*?border: 1px solid var\(--ds-border\)[\s\S]*?background: var\(--ds-tile\)/);
  assert.match(styles, /\.context-vault-action-primary \{[\s\S]*?background: var\(--ds-accent\)/);
  assert.match(styles, /\.context-vault-search,[\s\S]*?background: var\(--ds-tile\)[\s\S]*?border: 1px solid var\(--ds-border\)/);
  assert.match(styles, /\.context-vault-editor label \{[\s\S]*?gap: 4px/);
});

test("Context Vault has a native category rail and an intentional empty workspace", () => {
  assert.match(tab, /context-vault-rail/);
  assert.match(tab, /context-vault-category/);
  assert.match(tab, /context-vault-empty-action/);
  assert.match(tab, /IconPlus/);
  assert.match(styles, /\.context-vault-workspace \{[\s\S]*?grid-template-columns: minmax\(124px, 0\.32fr\) minmax\(0, 1fr\)/);
  assert.match(styles, /\.context-vault-empty \{[\s\S]*?align-items: center[\s\S]*?justify-content: center/);
});

test("Context Vault previews an import and applies only the user's selected claims", () => {
  assert.match(protocol, /contextVaultImportPreview: "pi-desktop\/contextVault\/importPreview"/);
  assert.match(protocol, /contextVaultImportApply: "pi-desktop\/contextVault\/importApply"/);
  assert.match(api, /previewContextVaultImport/);
  assert.match(api, /applyContextVaultImport/);
  assert.match(main, /IPC\.invoke\.contextVaultImportPreview/);
  assert.match(main, /IPC\.invoke\.contextVaultImportApply/);
  assert.doesNotMatch(main, /contextVaultImport,[\s\S]{0,1200}\.filter\(\(item\) => item\.status === "selectable"\)[\s\S]{0,400}contextVault\.importApply/);
  assert.match(tab, /context-vault-import-sheet/);
  assert.match(tab, /applyContextVaultImport/);
});

test("Context Vault provides a complete native editing workspace instead of a single-evidence form", () => {
  assert.match(tab, /context-vault-rail-brand/);
  assert.doesNotMatch(tab, /context-vault-purpose-cards/);
  assert.match(tab, /context-vault-evidence-row/);
  assert.match(tab, /context-vault-relationship-section/);
  assert.match(tab, /context-vault-relationship-row/);
  assert.match(tab, /context-vault-review-section/);
  assert.match(tab, /context-vault-modal-backdrop/);
  assert.match(tab, /evidence: \[evidenceRow\(\)\]/);
  assert.match(styles, /\.context-vault-modal-backdrop \{/);
  assert.match(styles, /\.context-vault-purpose-cards \{/);
  assert.match(styles, /\.context-vault-evidence-row \{/);
});

test("empty work panel exposes Context Vault beside Browser and Files", () => {
  assert.match(workPanel, /data-testid=\"work-panel-empty\"/);
  assert.match(workPanel, /onClick=\{\(\) => void openContextVault\(\)\}/);
  assert.match(workPanel, /data-work-panel-context-vault/);
  assert.match(workPanel, /panel\.tabs\.contextVault/);
});
