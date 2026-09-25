import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const component = await readFile(new URL("../src/components/workpanel/ContextVaultTab.tsx", import.meta.url), "utf8");

test("Context Vault defines explicit view states and centralized action availability", () => {
  for (const state of ["no-project", "loading", "ready", "empty", "search-empty", "editing", "busy", "error"]) assert.match(component, new RegExp(`\\"${state}\\"`));
  assert.match(component, /const viewState:/);
  assert.match(component, /const canCreate = Boolean\(projectPath\)/);
  assert.match(component, /const canImport = Boolean\(projectPath\)/);
  assert.match(component, /const canExport = Boolean\(projectPath\).*claims.length > 0/);
});

test("Context Vault exposes stable operation status and distinct loading/search/error UI", () => {
  for (const label of ["Importing…", "Applying import…", "Exporting…", "Saving claim…", "Applying review…", "Rechecking claim…", "Deleting claim…"]) assert.match(component, new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(component, /id="context-vault-operation-status"[^>]*role="status"/);
  assert.match(component, /Unable to load project knowledge/);
  assert.match(component, /Try another search or clear the active filter/);
  assert.match(component, /Clear filters/);
});
