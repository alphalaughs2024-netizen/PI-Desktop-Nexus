import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { register } from "node:module";
import test from "node:test";
import { pathToFileURL } from "node:url";

const root = path.resolve(import.meta.dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
register(pathToFileURL(path.join(root, "test/helpers/ts-import-hooks.mjs")));

test("assignment placement prefers the main-content side and stays in the viewport", async () => {
  const positioning = await import("../src/lib/project-collection-picker-position.ts");
  const place = positioning.placeProjectCollectionPicker;
  const result = place({
    anchor: { left: 420, right: 520, top: 180, bottom: 220 },
    panel: { width: 340, height: 420 },
    viewport: { width: 1440, height: 900 },
    protected: { top: 46, right: 0, bottom: 24, left: 0 },
    preferredSide: "right",
  });
  assert.equal(result.side, "right");
  assert.equal(result.left, 528);
  assert.ok(result.top >= 46);
  assert.ok(result.top + 420 <= 876);
});

test("assignment placement flips or clamps near the right, top, and bottom edges", async () => {
  const { placeProjectCollectionPicker } = await import("../src/lib/project-collection-picker-position.ts");
  const result = placeProjectCollectionPicker({
    anchor: { left: 1270, right: 1340, top: 4, bottom: 38 },
    panel: { width: 340, height: 700 },
    viewport: { width: 1440, height: 800 },
    protected: { top: 46, right: 8, bottom: 24, left: 8 },
    preferredSide: "right",
  });
  assert.equal(result.side, "left");
  assert.ok(result.left >= 8);
  assert.ok(result.left + 340 <= 1432);
  assert.equal(result.top, 46);
  assert.ok(result.top + 700 <= 776);
});

test("assignment panel is portaled and observes all layout changes", () => {
  const picker = read("src/components/ProjectCollectionPicker.tsx");
  assert.match(picker, /createPortal/);
  assert.match(picker, /getBoundingClientRect/);
  assert.match(picker, /ResizeObserver/);
  assert.match(picker, /addEventListener\("resize"/);
  assert.match(picker, /addEventListener\("scroll"/);
  assert.match(picker, /focus\(\)/);
  assert.doesNotMatch(picker, /aria-modal="true"/);
});

test("create-group dialog is an independently centered viewport dialog", () => {
  const dialog = read("src/components/ProjectGroupCreateDialog.tsx");
  const styles = read("src/styles/project-groups.css");
  assert.match(dialog, /createPortal/);
  assert.match(dialog, /document\.body/);
  assert.match(dialog, /Escape/);
  assert.match(dialog, /focus\(\)/);
  assert.match(styles, /project-group-modal-backdrop[^{]*\{[^}]*display:\s*grid/);
  assert.match(styles, /project-group-modal-backdrop[^{]*\{[^}]*place-items:\s*center/);
  assert.match(styles, /project-group-modal[^{]*\{[^}]*max-height/);
});

test("sidebar exposes distinct group, project, nested-session, and standalone markers", () => {
  const sidebar = read("src/components/Sidebar.tsx");
  const styles = read("src/styles/project-groups.css");
  assert.match(sidebar, /sidebar-project-group-folder/);
  assert.match(sidebar, /sidebar-project-collection-row/);
  assert.match(sidebar, /sidebar-session-project-row/);
  assert.match(sidebar, /sidebar-standalone-session-row/);
  assert.match(styles, /sidebar-project-collection-row[^{]*\{[^}]*padding-left/);
  assert.match(styles, /sidebar-session-project-row[^{]*\{[^}]*padding-left/);
});
