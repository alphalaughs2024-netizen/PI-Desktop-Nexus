import { spawn } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
import { isGitCloneRepoName, parseGitCloneUrl } from "../../src/lib/git-clone-url";
export const GIT_CLONE_TIMEOUT_MS = 10 * 60 * 1000;
export function runGitClone(cwd: string, args: string[], timeoutMs = GIT_CLONE_TIMEOUT_MS): Promise<{code:number; stderr:string; errorCode?:string}> {
  return new Promise((done) => { const child = spawn("git", args, { cwd, env: process.env, windowsHide: true }); let stderr = ""; let settled = false; const finish = (r: {code:number;stderr:string;errorCode?:string}) => { if (settled) return; settled = true; clearTimeout(timer); done(r); }; const timer = setTimeout(() => { child.kill("SIGTERM"); finish({ code: 1, stderr: "git clone timed out", errorCode: "TIMEOUT" }); }, timeoutMs); child.stderr?.on("data", (c) => { stderr = `${stderr}${String(c)}`.slice(-8000); }); child.on("error", (e: NodeJS.ErrnoException) => finish({ code: 1, stderr: e.message, errorCode: e.code === "ENOENT" ? "NOT_FOUND" : "INTERNAL" })); child.on("close", (code) => finish({ code: code ?? 1, stderr })); });
}
export async function cloneGitRepository(input: { url: string; parentPath: string; name?: string; run?: typeof runGitClone }): Promise<string> {
  const target = parseGitCloneUrl(input.url); if (!target) throw Object.assign(new Error("Enter a public git repository URL"), { errorCode: "INVALID_ARGUMENT" });
  const name = input.name ?? target.name; const parent = resolve(input.parentPath); if (!isGitCloneRepoName(name)) throw Object.assign(new Error("Invalid repository name"), { errorCode: "INVALID_ARGUMENT" });
  if (!existsSync(parent) || !statSync(parent).isDirectory()) throw Object.assign(new Error("Choose a folder to clone into"), { errorCode: "NOT_FOUND" });
  const dest = resolve(parent, name); const rel = relative(parent, dest); if (!rel || rel.startsWith("..") || isAbsolute(rel) || existsSync(dest)) throw Object.assign(new Error("Clone destination is invalid or already exists"), { errorCode: existsSync(dest) ? "CONFLICT" : "INVALID_ARGUMENT" });
  const result = await (input.run ?? runGitClone)(parent, ["clone", "--", target.url, dest]); if (result.errorCode === "NOT_FOUND") throw Object.assign(new Error("Git is not installed"), { errorCode: "NOT_FOUND" }); if (result.errorCode === "TIMEOUT") throw Object.assign(new Error("git clone timed out"), { errorCode: "TIMEOUT" }); if (result.code !== 0) throw Object.assign(new Error((result.stderr.trim().split("\n").at(-1) || "git clone failed").slice(0, 280)), { errorCode: "TOOL_FAILED" }); return dest;
}
