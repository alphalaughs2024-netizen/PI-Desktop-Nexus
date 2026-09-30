import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, mkdir, writeFile, rename, unlink, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { EngineSnapshot } from "@pi-desktop/shared";
import { CodexSessionStore, recoveryWriteError } from "./store.js";

const directories: string[] = [];
afterEach(async () => { await Promise.all(directories.splice(0).map(path => rm(path, { recursive: true, force: true }))); });
const snapshot: EngineSnapshot = { schema: 1, sequence: 0, items: [], session: { sessionId: "s", engine: "codex", version: "test", workspace: "fixture", providerId: "p", modelId: "m", capabilities: { imageInput: true, nativeTools: true, recovery: true, steering: true, browser: false, managedPreview: false } } };
async function fixture() { const root = await mkdtemp(join(tmpdir(), "nexus-store-")); directories.push(root); return root; }

describe("Codex recovery storage", () => {
  it.each(["ENOSPC", "EDQUOT", "EACCES"])("keeps the prior snapshot and removes only its failed temporary file on %s", async code => {
    const root = await fixture(); const store = new CodexSessionStore(root, "s"); await store.save(snapshot);
    await writeFile(join(store.directory, "other-request.tmp"), "keep");
    const cause = Object.assign(new Error("private path and raw detail"), { code });
    const failed = new CodexSessionStore(root, "s", { mkdir, rename, unlink, writeFile: vi.fn(async (...args: Parameters<typeof writeFile>) => { await writeFile(...args); throw cause; }) as typeof writeFile });
    await expect(failed.save({ ...snapshot, sequence: 1 })).rejects.toBe(cause);
    expect(await readdir(store.directory)).toEqual(expect.arrayContaining(["snapshot.json", "other-request.tmp"]));
    expect((await readdir(store.directory)).filter(name => name.startsWith("snapshot-"))).toEqual([]);
    expect((await store.read())?.sequence).toBe(0);
    expect(await readFile(join(store.directory, "other-request.tmp"), "utf8")).toBe("keep");
  });
  it("does not poison queued saves after a rename failure", async () => {
    const root = await fixture(); const cause = Object.assign(new Error("rename failed"), { code: "EACCES" });
    const store = new CodexSessionStore(root, "s", { mkdir, writeFile, unlink, rename: vi.fn().mockRejectedValueOnce(cause).mockImplementation(rename) });
    const failed = store.save(snapshot); const next = store.save({ ...snapshot, sequence: 2 });
    await expect(failed).rejects.toBe(cause); await next;
    expect((await store.read())?.sequence).toBe(2);
    expect(await readdir(store.directory)).toEqual(["snapshot.json"]);
  });
  it("reports bounded disk-full diagnostics without claiming durable output", () => {
    const full = recoveryWriteError({ code: "ENOSPC", message: "secret" });
    expect(full).toMatchObject({ code: "CODEX_RECOVERY_STORAGE_FULL", details: { filesystemCode: "ENOSPC" } });
    expect(full.message).toContain("not confirmed"); expect(full.message).toContain("Storage is full");
    expect(JSON.stringify(full)).not.toContain("secret");
    expect(recoveryWriteError({ code: "unsafe private detail" })).toMatchObject({ code: "CODEX_RECOVERY_WRITE_FAILED", details: { filesystemCode: "UNKNOWN" } });
  });
});
