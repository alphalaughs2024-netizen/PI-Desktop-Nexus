import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import type { EngineSnapshot } from "@pi-desktop/shared";
/** Private engine recovery metadata; never contains launch credentials. */
export class CodexSessionStore {
  readonly directory: string;
  private queue = Promise.resolve();
  constructor(root: string, sessionId: string) {
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
      await mkdir(this.directory, { recursive: true });
      const temporary = join(this.directory, "snapshot-" + randomUUID() + ".tmp");
      await writeFile(temporary, serialized, { mode: 0o600 });
      await rename(temporary, join(this.directory, "snapshot.json"));
    });
    // A failed write must not poison every subsequent durable update.
    this.queue = task.catch(() => undefined);
    return task;
  }
}
