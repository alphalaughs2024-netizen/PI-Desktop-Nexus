import { mkdir, readFile, rename, writeFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { ErrorCodes } from "@pi-desktop/shared";
import type { EngineSnapshot } from "@pi-desktop/shared";
type StoreIO = Pick<typeof import("node:fs/promises"), "mkdir" | "writeFile" | "rename" | "unlink">;

/** Bounded diagnostics; filesystem paths and raw error messages stay private. */
export function recoveryWriteError(error: unknown): { code: string; message: string; details: { filesystemCode: string } } {
  const raw = (error as { code?: unknown } | undefined)?.code;
  const filesystemCode = typeof raw === "string" && /^[A-Z0-9_]{1,32}$/.test(raw) ? raw : "UNKNOWN";
  const full = ["ENOSPC", "EDQUOT"].includes(filesystemCode);
  return {
    code: full ? ErrorCodes.CODEX_RECOVERY_STORAGE_FULL : ErrorCodes.CODEX_RECOVERY_WRITE_FAILED,
    message: full
      ? "Storage is full. Engine recovery metadata could not be saved. Output is visible in this window, but saving it and recovery after reload are not confirmed. Free disk space before retrying."
      : "Engine recovery metadata could not be saved. Output is visible in this window, but saving it and recovery after reload are not confirmed.",
    details: { filesystemCode },
  };
}

/** Private engine recovery metadata; never contains launch credentials. */
export class CodexSessionStore {
  readonly directory: string;
  private queue = Promise.resolve();
  constructor(root: string, sessionId: string, private io: StoreIO = { mkdir, writeFile, rename, unlink }) {
    this.directory = join(root, "codex-sessions", createHash("sha256").update(sessionId).digest("hex"));
  }
  async read(): Promise<EngineSnapshot | undefined> {
    try {
      const value = JSON.parse(await readFile(join(this.directory, "snapshot.json"), "utf8"));
      if (value.schema !== 1 || value.session?.engine !== "codex" || !Array.isArray(value.items)) throw new Error("CODEX_SNAPSHOT_INVALID");
      return value;
    } catch (error: any) { if (error.code === "ENOENT") return undefined; throw error; }
  }
  save(snapshot: EngineSnapshot): Promise<void> {
    const serialized = JSON.stringify(snapshot);
    const task = this.queue.then(async () => {
      await this.io.mkdir(this.directory, { recursive: true });
      const temporary = join(this.directory, "snapshot-" + randomUUID() + ".tmp");
      try {
        await this.io.writeFile(temporary, serialized, { mode: 0o600 });
        await this.io.rename(temporary, join(this.directory, "snapshot.json"));
      } catch (error) {
        // Only this operation's temporary file is owned here. Keep the last snapshot.
        await this.io.unlink(temporary).catch(() => undefined);
        throw error;
      }
    });
    // A failed write must not poison every subsequent durable update.
    this.queue = task.catch(() => undefined);
    return task;
  }
}
