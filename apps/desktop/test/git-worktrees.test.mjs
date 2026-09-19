import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const desktopRoot = join(here, "..");
const repoRoot = join(desktopRoot, "../..");
const requireFromRuntime = createRequire(join(repoRoot, "packages/agent-runtime/package.json"));
const loadTypeScript = requireFromRuntime("jiti")(join(repoRoot, "packages/agent-runtime/jiti-runner.cjs"));
const {
  managedWorktreePath,
  listManagedWorktreeInventory,
  runGitWorktreeOperation,
  validateManagedBranch,
  validateManagedRecord,
  getGitBlocker,
  clearGitBlocker,
  inspectGitWorkspace,
  getGitWorkspaceMode,
  setGitWorkspaceMode,
} = loadTypeScript(join(desktopRoot, "electron/main/git-worktrees.ts"));

test("retains a valid recorded worktree when its repository is unavailable", async () => {
  const root = mkdtempSync(join(tmpdir(), "nexus-git-inventory-missing-"));
  const dataDir = join(root, "profile");
  const repositoryPath = join(root, "removed-project");
  const branch = "nexus/stale";
  const worktreePath = managedWorktreePath(repositoryPath, branch);
  const recordDir = join(dataDir, "agent-capabilities", "git-worktrees");
  const recordPath = join(
    recordDir,
    `${createHash("sha256").update(`${repositoryPath}\\0${branch}`).digest("hex")}.json`,
  );
  mkdirSync(recordDir, { recursive: true });
  writeFileSync(
    recordPath,
    JSON.stringify({
      repositoryPath,
      branch,
      worktreePath,
      createdAt: "2026-09-11T00:00:00.000Z",
    }),
  );
  try {
    const rows = await listManagedWorktreeInventory(dataDir);
    assert.deepEqual(rows, [{
      repositoryPath,
      branch,
      worktreePath,
      managed: true,
      exists: false,
      createdAt: "2026-09-11T00:00:00.000Z",
    }]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("persists direct-folder mode without changing the selected folder", () => {
  const root = mkdtempSync(join(tmpdir(), "nexus-git-mode-"));
  try {
    setGitWorkspaceMode(root, "session-direct", "direct-folder");
    assert.equal(getGitWorkspaceMode(root, "session-direct"), "direct-folder");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("reports a non-Git source copy as direct-folder ready without mutating it", async () => {
  const root = mkdtempSync(join(tmpdir(), "nexus-git-readiness-"));
  const sourceCopy = join(root, "source-copy");
  mkdirSync(sourceCopy);
  try {
    const readiness = await inspectGitWorkspace(join(root, "profile"), sourceCopy);
    assert.equal(readiness.ready, false);
    assert.equal(readiness.workspaceMode, "direct-folder");
    assert.equal(readiness.category, "NOT_A_GIT_REPOSITORY");
    assert.equal(readiness.recoveryAction, "work-directly");
    assert.equal(existsSync(join(sourceCopy, ".git")), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("clears a session blocker when its selected project changes", async () => {
  const root = mkdtempSync(join(tmpdir(), "nexus-git-workspace-change-"));
  const sourceCopy = join(root, "source-copy");
  const repository = join(root, "repository");
  mkdirSync(sourceCopy);
  mkdirSync(repository);
  try {
    git(repository, "init");
    git(repository, "config", "user.email", "nexus-test@example.invalid");
    git(repository, "config", "user.name", "Nexus test");
    writeFileSync(join(repository, "README.md"), "base\n");
    git(repository, "add", "README.md");
    git(repository, "commit", "-m", "base");
    let selected = sourceCopy;
    const deps = {
      dataDir: join(root, "profile"),
      resolveWorkspace: async () => selected,
      confirm: async () => false,
    };
    await assert.rejects(
      () => runGitWorktreeOperation(deps, "project-change", { operation: "status", branch: "nexus/one" }),
      /not a git repository/i,
    );
    assert.equal(getGitBlocker("project-change").category, "NOT_A_GIT_REPOSITORY");
    selected = repository;
    const status = await runGitWorktreeOperation(deps, "project-change", { operation: "status", branch: "nexus/one" });
    assert.match(status, /"repositoryPath"/);
    assert.equal(getGitBlocker("project-change"), undefined);
  } finally {
    clearGitBlocker("project-change");
    rmSync(root, { recursive: true, force: true });
  }
});

test("classifies missing workspaces and blocks branch-changing retries", async () => {
  clearGitBlocker("missing-session");
  const deps = { dataDir: join(tmpdir(), "profile"), resolveWorkspace: async () => null, confirm: async () => false };
  await assert.rejects(() => runGitWorktreeOperation(deps, "missing-session", { operation: "status", branch: "nexus/one" }), /no workspace is open/);
  const blocker = getGitBlocker("missing-session");
  assert.equal(blocker.category, "WORKSPACE_MISSING");
  await assert.rejects(() => runGitWorktreeOperation(deps, "missing-session", { operation: "status", branch: "nexus/two" }), /Open or select a project/);
  assert.equal(getGitBlocker("missing-session").attempts, 1);
  clearGitBlocker("missing-session");
});

test("preserves session lookup failures as a distinct blocker", async () => {
  clearGitBlocker("lookup-session");
  const deps = { dataDir: join(tmpdir(), "profile"), resolveWorkspace: async () => { throw new Error("IPC unavailable"); }, confirm: async () => false };
  await assert.rejects(() => runGitWorktreeOperation(deps, "lookup-session", { operation: "status", branch: "nexus/one" }), /IPC unavailable/);
  assert.equal(getGitBlocker("lookup-session").category, "SESSION_LOOKUP_FAILED");
  clearGitBlocker("lookup-session");
});

test("records dirty repository blockers and does not retry them", async () => {
  const root = mkdtempSync(join(tmpdir(), "nexus-git-dirty-"));
  const repository = join(root, "project");
  mkdirSync(repository);
  try {
    git(repository, "init");
    git(repository, "config", "user.email", "nexus-test@example.invalid");
    git(repository, "config", "user.name", "Nexus test");
    writeFileSync(join(repository, "README.md"), "base\n");
    git(repository, "add", "README.md");
    git(repository, "commit", "-m", "base");
    writeFileSync(join(repository, "README.md"), "dirty\n");
    clearGitBlocker("dirty-session");
    const deps = { dataDir: join(root, "profile"), resolveWorkspace: async () => repository, confirm: async () => false };
    await assert.rejects(() => runGitWorktreeOperation(deps, "dirty-session", { operation: "create", branch: "nexus/one" }), /uncommitted changes/);
    assert.equal(getGitBlocker("dirty-session").category, "DIRTY_REPOSITORY");
    await assert.rejects(() => runGitWorktreeOperation(deps, "dirty-session", { operation: "create", branch: "nexus/two" }), /clean repository/);
  } finally {
    clearGitBlocker("dirty-session");
    rmSync(root, { recursive: true, force: true });
  }
});

test("accepts only Nexus-owned branch names and computes a deterministic sibling path", () => {
  assert.equal(validateManagedBranch("nexus/phase-4").ok, true);
  assert.equal(validateManagedBranch("feature/phase-4").ok, false);
  assert.equal(validateManagedBranch("nexus/../../escape").ok, false);
  assert.equal(validateManagedBranch("nexus/has/slash").ok, false);
  assert.equal(
    managedWorktreePath("C:\\work\\Nexus", "nexus/phase-4"),
    "C:\\work\\.nexus-worktrees\\phase-4",
  );
});

test("rejects records whose repository, branch, or target path is not exact", () => {
  const expected = {
    repositoryPath: "C:\\work\\Nexus",
    branch: "nexus/phase-4",
    worktreePath: "C:\\work\\.nexus-worktrees\\phase-4",
    createdAt: "2026-09-11T00:00:00.000Z",
  };
  assert.equal(validateManagedRecord(expected, expected), true);
  assert.equal(validateManagedRecord({ ...expected, branch: "nexus/other" }, expected), false);
  assert.equal(validateManagedRecord({ ...expected, worktreePath: "C:\\other" }, expected), false);
});

test("keeps a Nexus-managed worktree in the repository's deterministic sibling directory", () => {
  const project = "C:\\projects\\PI-Desktop-Nexus";
  const path = managedWorktreePath(project, "nexus/git-lifecycle");
  assert.equal(path, "C:\\projects\\.nexus-worktrees\\git-lifecycle");
  assert.ok(!path.includes("PI-Desktop\\"));
});

function git(cwd, ...args) {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

test("creates, merges, and cleans only a confirmed Nexus-owned local worktree", async () => {
  const root = mkdtempSync(join(tmpdir(), "nexus-git-worktree-"));
  const repository = join(root, "project");
  const dataDir = join(root, "profile");
  mkdirSync(repository);
  try {
    git(repository, "init");
    git(repository, "config", "user.email", "nexus-test@example.invalid");
    git(repository, "config", "user.name", "Nexus test");
    git(repository, "config", "core.autocrlf", "false");
    writeFileSync(join(repository, "README.md"), "base\n");
    git(repository, "add", "README.md");
    git(repository, "commit", "-m", "base");

    const confirms = [];
    const deps = {
      dataDir,
      resolveWorkspace: async () => repository,
      confirm: async (title, detail) => { confirms.push({ title, detail }); return true; },
    };
    const branch = "nexus/lifecycle";
    const created = await runGitWorktreeOperation(deps, "session", { operation: "create", branch });
    const worktree = managedWorktreePath(repository, branch);
    assert.match(created, /created nexus\/lifecycle/);
    assert.equal(git(repository, "-C", worktree, "branch", "--show-current"), branch);

    writeFileSync(join(worktree, "feature.txt"), "Nexus only\n");
    git(worktree, "add", "feature.txt");
    git(worktree, "commit", "-m", "feature");
    const merged = await runGitWorktreeOperation(deps, "session", { operation: "merge", branch });
    assert.match(merged, /merged nexus\/lifecycle locally/);
    assert.equal(git(repository, "merge-base", "--is-ancestor", branch, "HEAD"), "");

    const cleaned = await runGitWorktreeOperation(deps, "session", { operation: "cleanup", branch });
    assert.match(cleaned, /deleted merged local branch nexus\/lifecycle/);
    assert.equal(confirms.length, 3);
    assert.equal(git(repository, "branch", "--list", "nexus/lifecycle"), "");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("leaves the repository untouched when a Git lifecycle confirmation is declined", async () => {
  const root = mkdtempSync(join(tmpdir(), "nexus-git-cancel-"));
  const repository = join(root, "project");
  mkdirSync(repository);
  try {
    git(repository, "init");
    git(repository, "config", "user.email", "nexus-test@example.invalid");
    git(repository, "config", "user.name", "Nexus test");
    writeFileSync(join(repository, "README.md"), "base\n");
    git(repository, "add", "README.md");
    git(repository, "commit", "-m", "base");
    const result = await runGitWorktreeOperation({
      dataDir: join(root, "profile"),
      resolveWorkspace: async () => repository,
      confirm: async () => false,
    }, "session", { operation: "create", branch: "nexus/cancelled" });
    assert.match(result, /creation cancelled/);
    assert.equal(git(repository, "branch", "--list", "nexus/cancelled"), "");
    assert.equal(git(repository, "status", "--porcelain"), "");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
