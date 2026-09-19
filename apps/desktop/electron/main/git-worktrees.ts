import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync, statSync } from "node:fs";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";

export type ManagedWorktreeRecord = {
  repositoryPath: string;
  branch: string;
  worktreePath: string;
  createdAt: string;
};

export type ManagedWorktreeStatus = {
  repositoryPath: string;
  branch: string;
  worktreePath: string;
  managed: boolean;
  exists: boolean;
  clean?: boolean;
  mergedIntoCurrent?: boolean;
};

export type ManagedWorktreeInventoryRow = ManagedWorktreeStatus & {
  createdAt: string;
};

export type GitWorktreeOperation = "status" | "create" | "merge" | "cleanup";
export type GitWorkspaceMode = "managed-isolation" | "direct-folder";
export type GitWorkspaceRecoveryAction = "create-isolation" | "work-directly" | "choose-project" | "inspect-git" | "retry";

export type GitFailureCategory =
  | "WORKSPACE_MISSING"
  | "SESSION_LOOKUP_FAILED"
  | "WORKSPACE_PATH_UNAVAILABLE"
  | "ACCESS_DENIED"
  | "NOT_A_GIT_REPOSITORY"
  | "GIT_EXECUTABLE_UNAVAILABLE"
  | "UPSTREAM_CHECKOUT_PROTECTED"
  | "DIRTY_REPOSITORY"
  | "BRANCH_CONFLICT"
  | "WORKTREE_CONFLICT"
  | "TRANSIENT_GIT_FAILURE";

export type GitBlocker = {
  sessionId: string;
  operation: GitWorktreeOperation;
  category: GitFailureCategory;
  workspaceIdentity: string;
  attempts: number;
  timestamp: string;
  recovery: string;
};

/** Read-only host-owned readiness state. This is intentionally broader than
 * one managed branch's lifecycle status and never changes Git state. */
export type GitWorkspaceStatus = {
  workspacePath?: string;
  workspaceIdentity: string;
  workspaceExists: boolean;
  accessible: boolean;
  gitAvailable: boolean;
  ready: boolean;
  workspaceMode: GitWorkspaceMode;
  category?: GitFailureCategory;
  explanation: string;
  recovery: string;
  recoveryAction: GitWorkspaceRecoveryAction;
  repositoryPath?: string;
  branch?: string;
  clean?: boolean;
  managedWorktrees: ManagedWorktreeRecord[];
};

export class GitWorkflowError extends Error {
  readonly category: GitFailureCategory;
  readonly recovery: string;
  constructor(category: GitFailureCategory, message: string, recovery: string) {
    super(message);
    this.name = "GitWorkflowError";
    this.category = category;
    this.recovery = recovery;
  }
}

const blockers = new Map<string, GitBlocker>();

export function getGitBlocker(sessionId: string): GitBlocker | undefined {
  return blockers.get(sessionId);
}

export function clearGitBlocker(sessionId: string): void {
  blockers.delete(sessionId);
}

function recoveryFor(category: GitFailureCategory): string {
  switch (category) {
    case "WORKSPACE_MISSING": return "Open or select a project before using Git.";
    case "SESSION_LOOKUP_FAILED": return "Nexus could not read this session. Refresh or select the project again.";
    case "WORKSPACE_PATH_UNAVAILABLE": return "The selected project is unavailable. Choose another project.";
    case "ACCESS_DENIED": return "Git access was denied. Grant access or choose another project.";
    case "NOT_A_GIT_REPOSITORY": return "This project is not a Git repository.";
    case "GIT_EXECUTABLE_UNAVAILABLE": return "Git is unavailable on this system. Install Git and try again.";
    case "UPSTREAM_CHECKOUT_PROTECTED": return "Open the Nexus fork instead of the upstream PI-Desktop checkout.";
    case "DIRTY_REPOSITORY": return "This operation requires a clean repository. Resolve the pending changes first.";
    case "BRANCH_CONFLICT": return "That local branch already exists. Choose another branch or inspect it.";
    case "WORKTREE_CONFLICT": return "That worktree already exists or is registered. Inspect it before retrying.";
    case "TRANSIENT_GIT_FAILURE": return "Git failed temporarily. Retry once; if it persists, inspect the repository.";
  }
}

