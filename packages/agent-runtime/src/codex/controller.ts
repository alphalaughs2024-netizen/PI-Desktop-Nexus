import { resolve } from "node:path";
import { homedir } from "node:os";
import type { AgentEventEnvelope, AskToolResolution } from "@pi-desktop/shared";
import { CodexAdapter } from "./adapter.js";
import { codexPermissionMode, type CodexConfig } from "./config.js";
import { CodexSessionStore } from "./store.js";
export class CodexController {
  private sessions = new Map<string, CodexAdapter>();
  private admitting = new Set<string>();
  private dataDir?: string;
  constructor(private emit: (event: AgentEventEnvelope) => void) {}
  configure(dataDir: string): void {
    // Explicit opt-in must never use the user's production profile.
    if (!process.env.PI_DESKTOP_DATA_DIR || resolve(dataDir).toLowerCase() === resolve(homedir(), ".pi-desktop-nexus").toLowerCase()) throw new Error("CODEX_FRESH_PROFILE_REQUIRED: set PI_DESKTOP_DATA_DIR to a separate profile");
    this.dataDir = resolve(dataDir);
  }
  async handle(method: string, params: any): Promise<unknown> {
    const sessionId = String(params.sessionId ?? "");
    const adapter = this.sessions.get(sessionId);
    switch (method) {
      case "agent.prompt": {
        if (!this.dataDir) throw new Error("CODEX_NOT_CONFIGURED");
        if (this.admitting.has(sessionId) || adapter?.getStatus().isRunning) throw new Error("AGENT_BUSY");
        if (params.mode && params.mode !== "agent") throw new Error("CODEX_CAPABILITY_UNAVAILABLE: Plan and Goal integration arrive in later phases");
        const permissionMode = codexPermissionMode(params.permissionMode);
        this.admitting.add(sessionId);
        try {
          const config: CodexConfig = { sessionId, dataDir: this.dataDir, workspace: params.projectPath || params.scratchDir, provider: params.provider,
            permissionMode };
          if (!config.workspace || !params.turnId) throw new Error("CODEX_SESSION_IDENTITY_REQUIRED");
          let runtime = adapter;
          if (runtime && JSON.stringify(runtime.config) !== JSON.stringify(config)) {
            await runtime.shutdown(); this.sessions.delete(sessionId); runtime = undefined;
          }
          if (!runtime) { runtime = new CodexAdapter(config, this.emit); this.sessions.set(sessionId, runtime); }
          return await runtime.start({ turnId: params.turnId, text: params.content ?? "", thinkingLevel: params.thinkingLevel, images: (params.attachments ?? []).filter((a: any) => a.kind === "image" && a.data).map((a: any) => ({ mimeType: a.mimeType ?? "image/png", data: a.data })) });
        } finally { this.admitting.delete(sessionId); }
      }
      case "agent.abort": await adapter?.interrupt(); return { ok: true };
      case "agent.stop": return { requested: false, reason: "Graceful boundary stop is not available in the Codex prototype; use interrupt." };
      case "agent.getStatus": {
        if (adapter) return { status: adapter.getStatus() };
        const snapshot = await this.storedSnapshot(sessionId);
        return { status: { sessionId, isRunning: this.admitting.has(sessionId), pendingToolConfirmations: 0,
          ...(snapshot ? { modelId: snapshot.session.modelId, execution: { session: snapshot.session, turn: snapshot.turn, sequence: snapshot.sequence } } : {}) } };
      }
      case "agent.engineSnapshot": {
        if (adapter) return { snapshot: adapter.snapshot() };
        if (!this.dataDir) throw new Error("CODEX_NOT_CONFIGURED");
        return { snapshot: await this.storedSnapshot(sessionId) };
      }
      case "agent.recover": if (!adapter) throw new Error("CODEX_SESSION_NOT_LOADED"); return { snapshot: await adapter.recover() };
      case "agent.steeringContext": {
        if (!adapter) throw Object.assign(new Error("Codex session unavailable"), { errorCode: "MISSING_SESSION" });
        return adapter.steeringContext(String(params.expectedTurnId ?? ""));
      }
      case "agent.steer": {
        if (!adapter) return { state: "unavailable", reason: "missing_session" };
        if (params.attachments?.length) return { state: "failed", reason: "Codex steering currently accepts text only. Send attachments in the next user turn." };
        return adapter.steer({ expectedTurnId: String(params.expectedTurnId ?? ""), text: String(params.content ?? ""), messageId: params.messageId ?? params.message?.id });
      }
      case "agent.resolveApproval": {
        if (params.decision !== "allow-once" && params.decision !== "deny") throw new Error("CODEX_APPROVAL_SCOPE_UNSUPPORTED: choose Allow once or Deny");
        for (const runtime of this.sessions.values()) if (runtime.resolveApproval(params.requestId, params.decision)) return { ok: true };
        throw new Error("CODEX_APPROVAL_STALE");
      }
      case "asktool.resolve": if (!adapter?.resolveQuestion(params as AskToolResolution)) throw new Error("CODEX_QUESTION_STALE"); return { ok: true };
      case "agent.disposeSession": await adapter?.shutdown(); this.sessions.delete(sessionId); return { ok: true };
      default: throw new Error("CODEX_CAPABILITY_UNAVAILABLE: " + method);
    }
  }
  private async storedSnapshot(sessionId: string) {
    if (!this.dataDir) return undefined;
    const store = new CodexSessionStore(this.dataDir, sessionId);
    const snapshot = await store.read();
    if (snapshot?.turn && !snapshot.turn.outcome) {
      // This controller has no process owning the old run. Preserve uncertainty,
      // never advertise that old commands are still making progress.
      snapshot.turn.outcome = "interrupted";
      snapshot.turn.phase = "terminal";
      snapshot.turn.completedAt = Date.now();
      snapshot.turn.error = "Previous engine process is unavailable; no actions replayed.";
      for (const item of snapshot.items) if (item.status === "running") {
        item.status = "interrupted"; item.completedAt = snapshot.turn.completedAt;
      }
      await store.save(snapshot);
    }
    return snapshot;
  }
  async shutdown(): Promise<void> { await Promise.all([...this.sessions.values()].map(runtime => runtime.shutdown())); this.sessions.clear(); }
}
