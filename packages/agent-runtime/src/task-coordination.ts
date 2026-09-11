/**
 * Coordinator-owned task scope, deliberately smaller than a filesystem ACL.
 *
 * It tells the parent whether two delegates may be allowed to mutate in the
 * same checkout. Host permissions remain the authority for every actual tool
 * call. Unknown or invalid write scope is deliberately whole-workspace scope.
 */
export type DelegationOwnership = {
  access: "read" | "write";
  paths: string[];
};

function normalizePath(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const path = value.trim().replaceAll("\\", "/").replace(/^\.\//, "").replace(/\/+$/, "");
  return path && !path.includes("..") ? path : undefined;
}

function normalizePaths(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(normalizePath).filter((path): path is string => Boolean(path)))];
}

/** A write-capable delegate cannot downgrade itself to read-only via metadata. */
export function normalizeDelegationOwnership(
  value: unknown,
  mutating: boolean,
): DelegationOwnership {
  const input = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const requestedAccess = input.access === "read" ? "read" : "write";
  const access = mutating ? "write" : requestedAccess;
  const paths = normalizePaths(input.paths);
  return { access, paths: paths.length > 0 ? paths : ["*"] };
}

function prefix(path: string): string {
  return path.replace(/\*\*?$/, "").replace(/\/$/, "");
}

function pathsIntersect(left: string, right: string): boolean {
  if (left === "*" || right === "*") return true;
  const normalizedLeft = left.toLowerCase();
  const normalizedRight = right.toLowerCase();
  const leftPrefix = prefix(normalizedLeft);
  const rightPrefix = prefix(normalizedRight);
  return normalizedLeft === normalizedRight ||
    normalizedLeft.startsWith(`${rightPrefix}/`) ||
    normalizedRight.startsWith(`${leftPrefix}/`) ||
    leftPrefix === rightPrefix;
}

/** Read-only delegates may overlap; two write scopes must be disjoint. */
export function overlappingOwnership(
  left: DelegationOwnership,
  right: DelegationOwnership,
): boolean {
  return left.access === "write" && right.access === "write" &&
    left.paths.some((leftPath) => right.paths.some((rightPath) => pathsIntersect(leftPath, rightPath)));
}

/**
 * Every Task in a session shares its one host-owned workspace root. Path
 * labels aid reporting, but they are not worktree isolation, so two mutating
 * delegates never run together in that root.
 */
export function concurrentMutationConflict(
  left: DelegationOwnership,
  right: DelegationOwnership,
): boolean {
  return left.access === "write" && right.access === "write";
}