function classifyGitError(error: unknown, fallback: GitFailureCategory = "TRANSIENT_GIT_FAILURE"): GitFailureCategory {
  if (error instanceof GitWorkflowError) return error.category;
  const message = error instanceof Error ? error.message : String(error);
  if (/ENOENT|no such file|not found/i.test(message) && /git/i.test(message)) return "GIT_EXECUTABLE_UNAVAILABLE";
  if (/EACCES|permission denied|access is denied|safe\.directory|dubious ownership/i.test(message)) return "ACCESS_DENIED";
  if (/not a git repository|cannot find git repository/i.test(message)) return "NOT_A_GIT_REPOSITORY";
  return fallback;
}

function workflowError(category: GitFailureCategory, message: string): GitWorkflowError {
  return new GitWorkflowError(category, message, recoveryFor(category));
}

type GitResult = { code: number; stdout: string; stderr: string };

export function validateManagedBranch(branch: string): { ok: true; shortName: string } | { ok: false; error: string } {
  const normalized = branch.trim();
  const match = /^nexus\/([a-z0-9][a-z0-9-]{0,62})$/i.exec(normalized);
  if (!match) {
    return { ok: false, error: "branch must be nexus/<lowercase-or-digits-hyphen-name>" };
  }
  return { ok: true, shortName: match[1].toLowerCase() };
}

/** Nexus worktrees are deterministic siblings, never user-chosen paths. */
export function managedWorktreePath(repositoryPath: string, branch: string): string {
  const validation = validateManagedBranch(branch);
  if (!validation.ok) throw new Error(validation.error);
  return resolve(dirname(repositoryPath), ".nexus-worktrees", validation.shortName);
}

export function validateManagedRecord(
  value: Partial<ManagedWorktreeRecord> | undefined,
  expected: Pick<ManagedWorktreeRecord, "repositoryPath" | "branch" | "worktreePath">,
): value is ManagedWorktreeRecord {
  return Boolean(
    value &&
      value.repositoryPath === expected.repositoryPath &&
      value.branch === expected.branch &&
      value.worktreePath === expected.worktreePath &&
      typeof value.createdAt === "string",
  );
}

function runGit(cwd: string, args: string[]): Promise<GitResult> {
  return new Promise((resolveResult) => {
    const child = spawn("git", args, { cwd, env: process.env, windowsHide: true });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += String(chunk); });
    child.stderr.on("data", (chunk) => { stderr += String(chunk); });
    child.on("error", (error) => resolveResult({ code: 1, stdout: "", stderr: String(error) }));
    child.on("close", (code) => resolveResult({ code: code ?? 1, stdout, stderr }));
  });
}

export function comparablePath(path: string): string {
  return resolve(path).replaceAll("\\", "/").toLowerCase();
}

