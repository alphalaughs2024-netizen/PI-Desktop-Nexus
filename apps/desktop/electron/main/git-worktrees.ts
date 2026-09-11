import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
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

export type GitWorktreeOperation = "status" | "create" | "merge" | "cleanup";

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

function comparablePath(path: string): string {
  return resolve(path).replaceAll("\\", "/").toLowerCase();
}

async function gitOrThrow(cwd: string, args: string[]): Promise<string> {
  const result = await runGit(cwd, args);
  if (result.code !== 0) throw new Error(result.stderr.trim() || `git ${args.join(" ")} failed`);
  return result.stdout.trim();
}

function recordsRoot(dataDir: string): string {
  return join(dataDir, "agent-capabilities", "git-worktrees");
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
  if (!workspacePath || !isAbsolute(workspacePath)) throw new Error("GitWorktree: no absolute workspace is open.");
  const root = await gitOrThrow(workspacePath, ["rev-parse", "--show-toplevel"]);
  if (!root || !isAbsolute(root)) throw new Error("GitWorktree: Git did not return an absolute repository root.");
  const repositoryPath = resolve(root);
  // The shipped Nexus fork may work on any user project, but it must never
  // manage the separately checked-out upstream PI-Desktop application.
  if (basename(repositoryPath).toLowerCase() === "pi-desktop") {
    throw new Error("GitWorktree: the upstream PI-Desktop checkout is protected; open the Nexus fork or another project instead.");
  }
  return repositoryPath;
}

async function ensureClean(cwd: string, label: string): Promise<void> {
  const status = await gitOrThrow(cwd, ["status", "--porcelain=v1", "--untracked-files=all"]);
  if (status) throw new Error(`GitWorktree: ${label} has uncommitted changes.`);
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

export async function runGitWorktreeOperation(
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
  const workspacePath = await deps.resolveWorkspace(sessionId);
  if (!workspacePath) throw new Error("GitWorktree: no workspace is open.");
  const canonicalBranch = `nexus/${valid.shortName}`;
  const repositoryPath = await repositoryRoot(workspacePath);
  const worktreePath = managedWorktreePath(repositoryPath, canonicalBranch);

  if (operation === "status") {
    return JSON.stringify(await inspectManagedWorktree(deps.dataDir, repositoryPath, canonicalBranch), null, 2);
  }

  if (operation === "create") {
    await ensureClean(repositoryPath, "the source repository");
    if (await branchExists(repositoryPath, canonicalBranch)) {
      throw new Error(`GitWorktree: branch ${canonicalBranch} already exists.`);
    }
    if (existsSync(worktreePath) || await worktreeIsRegistered(repositoryPath, worktreePath)) {
      throw new Error(`GitWorktree: target worktree already exists at ${worktreePath}.`);
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
