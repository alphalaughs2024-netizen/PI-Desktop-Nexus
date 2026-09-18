import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
const root = path.resolve(import.meta.dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("collections support multiple memberships and canonical projects", () => {
  const types = read("../../packages/shared/src/types.ts");
  assert.match(types, /ProjectCollection/);
  assert.match(types, /ProjectCollectionMembership/);
  const prefs = read("src/lib/sidebar-preferences.ts");
  assert.match(prefs, /projectCollections/);
  assert.match(prefs, /projectCollectionMemberships/);
});

test("sidebar exposes collection assignment and ungrouped handling", () => {
  const sidebar = read("src/components/Sidebar.tsx");
  assert.match(sidebar, /addProjectToCollection/);
  assert.match(sidebar, /removeProjectFromCollection/);
  assert.match(sidebar, /UNGROUPED|Ungrouped|ungrouped/);
  const picker = read("src/components/ProjectCollectionPicker.tsx");
  assert.match(picker, /Manage collections/);
});

test("sidebar renders canonical collections and does not resurrect legacy empty groups", () => {
  const sidebar = read("src/components/Sidebar.tsx");
  assert.match(sidebar, /const visibleCollections/);
  assert.match(sidebar, /Only canonical collections/);
  assert.doesNotMatch(sidebar, /projectCollections\.length \? projectCollections : projectGroups/);
});

test("preference writes retire the legacy project-group payload", () => {
  const prefs = read("src/lib/sidebar-preferences.ts");
  assert.match(prefs, /projectGroups: \[\]/);
  assert.match(prefs, /Collections are canonical/);
});

test("legacy group migration clears remembered tabs once", () => {
  const prefs = read("src/lib/sidebar-preferences.ts");
  assert.match(prefs, /hasLegacyGroups/);
  assert.match(prefs, /openProjectPaths: hasLegacyGroups/);
});

test("empty collections remain visible and expose project assignment", () => {
  const sidebar = read("src/components/Sidebar.tsx");
  assert.match(sidebar, /const visibleCollections = projectCollections/);
  assert.match(sidebar, /Add project/);
  assert.match(sidebar, /ProjectCollectionPicker/);
});

test("collection picker supports assigning an existing project", () => {
  const picker = read("src/components/ProjectCollectionPicker.tsx");
  assert.match(picker, /projects/);
  assert.match(picker, /assignmentCollectionId/);
  assert.match(picker, /project-collection-project/);
});

test("collection picker is an anchored sidebar popover, not a centered modal", () => {
  const picker = read("src/components/ProjectCollectionPicker.tsx");
  const styles = read("src/styles/project-groups.css");
  assert.match(picker, /anchor/);
  assert.match(picker, /collection-picker-popover/);
  assert.match(styles, /\.collection-picker-popover/);
  assert.doesNotMatch(styles, /project-group-modal-backdrop \{[^}]*place-items: center/);
});

test("canonical collection operations and ordering are exposed", () => {
  const store = read("src/stores/app-store.ts");
  for (const operation of [
    "createProjectCollection",
    "renameProjectCollection",
    "deleteProjectCollection",
    "toggleProjectCollectionCollapsed",
    "moveProjectCollection",
    "moveProjectWithinCollection",
    "moveProjectToCollection",
  ]) {
    assert.match(store, new RegExp(`${operation}:`));
  }
});

test("group headers expose actions and safe drag targets", () => {
  const sidebar = read("src/components/Sidebar.tsx");
  assert.match(sidebar, /data-sidebar-project-folder/);
  assert.match(sidebar, /data-action=\"collection-menu\"/);
  assert.match(sidebar, /draggable/);
  assert.match(sidebar, /onDragOver/);
  assert.match(sidebar, /onDrop/);
  assert.match(sidebar, /Ungrouped/);
});

test("assignment panel has distinct project and group modes", () => {
  const picker = read("src/components/ProjectCollectionPicker.tsx");
  assert.match(picker, /Organize project/);
  assert.match(picker, /Add projects to/);
  assert.match(picker, /Create project group/);
  assert.match(picker, /aria-modal=\"true\"/);
});

test("project actions can remove individual memberships without deleting projects", () => {
  const sidebar = read("src/components/Sidebar.tsx");
  assert.match(sidebar, /remove-project-from-collection/);
  assert.match(sidebar, /removeProjectFromCollection\(entry\.path, membership\.collectionId\)/);
  assert.doesNotMatch(sidebar, /deleteProjectCollection\(entry\.path/);
});
