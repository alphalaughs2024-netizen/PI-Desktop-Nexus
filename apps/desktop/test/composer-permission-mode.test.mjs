import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const composerSource = await readFile(
  new URL("../src/components/Composer.tsx", import.meta.url),
  "utf8",
);

test("Agent and Plan permission menus present only effective selectable modes", () => {
  const permissionControlSource = composerSource.slice(
    composerSource.indexOf('<div className="composer-permission"'),
    composerSource.indexOf('<div className="composer-right">'),
  );

  assert.match(
    composerSource,
    /mode === "agent"[\s\S]*\["ask", "auto", "full-access"\]/,
  );
  assert.match(
    permissionControlSource,
    /aria-checked=\{composerPermissionMode === candidate\}/,
  );
  assert.match(
    permissionControlSource,
    /\{t\(PERMISSION_MODE_I18N_KEYS\[candidate\]\)\}/,
  );
  assert.doesNotMatch(permissionControlSource, /permissionInherit/);
  assert.doesNotMatch(permissionControlSource, /\["inherit",/);
});

test("Goal keeps the permission chip visible but fixes it to Full auto", () => {
  const permissionControlSource = composerSource.slice(
    composerSource.indexOf('<div className="composer-permission"'),
    composerSource.indexOf('<div className="composer-right">'),
  );

  assert.match(
    composerSource,
    /const composerPermissionMode: Exclude<PermissionMode, "inherit"> =\s*\n\s*mode === "goal" \? "auto" : effectivePermissionMode;/,
  );
  assert.match(permissionControlSource, /mode === "goal" \? undefined : "menu"/);
  assert.match(permissionControlSource, /disabled=\{controlsBlocked \|\| mode === "goal"\}/);
  assert.match(permissionControlSource, /permissionOpen && mode !== "goal"/);
});

test("Agent permission menu offers Full access while Plan does not", () => {
  const permissionControlSource = composerSource.slice(
    composerSource.indexOf('<div className="composer-permission"'),
    composerSource.indexOf('<div className="composer-right">'),
  );

  assert.match(permissionControlSource, /full-access/);
  assert.match(composerSource, /fullAccess/);
  assert.match(composerSource, /: \(\["ask", "accept-edits", "auto"\] as const\)/);
});

test("Full access confirmation is portaled outside the bottom composer dock", () => {
  assert.match(composerSource, /createPortal\(/);
  assert.match(composerSource, /document\.body/);
  assert.match(composerSource, /composer-full-access-overlay/);
});

test("Full access confirmation action keeps readable text on the danger fill", async () => {
  const styles = await readFile(
    new URL("../src/styles/composer-menus.css", import.meta.url),
    "utf8",
  );
  const dangerRule = styles.slice(
    styles.indexOf(".composer-full-access-actions button.danger {"),
    styles.indexOf(".composer-full-access-actions button.danger:hover"),
  );
  assert.match(dangerRule, /background: var\(--ds-error\)/);
  assert.match(dangerRule, /color: #fff/);
});
