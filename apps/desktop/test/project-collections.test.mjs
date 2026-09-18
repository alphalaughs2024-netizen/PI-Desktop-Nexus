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
  assert.match(styles, /project-group-modal-backdrop/);
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
  assert.match(sidebar, /sidebar-project-group-header[^>]*onPointerDown=\{\(event\) => startCollectionDrag/);
  assert.match(sidebar, /data-project-collection-row=\{entry\.key\}[^>]*onPointerDown=\{\(event\) => startCollectionDrag/);
  assert.match(sidebar, /onPointerDown/);
  assert.match(sidebar, /projectCollectionDragShouldArm/);
  assert.match(sidebar, /data-drop-position/);
  assert.match(sidebar, /Ungrouped/);
});

test("group and project rows use their full surface for manual drag without visible reorder icons", () => {
  const sidebar = read("src/components/Sidebar.tsx");
  const styles = read("src/styles/project-groups.css");
  assert.match(sidebar, /IconArrowUpDown/); // The remaining instance is the project-sort control, not a drag handle.
  assert.doesNotMatch(sidebar, /sidebar-collection-drag-handle/);
  assert.doesNotMatch(sidebar, /sidebar-project-drag-handle/);
  assert.match(sidebar, /sidebar-project-group-header[^>]*onPointerDown=\{\(event\) => startCollectionDrag/);
  assert.match(sidebar, /data-project-collection-row=\{entry\.key\}[^>]*onPointerDown=\{\(event\) => startCollectionDrag/);
  assert.doesNotMatch(styles, /sidebar-collection-drag-handle|sidebar-project-drag-handle/);
});

test("the project sort control keeps its icon dependency after drag handles are removed", () => {
  const sidebar = read("src/components/Sidebar.tsx");
  assert.match(sidebar, /import[\s\S]*IconArrowUpDown[\s\S]*from "\.\/icons"/);
  assert.match(sidebar, /data-action="session-sort"[\s\S]*IconArrowUpDown/);
});

test("collection drag controller preserves click until the movement threshold", () => {
  const controller = read("src/lib/sidebar-project-collection-drag.ts");
  assert.match(controller, /PROJECT_COLLECTION_DRAG_ARM_PX/);
  assert.match(controller, /projectCollectionDragShouldArm/);
  assert.match(controller, /projectCollectionInsertAfter/);
  assert.match(controller, /Escape/);
});

test("dragging between groups adds membership without removing the source", () => {
  const store = read("src/stores/app-store.ts");
  const move = store.slice(store.indexOf("moveProjectToCollection: (path, sourceCollectionId"), store.indexOf("moveProjectToGroup:", store.indexOf("moveProjectToCollection: (path, sourceCollectionId")));
  assert.doesNotMatch(move, /sourceCollectionId && item\.collectionId/);
  assert.match(move, /targetItems\.splice/);
});

test("assignment panel has distinct project and group modes", () => {
  const picker = read("src/components/ProjectCollectionPicker.tsx");
  assert.match(picker, /Organize project/);
  assert.match(picker, /Add projects to/);
  assert.match(picker, /Create project group/);
  assert.doesNotMatch(picker, /aria-modal=\"true\"/);
});

test("project actions can remove individual memberships without deleting projects", () => {
  const sidebar = read("src/components/Sidebar.tsx");
  assert.match(sidebar, /remove-project-from-collection/);
  assert.match(sidebar, /removeProjectFromCollection\(entry\.path, membership\.collectionId\)/);
  assert.doesNotMatch(sidebar, /deleteProjectCollection\(entry\.path/);
});

test("project menus expose membership ordering alternatives", () => {
  const sidebar = read("src/components/Sidebar.tsx");
  assert.match(sidebar, /data-action=\"move-project-up\"/);
  assert.match(sidebar, /data-action=\"move-project-down\"/);
});

test("project filesystem paths stay accessible without a persistent visual tooltip", () => {
  const sidebar = read("src/components/Sidebar.tsx");
  const projectBlock = sidebar.slice(sidebar.indexOf('className="sidebar-session-group-title project-toggle"'), sidebar.indexOf('className="sidebar-session-group-title project-toggle"') + 700);
  assert.doesNotMatch(projectBlock, /tooltip=\{entry\.path\}/);
  assert.match(projectBlock, /aria-describedby=\{`\$\{projectId\}-path-description`\}/);
});

test("sessions can move between projects with confirmation-aware drag targets", () => {
  const sidebar = read("src/components/Sidebar.tsx");
  const store = read("src/stores/app-store.ts");
  const api = read("src/lib/api.ts");
  const protocol = read("../../packages/shared/src/protocol.ts");
  assert.match(sidebar, /draggingSessionId/);
  assert.match(sidebar, /moveSessionToProject/);
  assert.match(sidebar, /event\.shiftKey/);
  assert.match(sidebar, /window\.confirm/);
  assert.match(store, /moveSessionToProject:/);
  assert.match(api, /moveSessionProject:/);
  assert.match(protocol, /sessionMoveProject/);
});

test("sidebar builds project hierarchy from every session project and labels standalone sessions", () => {
  const sidebar = read("src/components/Sidebar.tsx");
  assert.match(sidebar, /add\(sessionPath, undefined, undefined, false\)/);
  assert.match(sidebar, /nav\.standaloneSessions/);
  assert.match(sidebar, /data-sidebar-session-project=\{entry\.path\}/);
});
