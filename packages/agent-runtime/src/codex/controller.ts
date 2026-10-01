import { resolve } from "node:path";
import { homedir } from "node:os";
import { createHash } from "node:crypto";
import type { AgentEventEnvelope, AskToolResolution, Mode } from "@pi-desktop/shared";
import { CodexAdapter } from "./adapter.js";
import { codexPermissionMode, type CodexConfig } from "./config.js";
import type { RuntimeHost } from "../host-client.js";
import { projectInstructionsPrompt } from "../project-instructions-prompt.js";
import { instructionCatalogPrompt } from "../plugin-skills-prompt.js";
import { startNexusToolBridge, nexusToolCatalog, type NexusTool } from "./nexus-tools.js";
import { CodexSessionStore } from "./store.js";
import { CodexSubagents } from "./subagents.js";
import { CodexExtensions } from "./extensions.js";
import { CodexPlans, modeInstructions, planningTools, approvedInstruction } from "./plans.js";
export class CodexController {
  private sessions = new Map<string, CodexAdapter>();
  private delegates = new Map<string, CodexSubagents>();
  private extensions = new Map<string, CodexExtensions>();
  private plans = new Map<string, CodexPlans>();
  private admitting = new Set<string>();
  private dataDir?: string;
  constructor(private emit: (event: AgentEventEnvelope) => void, private host?: RuntimeHost) {}
  configure(dataDir: string): void {
    // Explicit opt-in must never use the user's production profile.
    if (!process.env.PI_DESKTOP_DATA_DIR || resolve(dataDir).toLowerCase() === resolve(homedir(), ".pi-desktop-nexus").toLowerCase()) throw new Error("CODEX_FRESH_PROFILE_REQUIRED: set PI_DESKTOP_DATA_DIR to a separate profile");
    this.dataDir = resolve(dataDir);
  }
  async handle(method: string, params: any): Promise<unknown> {
    const sessionId = String(params.sessionId ?? "");
    const adapter = this.sessions.get(sessionId);
    switch (method) {
      case "agent.executeApprovedPlan":
      case "agent.prompt": {
        if (!this.dataDir) throw new Error("CODEX_NOT_CONFIGURED");
        if (this.admitting.has(sessionId) || adapter?.getStatus().isRunning) throw new Error("AGENT_BUSY");
        const mode: Mode = method === "agent.executeApprovedPlan" ? "agent" : params.mode ?? "agent";
        if (!["agent", "plan", "goal"].includes(mode)) throw new Error("CODEX_MODE_UNSUPPORTED");
        if (mode !== "agent" && !this.host) throw new Error("CODEX_HOST_REQUIRED");
        const content = method === "agent.executeApprovedPlan" ? approvedInstruction(params.execution ?? {}, sessionId) : params.content ?? "";
        const permissionMode = codexPermissionMode(params.permissionMode);
        if (method === "agent.executeApprovedPlan" && codexPermissionMode(params.execution.targetPermissionMode) !== permissionMode) throw new Error("PLAN_EXECUTION_PERMISSION_MISMATCH");
        this.admitting.add(sessionId);
        try {
          const hostTools = this.host ? (await this.host.call<{ tools: NexusTool[] }>("tools.list", { sessionId })).tools ?? [] : [];
          const available = nexusToolCatalog([...hostTools, ...(params.pluginTools ?? [])], true);
          const baseInstructions = [
            "Nexus is the graphical host. Use Nexus MCP tools for browser/preview, skills, workflows and plugins. Every tool is bound to this chat. Preserve user work, inspect failures and never automatically replay an ambiguously applied mutation.",
            "Delegate through Nexus Task presets only in Agent mode. Saved provider/model and tools are authoritative; do not invent model overrides.",
            params.scratchDir ? "Session scratch directory: " + params.scratchDir + ". Keep temporary files there; workspace deliverables belong in the workspace." : "",
            projectInstructionsPrompt(params.projectInstructions), instructionCatalogPrompt(params.instructionCatalog ?? []), params.activeWorkflow?.body,
          ].filter(Boolean).join("\n\n");
          const config: CodexConfig = { sessionId, dataDir: this.dataDir, workspace: params.projectPath || params.scratchDir, provider: params.provider,
            permissionMode, scratchDir: params.scratchDir, nexusToolsAvailable: !!this.host, mode,
            serviceCatalogKey: createHash("sha256").update(JSON.stringify({ subagents: params.subagents ?? [], tools: available, extensions: params.trustedExtensions ?? [] })).digest("hex"),
            developerInstructions: baseInstructions + "\n\n" + modeInstructions(mode),
            ...(mode !== "agent" ? { restrictedTools: planningTools(mode, available).map(tool => tool.name).concat(mode === "plan" ? "SubmitPlan" : "SubmitGoal", "asktool") } : {}),
          };
          if (!config.workspace || !params.turnId) throw new Error("CODEX_SESSION_IDENTITY_REQUIRED");
          let runtime = adapter;
          if (runtime && JSON.stringify(runtime.config) !== JSON.stringify(config)) {
            await this.extensions.get(sessionId)?.dispose(); this.extensions.delete(sessionId);
            await runtime.shutdown(); this.sessions.delete(sessionId); this.delegates.delete(sessionId); this.plans.delete(sessionId); runtime = undefined;
          }
          let delegates = this.delegates.get(sessionId);
          if (!runtime) {
            runtime = new CodexAdapter(config, event => { this.emit(event); this.extensions.get(sessionId)?.event(event); }, this.host ? { tools: snapshot => startNexusToolBridge({
              host: this.host!, sessionId, scratchDir: config.scratchDir ?? config.workspace, mode: config.mode ?? "agent", snapshot,
              includeNative: config.mode !== "agent", allowedTools: config.restrictedTools, commandShell: params.commandShell,
              tools: [...(params.pluginTools ?? []), ...(config.mode === "agent" ? delegates?.catalog() ?? [] : []), ...(this.plans.get(sessionId)?.catalog(config.mode ?? "agent") ?? []),
                ...(config.mode === "agent" ? this.extensions.get(sessionId)?.catalog() ?? [] : []), { name: "asktool", description: "Ask the user questions through Nexus and wait for their answers. Cancellation preserves unanswered questions; never invent an answer.",
                  parameters: { type: "object", properties: { questions: { type: "array", minItems: 1, maxItems: 20, items: { type: "object", properties: {
                    question: { type: "string" }, options: { type: "array", items: { type: "string" }, minItems: 1 }, multiSelect: { type: "boolean" } }, required: ["question", "options"], additionalProperties: false } } }, required: ["questions"], additionalProperties: false } }], imageInput: config.provider.modelConfig?.input.includes("image") === true,
              executeLocal: async (name, args, internalId) => await this.plans.get(sessionId)?.execute(name, args)
                ?? (name === "asktool" ? await runtime!.askQuestions(args, internalId) : undefined)
                ?? await delegates?.execute(name, args, name === "Task" ? runtime!.claimToolItem(name, args) : internalId)
                ?? await this.extensions.get(sessionId)?.execute(name, args, internalId),
            }), beforeComplete: signal => delegates?.beforeComplete(signal) ?? Promise.resolve(undefined), stopOwnedWork: () => delegates?.stopAll() ?? Promise.resolve() } : {});
            this.sessions.set(sessionId, runtime);
          }
          if (this.host) {
            if (!this.plans.has(sessionId)) this.plans.set(sessionId, new CodexPlans({ host: this.host, adapter: () => runtime!, emit: this.emit,
              tools: () => [...available, { name: "asktool", parameters: {} }], baseInstructions }));
            const options = { parent: config, host: this.host, definitions: params.subagents ?? [], providers: params.subagentProviders ?? {}, thinkingLevel: params.thinkingLevel,
              commandShell: params.commandShell, tools: params.pluginTools ?? [], currentTurn: () => runtime!.activeTurnId(), emit: this.emit, activity: (count: number) => runtime!.setDelegationActivity(count),
              settled: (id: string, value: { status: string }) => runtime!.completeTask(id, value, value.status === "failed") };
            if (delegates) delegates.update(options);
            else { delegates = new CodexSubagents(options); this.delegates.set(sessionId, delegates); }
            if (!this.extensions.has(sessionId) && params.trustedExtensions?.length) {
              const extensions = new CodexExtensions({ sessionId, workspace: config.workspace, host: this.host, specs: params.trustedExtensions,
                adapter: () => runtime!, mode: () => runtime!.config.mode ?? "agent", reservedTools: [...hostTools.map(tool => tool.name), ...(params.pluginTools ?? []).map((tool: any) => tool.name),
                  "Task", "TaskWait", "TaskList", "TaskStop", "EnterPlanMode", "EnterGoalMode", "SubmitPlan", "SubmitGoal", "exec_command", "apply_patch"] });
              this.extensions.set(sessionId, extensions); await extensions.load();
            }
            this.extensions.get(sessionId)?.setThinkingLevel(params.thinkingLevel ?? "off");
          }
          return await runtime.start({ turnId: params.turnId, text: content, thinkingLevel: params.thinkingLevel, images: (params.attachments ?? []).filter((a: any) => a.kind === "image" && a.data).map((a: any) => ({ mimeType: a.mimeType ?? "image/png", data: a.data })) });
        } finally { this.admitting.delete(sessionId); }
      }
      case "agent.abort": await adapter?.interrupt(); await this.host?.call("plans.abort", { sessionId }); return { ok: true };
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
      case "extensions.command.run": return await this.extensions.get(sessionId)?.command(String(params.name ?? ""), String(params.args ?? "")) ?? { handled: false };
      case "agent.disposeSession": await adapter?.shutdown(); await this.extensions.get(sessionId)?.dispose(); this.extensions.delete(sessionId); this.sessions.delete(sessionId); this.delegates.delete(sessionId); this.plans.delete(sessionId); return { ok: true };
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
  async shutdown(): Promise<void> { await Promise.all([...this.sessions.values()].map(runtime => runtime.shutdown())); await Promise.all([...this.extensions.values()].map(extensions => extensions.dispose())); this.sessions.clear(); this.delegates.clear(); this.extensions.clear(); this.plans.clear(); }
}