export function listManagedWorktreeRecords(dataDir: string, repositoryPath?: string): ManagedWorktreeRecord[] {
  try {
    const root = recordsRoot(dataDir);
    if (!existsSync(root)) return [];
    return readdirSync(root, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
      .flatMap((entry) => {
        try {
          const record = JSON.parse(readFileSync(join(root, entry.name), "utf8")) as ManagedWorktreeRecord;
          return !repositoryPath || comparablePath(record.repositoryPath) === comparablePath(repositoryPath) ? [record] : [];
        } catch { return []; }
      });
  } catch { return []; }
}

/** Inventory is profile-recorded only: arbitrary user worktrees are never
 * discovered, displayed, or eligible for Nexus cleanup. */
export async function listManagedWorktreeInventory(dataDir: string): Promise<ManagedWorktreeInventoryRow[]> {
  const records = listManagedWorktreeRecords(dataDir);
  const rows = await Promise.all(records.map(async (record) => {
    const validation = validateManagedBranch(record.branch);
    if (!validation.ok || !isAbsolute(record.repositoryPath) || !isAbsolute(record.worktreePath)) {
      return undefined;
    }
    const repositoryPath = resolve(record.repositoryPath);
    const branch = `nexus/${validation.shortName}`;
    const worktreePath = managedWorktreePath(repositoryPath, branch);
    if (!validateManagedRecord(record, { repositoryPath, branch, worktreePath })) {
      return undefined;
    }
    try {
      const status = await inspectManagedWorktree(dataDir, repositoryPath, branch);
      if (!status.managed || status.worktreePath !== worktreePath) return undefined;
      return { ...status, createdAt: record.createdAt };
    } catch {
      // Keep a valid profile record visible when the source repository itself
      // has been moved or removed. This is still profile-recorded only: no
      // Git worktree discovery occurs, and the row has no cleanup eligibility.
      try {
        if (!existsSync(repositoryPath) || !statSync(repositoryPath).isDirectory()) {
          return {
            repositoryPath,
            branch,
            worktreePath,
            managed: true,
            exists: false,
            createdAt: record.createdAt,
          } satisfies ManagedWorktreeInventoryRow;
        }
      } catch {
        return {
          repositoryPath,
          branch,
          worktreePath,
          managed: true,
          exists: false,
          createdAt: record.createdAt,
        } satisfies ManagedWorktreeInventoryRow;
      }
      return undefined;
    }
  }));
  return rows.filter((row): row is ManagedWorktreeInventoryRow => Boolean(row));
}

export function recordedManagedWorktree(
  dataDir: string,
  repositoryPath: string,
  branch: string,
  worktreePath: string,
): ManagedWorktreeRecord | undefined {
  const record = readRecord(dataDir, resolve(repositoryPath), branch);
  return validateManagedRecord(record, {
    repositoryPath: resolve(repositoryPath),
    branch,
    worktreePath: resolve(worktreePath),
  }) ? record : undefined;
}

function readinessFailure(workspacePath: string | null | undefined, category: GitFailureCategory, explanation: string): GitWorkspaceStatus {
  const action: GitWorkspaceRecoveryAction = category === "NOT_A_GIT_REPOSITORY"
    ? "work-directly"
    : category === "WORKSPACE_MISSING" || category === "WORKSPACE_PATH_UNAVAILABLE" || category === "ACCESS_DENIED"
      ? "choose-project"
      : category === "TRANSIENT_GIT_FAILURE" ? "retry" : "inspect-git";
  return {
    ...(workspacePath ? { workspacePath } : {}),
    workspaceIdentity: workspacePath ? comparablePath(workspacePath) : "none",
    workspaceExists: Boolean(workspacePath && existsSync(workspacePath)),
    accessible: category !== "ACCESS_DENIED",
    gitAvailable: category !== "GIT_EXECUTABLE_UNAVAILABLE",
    ready: false,
    workspaceMode: "direct-folder",
    category,
    explanation,
    recovery: recoveryFor(category),
    recoveryAction: action,
    managedWorktrees: [],
  };
}

/** Inspect workspace readiness without initializing Git, choosing a branch, or
 * creating a worktree. Safe for source copies and experimental folders. */
export async function inspectGitWorkspace(dataDir: string, workspacePath: string | null | undefined): Promise<GitWorkspaceStatus> {
  if (!workspacePath?.trim()) return readinessFailure(null, "WORKSPACE_MISSING", "No project is selected.");
  const selected = workspacePath.trim();
  try {
    const repositoryPath = await repositoryRoot(selected);
    const [branch, porcelain] = await Promise.all([
      gitOrThrow(repositoryPath, ["branch", "--show-current"]),
      gitOrThrow(repositoryPath, ["status", "--porcelain=v1", "--untracked-files=all"]),
    ]);
    return {
      workspacePath: selected,
      workspaceIdentity: comparablePath(selected),
      workspaceExists: true,
      accessible: true,
      gitAvailable: true,
      ready: true,
      workspaceMode: "managed-isolation",
      explanation: "This project is ready for Nexus-managed Git isolation.",
      recovery: "Create an isolated workspace when this task needs one.",
      recoveryAction: "create-isolation",
      repositoryPath,
      ...(branch ? { branch } : {}),
      clean: porcelain === "",
      managedWorktrees: listManagedWorktreeRecords(dataDir, repositoryPath),
    };
  } catch (error) {
    const category = classifyGitError(error, error instanceof GitWorkflowError ? error.category : "TRANSIENT_GIT_FAILURE");
    return readinessFailure(selected, category, error instanceof Error ? error.message : String(error));
  }
}

async function gitOrThrow(cwd: string, args: string[]): Promise<string> {
  const result = await runGit(cwd, args);
  if (result.code !== 0) {
    const detail = result.stderr.trim() || `git ${args.join(" ")} failed`;
    throw workflowError(classifyGitError(new Error(detail)), detail);
  }
  return result.stdout.trim();
}

function recordsRoot(dataDir: string): string {
  return join(dataDir, "agent-capabilities", "git-worktrees");
}

function workspaceModePath(dataDir: string, sessionId: string): string {
  const digest = createHash("sha256").update(sessionId).digest("hex");
  return join(dataDir, "agent-capabilities", "git-workspace-modes", `${digest}.json`);
}

export function getGitWorkspaceMode(dataDir: string, sessionId: string): GitWorkspaceMode | undefined {
  try {
    const value = JSON.parse(readFileSync(workspaceModePath(dataDir, sessionId), "utf8")) as { mode?: unknown };
    return value.mode === "managed-isolation" || value.mode === "direct-folder" ? value.mode : undefined;
  } catch { return undefined; }
}

export function setGitWorkspaceMode(dataDir: string, sessionId: string, mode: GitWorkspaceMode): void {
  const path = workspaceModePath(dataDir, sessionId);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify({ mode }, null, 2), "utf8");
}

