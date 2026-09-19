import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { loadStyles } from "./helpers/styles.mjs";

const workspacesSource = await readFile(
  new URL("../src/pages/WorkspacesPage.tsx", import.meta.url),
  "utf8",
);
const settingsSource = await readFile(
  new URL("../src/pages/SettingsPage.tsx", import.meta.url),
  "utf8",
);
const styles = await loadStyles();

test("empty Workspaces gives users a useful first action", () => {
  assert.match(workspacesSource, /className="workspace-empty"/);
  assert.match(workspacesSource, /settings\.workspacesEmptyTitle/);
  assert.match(workspacesSource, /settings\.workspacesEmptyBody/);
  assert.match(workspacesSource, /const openProject = useAppStore\(\(state\) => state\.openProject\)/);
  assert.match(workspacesSource, /settings\.workspaceOpenProject/);
  assert.match(workspacesSource, /<IconBranch[^>]*aria-hidden/);
  assert.match(
    styles,
    /\.workspace-empty\s*\{[^}]*background:\s*var\(--ds-tile\);/s,
  );
});

test("Workspaces actions reject duplicate submits and report failures", () => {
  assert.match(workspacesSource, /type WorkspaceAction = "open" \| "reveal" \| "cleanup"/);
  assert.match(workspacesSource, /const \[pendingActions, setPendingActions\]/);
  assert.match(workspacesSource, /if \(pendingActionsRef\.current\.has\(actionKey\)\) return;/);
  assert.match(workspacesSource, /showToast\([\s\S]*variant: "error"/);
  assert.match(workspacesSource, /disabled=\{[^}]*pendingForRow\.includes/);
  assert.match(workspacesSource, /aria-busy=\{pendingForRow\.length > 0\}/);
});

test("Workspaces rows use the app locale and preserve full paths accessibly", () => {
  assert.match(workspacesSource, /const \{ t, i18n \} = useTranslation\(\)/);
  assert.match(
    workspacesSource,
    /toLocaleDateString\(i18n\.resolvedLanguage \?\? i18n\.language\)/,
  );
  assert.match(workspacesSource, /title=\{repositoryPath\}/);
  assert.match(workspacesSource, /title=\{row\.worktreePath\}/);
  assert.match(workspacesSource, /className="workspace-status/);
  assert.match(styles, /\.workspace-path\s*\{[^}]*text-overflow:\s*ellipsis;/s);
});

test("Workspaces has its own semantic navigation icon", () => {
  assert.match(settingsSource, /workspaces: <IconBranch size=\{14\} \/>/);
  assert.match(settingsSource, /projects: <IconArchive size=\{14\} \/>/);
});
