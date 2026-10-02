/** Reported native edits are evidence, never host rollback snapshots. */
export type NativeReviewChange = {
  path: string;
  operation: "add" | "update" | "delete";
  oldPath?: string;
  diff: string;
  truncated: boolean;
};

export function nativeReviewChanges(value: unknown): NativeReviewChange[] {
  if (!Array.isArray(value)) return [];
  let remaining = 200 * 1024;
  return value.slice(0, 100).flatMap((candidate: unknown) => {
    if (!candidate || typeof candidate !== "object") return [];
    const change = candidate as Record<string, unknown>;
    const kind = change.kind && typeof change.kind === "object" ? change.kind as Record<string, unknown> : {};
    const operation = change.operation ?? kind.type;
    if (typeof change.path !== "string" || !change.path.trim() || change.path.length > 4096 ||
      !["add", "update", "delete"].includes(String(operation))) return [];
    const source = typeof change.diff === "string" ? change.diff : "";
    const encoded = new TextEncoder().encode(source.slice(0, remaining));
    const diff = encoded.length > remaining ? new TextDecoder("utf-8", { fatal: false }).decode(encoded.slice(0, remaining)).replace(/\uFFFD$/, "") : source.slice(0, remaining);
    remaining -= new TextEncoder().encode(diff).length;
    const destination = kind.move_path ?? kind.movePath;
    const renamed = typeof destination === "string" && destination.trim() && destination.length <= 4096;
    const move = renamed ? change.path : change.oldPath;
    return [{ path: renamed ? destination : change.path, operation: operation as NativeReviewChange["operation"], diff,
      truncated: change.truncated === true || diff.length < source.length,
      ...(typeof move === "string" && move.length <= 4096 ? { oldPath: move } : {}) }];
  });
}