export function clearGitWorkspaceMode(dataDir: string, sessionId: string): void {
  const path = workspaceModePath(dataDir, sessionId);
  if (existsSync(path)) unlinkSync(path);
}

function recordPath(dataDir: string, repositoryPath: string, branch: string): string {
  const digest = createHash("sha256").update(`${repositoryPath}\0${branch}`).digest("hex");
  return join(recordsRoot(dataDir), `${digest}.json`);
}

function readRecord(dataDir: string, repositoryPath: string, branch: string): ManagedWorktreeRecord | undefined {
  try {
    return JSON.parse(readFileSync(recordPath(dataDir, repositoryPath, branch), "utf8")) as ManagedWorktreeRecord;
  } catch {
    return undefined;
  }
}

function writeRecord(dataDir: string, record: ManagedWorktreeRecord): void {
  const path = recordPath(dataDir, record.repositoryPath, record.branch);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(record, null, 2), "utf8");
}

function removeRecord(dataDir: string, repositoryPath: string, branch: string): void {
  const path = recordPath(dataDir, repositoryPath, branch);
  if (existsSync(path)) unlinkSync(path);
}

async function repositoryRoot(workspacePath: string): Promise<string> {
  if (!workspacePath) throw workflowError("WORKSPACE_MISSING", "no workspace is open");
  if (!isAbsolute(workspacePath)) throw workflowError("WORKSPACE_PATH_UNAVAILABLE", "workspace path is not absolute");
  try {
    if (!existsSync(workspacePath) || !statSync(workspacePath).isDirectory()) {
      throw workflowError("WORKSPACE_PATH_UNAVAILABLE", "the selected workspace path is unavailable");
    }
  } catch (error) {
    if (error instanceof GitWorkflowError) throw error;
    throw workflowError("ACCESS_DENIED", "the selected workspace cannot be read");
  }
  const root = await gitOrThrow(workspacePath, ["rev-parse", "--show-toplevel"]);
  if (!root || !isAbsolute(root)) throw new Error("GitWorktree: Git did not return an absolute repository root.");
  const repositoryPath = resolve(root);
  // The shipped Nexus fork may work on any user project, but it must never
  // manage the separately checked-out upstream PI-Desktop application.
  if (basename(repositoryPath).toLowerCase() === "pi-desktop") {
    throw workflowError("UPSTREAM_CHECKOUT_PROTECTED", "the upstream PI-Desktop checkout is protected");
  }
  return repositoryPath;
}

