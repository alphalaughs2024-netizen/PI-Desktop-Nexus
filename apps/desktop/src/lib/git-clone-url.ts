function isPublicHostname(host: string): boolean {
  const lower = host.toLowerCase();
  return !!lower && lower !== "localhost" && !lower.endsWith(".localhost") &&
    !/^127(?:\.\d{1,3}){3}$/.test(lower) && !/^10(?:\.\d{1,3}){3}$/.test(lower) &&
    !/^192\.168(?:\.\d{1,3}){2}$/.test(lower) && !/^172\.(?:1[6-9]|2\d|3[01])(?:\.\d{1,3}){2}$/.test(lower) &&
    !lower.startsWith("[fe80:");
}
export type GitCloneTarget = { url: string; name: string };
const REPO_NAME = /^[A-Za-z0-9._][A-Za-z0-9._-]*$/;
const SCP_GIT = /^git@([A-Za-z0-9.-]+):(.+)$/;
function repoName(path: string): string | null {
  const name = (path.replace(/[\\/]+$/, "").split(/[\\/]/).filter(Boolean).pop() ?? "").replace(/\.git$/i, "");
  return name && REPO_NAME.test(name) && name !== "." && name !== ".." ? name : null;
}
export function parseGitCloneUrl(raw: string | null | undefined): GitCloneTarget | null {
  const value = raw?.trim() ?? "";
  if (!value || value.length > 2048 || /\s/.test(value)) return null;
  const scp = value.match(SCP_GIT);
  if (scp) return isPublicHostname(scp[1]) && repoName(scp[2]) ? { url: value, name: repoName(scp[2])! } : null;
  let parsed: URL;
  try { parsed = new URL(value); } catch { return null; }
  if (!["https:", "http:", "ssh:", "git:"].includes(parsed.protocol) || parsed.password || !isPublicHostname(parsed.hostname)) return null;
  const name = repoName(parsed.pathname);
  return name ? { url: value, name } : null;
}
export function isGitCloneRepoName(name: string): boolean { return REPO_NAME.test(name); }
