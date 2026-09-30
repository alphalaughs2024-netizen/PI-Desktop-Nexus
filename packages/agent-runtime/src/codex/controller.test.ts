import { afterEach, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CodexController } from "./controller.js";
import { CodexSessionStore } from "./store.js";
import type { EngineSnapshot } from "@pi-desktop/shared";
const dirs: string[] = [];
afterEach(async () => { vi.unstubAllEnvs(); await Promise.all(dirs.splice(0).map(p => rm(p, { recursive: true, force: true }))); });
it("reconstructs cold unresolved state as interrupted without launching an engine", async () => {
  const dir = await mkdtemp(join(tmpdir(), "nexus-controller-")); dirs.push(dir); vi.stubEnv("PI_DESKTOP_DATA_DIR", dir);
  const snapshot: EngineSnapshot = { schema: 1, sequence: 3, session: { sessionId: "s", engine: "codex", version: "0.157.1", workspace: dir, providerId: "p", modelId: "m", nativeHandle: "native", capabilities: { imageInput: false, nativeTools: true, recovery: true, browser: false, managedPreview: false, steering: false } }, turn: { id: "turn", runId: "run", nativeTurnId: "native-turn", startedAt: 1, phase: "running" }, items: [{ id: "tool", nativeId: "tool", kind: "tool", label: "mutation", status: "running", text: "partial result", startedAt: 2 }] };
  await new CodexSessionStore(dir, "s").save(snapshot);
  const controller = new CodexController(() => { throw new Error("No replay events expected"); }); controller.configure(dir);
  const result = await controller.handle("agent.engineSnapshot", { sessionId: "s" }) as any;
  expect(result.snapshot.turn.outcome).toBe("interrupted"); expect(result.snapshot.items[0].text).toBe("partial result"); expect(result.snapshot.items[0].status).toBe("interrupted");
  const status = await controller.handle("agent.getStatus", { sessionId: "s" }) as any;
  expect(status.status.isRunning).toBe(false); expect(status.status.execution.session.nativeHandle).toBe("native");
  expect((await new CodexSessionStore(dir, "s").read())?.turn?.outcome).toBe("interrupted"); await controller.shutdown();
});
it("rejects unsupported legacy mode and requests without pi fallback", async () => {
  const dir = await mkdtemp(join(tmpdir(), "nexus-controller-")); dirs.push(dir); vi.stubEnv("PI_DESKTOP_DATA_DIR", dir);
  const controller = new CodexController(() => undefined); controller.configure(dir);
  await expect(controller.handle("agent.prompt", { sessionId: "s", mode: "plan" })).rejects.toThrow("CODEX_CAPABILITY_UNAVAILABLE");
  await expect(controller.handle("agent.prompt", { sessionId: "s", mode: "agent", permissionMode: "full-access" })).rejects.toThrow("CODEX_PERMISSION_MODE_UNSUPPORTED");
  await expect(controller.handle("agent.compact", { sessionId: "s" })).rejects.toThrow("CODEX_CAPABILITY_UNAVAILABLE");
  await expect(controller.handle("agent.resolveApproval", { requestId: "missing", decision: "allow-session" })).rejects.toThrow("CODEX_APPROVAL_SCOPE_UNSUPPORTED");
  expect(await controller.handle("agent.steer", { sessionId: "s" })).toMatchObject({ state: "unavailable" }); await controller.shutdown();
});