async function ensureClean(cwd: string, label: string): Promise<void> {
  const status = await gitOrThrow(cwd, ["status", "--porcelain=v1", "--untracked-files=all"]);
  if (status) throw workflowError("DIRTY_REPOSITORY", `${label} has uncommitted changes`);
}

async function branchExists(cwd: string, branch: string): Promise<boolean> {
  const result = await runGit(cwd, ["show-ref", "--verify", "--quiet", `refs/heads/${branch}`]);
  return result.code === 0;
}

async function branchMergedIntoCurrent(cwd: string, branch: string): Promise<boolean> {
  const result = await runGit(cwd, ["merge-base", "--is-ancestor", branch, "HEAD"]);
  return result.code === 0;
}

async function worktreeIsRegistered(cwd: string, path: string): Promise<boolean> {
  const raw = await gitOrThrow(cwd, ["worktree", "list", "--porcelain"]);
  const expected = comparablePath(path);
  return raw
    .split(/\r?\n/)
    .filter((line) => line.startsWith("worktree "))
    .some((line) => comparablePath(line.slice("worktree ".length)) === expected);
}

export async function inspectManagedWorktree(
  dataDir: string,
  workspacePath: string,
  branch: string,
): Promise<ManagedWorktreeStatus> {
  const valid = validateManagedBranch(branch);
  if (!valid.ok) throw new Error(`GitWorktree: ${valid.error}.`);
  const repositoryPath = await repositoryRoot(workspacePath);
  const canonicalBranch = `nexus/${valid.shortName}`;
  const worktreePath = managedWorktreePath(repositoryPath, canonicalBranch);
  const record = readRecord(dataDir, repositoryPath, canonicalBranch);
  const exists = await worktreeIsRegistered(repositoryPath, worktreePath);
  const status: ManagedWorktreeStatus = {
    repositoryPath,
    branch: canonicalBranch,
    worktreePath,
    managed: validateManagedRecord(record, { repositoryPath, branch: canonicalBranch, worktreePath }),
    exists,
  };
  if (exists) {
    status.clean = (await gitOrThrow(worktreePath, ["status", "--porcelain=v1", "--untracked-files=all"])) === "";
  }
  if (await branchExists(repositoryPath, canonicalBranch)) {
    status.mergedIntoCurrent = await branchMergedIntoCurrent(repositoryPath, canonicalBranch);
  }
  return status;
}

export type GitWorktreeManagerDeps = {
  dataDir: string;
  resolveWorkspace: (sessionId: string) => Promise<string | null>;
  confirm: (title: string, detail: string) => Promise<boolean>;
};

function requireManaged(status: ManagedWorktreeStatus): void {
  if (!status.managed || !status.exists) {
    throw new Error("GitWorktree: no Nexus-managed worktree exists for that branch.");
  }
}

