import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("project groups and memory have shared contracts", () => {
  const types = read("../../packages/shared/src/types.ts");
  assert.match(types, /export type ProjectGroup/);
  assert.match(types, /export type ProjectMemoryView/);
  const prefs = read("src/lib/sidebar-preferences.ts");
  assert.match(prefs, /projectGroups/);
  assert.match(prefs, /saveSidebarPreferences/);
});

test("sidebar exposes group actions and keeps memory project scoped", () => {
  const sidebar = read("src/components/Sidebar.tsx");
  assert.match(sidebar, /createProjectGroup|renameProjectGroup|moveProjectToGroup/);
  assert.match(sidebar, /ProjectGroupCreateDialog/);
  assert.doesNotMatch(sidebar, /window\.prompt\(/);
  const vault = read("src/components/workpanel/ContextVaultTab.tsx");
  assert.match(vault, /projectPath/);
  assert.match(vault, /ContextVault/);
  assert.match(vault, /getProjectMemory/);
  const api = read("src/lib/api.ts");
  assert.match(api, /contextVaultMemory/);
});