async function runGitWorktreeOperationInternal(
  deps: GitWorktreeManagerDeps,
  sessionId: string,
  input: { operation?: unknown; branch?: unknown },
): Promise<string> {
  const operation = String(input.operation ?? "status") as GitWorktreeOperation;
  if (!(["status", "create", "merge", "cleanup"] as const).includes(operation)) {
    throw new Error("GitWorktree: operation must be status, create, merge, or cleanup.");
  }
  const rawBranch = typeof input.branch === "string" ? input.branch.trim() : "";
  const valid = validateManagedBranch(rawBranch);
  if (!valid.ok) throw new Error(`GitWorktree: ${valid.error}.`);
  let existingBlocker = blockers.get(sessionId);
  let workspacePath: string | null;
  try {
    workspacePath = await deps.resolveWorkspace(sessionId);
  } catch (error) {
    const blocker = { sessionId, operation, category: "SESSION_LOOKUP_FAILED" as const, workspaceIdentity: "session", attempts: (existingBlocker?.attempts ?? 0) + 1, timestamp: new Date().toISOString(), recovery: recoveryFor("SESSION_LOOKUP_FAILED") };
    blockers.set(sessionId, blocker);
    throw workflowError(blocker.category, error instanceof Error ? error.message : "session lookup failed");
  }
  if (!workspacePath) {
    if (existingBlocker && existingBlocker.category !== "TRANSIENT_GIT_FAILURE") {
      throw workflowError(existingBlocker.category, existingBlocker.recovery);
    }
    const blocker = { sessionId, operation, category: "WORKSPACE_MISSING" as const, workspaceIdentity: "none", attempts: (existingBlocker?.attempts ?? 0) + 1, timestamp: new Date().toISOString(), recovery: recoveryFor("WORKSPACE_MISSING") };
    blockers.set(sessionId, blocker);
    throw workflowError(blocker.category, "no workspace is open");
  }
  // A task can be rebound to another project after a blocker. The blocker is
  // meaningful only for the workspace that produced it; never strand a valid
  // replacement repository behind a stale session-wide failure.
  if (existingBlocker && existingBlocker.workspaceIdentity !== comparablePath(workspacePath)) {
    clearGitBlocker(sessionId);
    existingBlocker = undefined;
  }
  if (existingBlocker && existingBlocker.category !== "TRANSIENT_GIT_FAILURE") {
    throw workflowError(existingBlocker.category, existingBlocker.recovery);
  }
  if (existingBlocker?.category === "TRANSIENT_GIT_FAILURE" && existingBlocker.attempts >= 2) {
    throw workflowError(existingBlocker.category, existingBlocker.recovery);
  }
  const canonicalBranch = `nexus/${valid.shortName}`;
  let repositoryPath: string;
  try {
    repositoryPath = await repositoryRoot(workspacePath);
  } catch (error) {
    const category = classifyGitError(error, error instanceof GitWorkflowError ? error.category : "TRANSIENT_GIT_FAILURE");
    const blocker = { sessionId, operation, category, workspaceIdentity: comparablePath(workspacePath), attempts: (existingBlocker?.attempts ?? 0) + 1, timestamp: new Date().toISOString(), recovery: recoveryFor(category) };
    blockers.set(sessionId, blocker);
    throw error;
  }
  clearGitBlocker(sessionId);
  const worktreePath = managedWorktreePath(repositoryPath, canonicalBranch);

  if (operation === "status") {
    return JSON.stringify(await inspectManagedWorktree(deps.dataDir, repositoryPath, canonicalBranch), null, 2);
  }

  if (operation === "create") {
    try {
      await ensureClean(repositoryPath, "the source repository");
    } catch (error) {
      const category = classifyGitError(error, "TRANSIENT_GIT_FAILURE");
      blockers.set(sessionId, { sessionId, operation, category, workspaceIdentity: comparablePath(workspacePath), attempts: 1, timestamp: new Date().toISOString(), recovery: recoveryFor(category) });
      throw error;
    }
    if (await branchExists(repositoryPath, canonicalBranch)) {
      throw workflowError("BRANCH_CONFLICT", `branch ${canonicalBranch} already exists`);
    }
    if (existsSync(worktreePath) || await worktreeIsRegistered(repositoryPath, worktreePath)) {
      throw workflowError("WORKTREE_CONFLICT", `target worktree already exists at ${worktreePath}`);
    }
    const confirmed = await deps.confirm(
      "Create Nexus worktree?",
      `Create ${canonicalBranch} from the current local HEAD at:\n${worktreePath}\n\nThis is local only. Nexus will not push or modify another checkout.`,
    );
    if (!confirmed) return "GitWorktree: creation cancelled.";
    // Confirmation is a user-time boundary: re-check the source state so an
    // external Git action cannot make the originally reviewed target stale.
    await ensureClean(repositoryPath, "the source repository");
    if (await branchExists(repositoryPath, canonicalBranch) || existsSync(worktreePath) || await worktreeIsRegistered(repositoryPath, worktreePath)) {
      throw new Error("GitWorktree: branch or target changed while confirmation was open; creation is refused.");
    }
    mkdirSync(dirname(worktreePath), { recursive: true });
    await gitOrThrow(repositoryPath, ["worktree", "add", worktreePath, "-b", canonicalBranch, "HEAD"]);
    writeRecord(deps.dataDir, { repositoryPath, branch: canonicalBranch, worktreePath, createdAt: new Date().toISOString() });
    return `GitWorktree: created ${canonicalBranch} at ${worktreePath}. No remote was pushed.`;
  }

  const status = await inspectManagedWorktree(deps.dataDir, repositoryPath, canonicalBranch);
  requireManaged(status);
  await ensureClean(worktreePath, "the Nexus worktree");

  if (operation === "merge") {
    await ensureClean(repositoryPath, "the source repository");
    if (status.mergedIntoCurrent) return `GitWorktree: ${canonicalBranch} is already merged into the current branch.`;
    const confirmed = await deps.confirm(
      "Merge Nexus worktree branch?",
      `Merge ${canonicalBranch} into the current local branch in:\n${repositoryPath}\n\nThis is local only. Nexus will not push.`,
    );
    if (!confirmed) return "GitWorktree: merge cancelled.";
    const confirmedStatus = await inspectManagedWorktree(deps.dataDir, repositoryPath, canonicalBranch);
    requireManaged(confirmedStatus);
    await ensureClean(repositoryPath, "the source repository");
    await ensureClean(worktreePath, "the Nexus worktree");
    if (confirmedStatus.mergedIntoCurrent) {
      return `GitWorktree: ${canonicalBranch} is already merged into the current branch.`;
    }
    await gitOrThrow(repositoryPath, ["merge", "--no-ff", canonicalBranch, "-m", `merge: integrate ${canonicalBranch}`]);
    if (!(await branchMergedIntoCurrent(repositoryPath, canonicalBranch))) {
      throw new Error("GitWorktree: merge verification failed; the branch is not an ancestor of current HEAD.");
    }
    return `GitWorktree: merged ${canonicalBranch} locally and verified it is contained in current HEAD. No remote was pushed.`;
  }

  if (!status.mergedIntoCurrent) {
    throw new Error(`GitWorktree: ${canonicalBranch} is not merged into the current branch; cleanup is refused.`);
  }
  const confirmed = await deps.confirm(
    "Remove merged Nexus worktree?",
    `Remove the clean, merged worktree:\n${worktreePath}\n\nand delete local branch ${canonicalBranch}. This cannot be undone. No remote will be changed.`,
  );
  if (!confirmed) return "GitWorktree: cleanup cancelled.";
  const confirmedStatus = await inspectManagedWorktree(deps.dataDir, repositoryPath, canonicalBranch);
  requireManaged(confirmedStatus);
  await ensureClean(worktreePath, "the Nexus worktree");
  if (!confirmedStatus.mergedIntoCurrent) {
    throw new Error(`GitWorktree: ${canonicalBranch} changed after confirmation and is no longer merged; cleanup is refused.`);
  }
  await gitOrThrow(repositoryPath, ["worktree", "remove", worktreePath]);
  await gitOrThrow(repositoryPath, ["branch", "-d", canonicalBranch]);
  removeRecord(deps.dataDir, repositoryPath, canonicalBranch);
  return `GitWorktree: removed ${worktreePath} and deleted merged local branch ${canonicalBranch}. No remote was pushed.`;
}

/** Execute a Git operation while recording semantic blockers for every failure domain. */
export async function runGitWorktreeOperation(
  deps: GitWorktreeManagerDeps,
  sessionId: string,
  input: { operation?: unknown; branch?: unknown },
): Promise<string> {
  try {
    return await runGitWorktreeOperationInternal(deps, sessionId, input);
  } catch (error) {
    const existing = blockers.get(sessionId);
    const category = classifyGitError(error);
    // Preflight failures are already recorded with the safe workspace identity.
    // Do not increment their attempt count merely because the error crossed this wrapper.
    if (!existing || existing.category !== category) {
      const rawWorkspace = existing?.workspaceIdentity ?? "unknown";
      blockers.set(sessionId, {
        sessionId,
        operation: String(input.operation ?? "status") as GitWorktreeOperation,
        category,
        workspaceIdentity: rawWorkspace,
        attempts: existing?.category === category ? existing.attempts : 1,
        timestamp: new Date().toISOString(),
        recovery: recoveryFor(category),
      });
    }
    throw error;
  }
}
