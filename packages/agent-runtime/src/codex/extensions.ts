import { randomUUID } from "node:crypto";
import type { AgentEventEnvelope, TrustedExtensionSpec, TrustedExtensionUiResponse } from "@pi-desktop/shared";
import type { RuntimeHost } from "../host-client.js";
import { TrustedExtensionRunner, type TrustedExtensionBridge, type TrustedExtensionEventName } from "../extensions/runner.js";
import type { CodexAdapter } from "./adapter.js";
import type { NexusTool, NexusToolResult } from "./nexus-tools.js";

const SUPPORTED = new Set(["session_start", "session_shutdown", "session_info_changed", "agent_start", "agent_end", "agent_settled",
  "turn_start", "turn_end", "message_start", "message_update", "message_end", "tool_call", "tool_result", "tool_execution_start", "tool_execution_update", "tool_execution_end"]);
const UNSUPPORTED = new Set(["compact", "setThinkingLevel", "setActiveTools"]);
type Options = { sessionId: string; workspace: string; specs: TrustedExtensionSpec[]; host: RuntimeHost; adapter(): CodexAdapter; reservedTools: string[]; mode(): string };

/** Legacy extension API over the Codex session; no second agent loop. */
export class CodexExtensions {
  private runner: TrustedExtensionRunner;
  private lifetime = new AbortController();
  private pending = new Set<Promise<unknown>>();
  private sessionName?: string;
  private loading?: Promise<unknown>;
  private thinkingLevel = "off";
  setThinkingLevel(level: string): void { this.thinkingLevel = level; }
  constructor(private options: Options) {
    const host = options.host;
    const bridge: TrustedExtensionBridge = {
      sessionId: options.sessionId, cwd: options.workspace,
      getModel: () => ({ id: options.adapter().config.provider.modelId, provider: options.adapter().config.provider.id }),
      setModel: async () => false, getThinkingLevel: () => this.thinkingLevel, setThinkingLevel: () => {},
      isIdle: () => !options.adapter().getStatus().isRunning, abort: () => { void options.adapter().interrupt(); }, hasPendingMessages: () => false,
      getContextUsage: () => undefined, compact: () => {}, getSystemPrompt: () => options.adapter().config.developerInstructions ?? "",
      getActiveTools: () => [...options.reservedTools, ...this.catalog().map(tool => tool.name)],
      getAllTools: () => bridge.getActiveTools().map(name => ({ name, description: name, active: true })), setActiveTools: () => {},
      getSessionName: () => this.sessionName,
      setSessionName: async name => { await host.call("session.rename", { id: options.sessionId, title: name }); this.sessionName = name; await this.runner.emit("session_info_changed", { type: "session_info_changed", name }); },
      sendUserMessage: async (content, settings) => {
        const text = typeof content === "string" ? content : content.map((part: any) => typeof part?.text === "string" ? part.text : "").join("");
        if (!text.trim()) throw new Error("CODEX_EXTENSION_TEXT_REQUIRED");
        const pushed = await host.call<{ id?: string }>("session.queuePush", { sessionId: options.sessionId, idempotencyKey: randomUUID(), content: text });
        if (settings?.deliverAs === "steer" && pushed.id) await host.call("session.queuePrioritize", { sessionId: options.sessionId, id: pushed.id });
      },
      waitForIdle: async () => {
        while (options.adapter().getStatus().isRunning && !this.lifetime.signal.aborted) await new Promise(resolve => setTimeout(resolve, 50));
      },
      newSession: async () => { await host.call("session.create", { projectPath: options.workspace, mode: options.mode() }); return { cancelled: false }; },
      fork: async entryId => { await host.call("session.fork", { sessionId: options.sessionId, throughMessageId: entryId || undefined }); return { cancelled: false }; },
      requestUi: (extension, request) => host.call<TrustedExtensionUiResponse>("extensions.ui.request", { sessionId: options.sessionId, extensionId: extension.id, extensionLabel: extension.label, request }),
      publishCommands: commands => this.publish("extensions.commands.publish", { sessionId: options.sessionId, commands }),
      publishDiagnostics: diagnostics => this.publish("extensions.diagnostics.publish", { sessionId: options.sessionId, diagnostics, reports: this.runner?.getLoadReports() ?? [] }),
    };
    this.runner = new TrustedExtensionRunner({ specs: options.specs, bridge, reservedToolNames: () => options.reservedTools, supportedEvents: SUPPORTED, unsupportedMembers: UNSUPPORTED });
  }
  private publish(method: string, params: unknown): void {
    const pending = this.options.host.call(method, params).catch(() => undefined);
    this.pending.add(pending); void pending.finally(() => this.pending.delete(pending));
  }
  async load(): Promise<void> { await (this.loading ??= this.runner.load()); await Promise.all([...this.pending]); }
  catalog(): NexusTool[] { return this.runner.getAgentTools().map(tool => ({ name: tool.name, description: tool.description, parameters: tool.parameters })); }
  async command(name: string, args: string): Promise<{ handled: boolean }> {
    await this.load(); return { handled: await this.runner.runCommand(name, args) };
  }
  async execute(name: string, args: any, id: string): Promise<NexusToolResult | undefined> {
    const tool = this.runner.getAgentTools().find(tool => tool.name === name);
    if (!tool) return undefined;
    if (this.lifetime.signal.aborted || this.options.mode() !== "agent" || !this.options.adapter().activeTurnId()) return { ok: false, isError: true, content: "CODEX_EXTENSION_TOOL_INACTIVE" };
    const signal = this.options.adapter().executionSignal();
    const blocked = await this.runner.emit<{ block?: boolean; reason?: string }>("tool_call", { type: "tool_call", toolName: name, toolCallId: id, input: args }, (acc, next) => acc?.block ? acc : next);
    if (blocked?.block) return { ok: false, isError: true, content: blocked.reason ?? "Blocked by trusted extension" };
    signal.throwIfAborted();
    const value = await tool.execute(id, tool.prepareArguments ? tool.prepareArguments(args) : args, signal);
    signal.throwIfAborted();
    const replacement = await this.runner.emit<any>("tool_result", { type: "tool_result", toolName: name, toolCallId: id, input: args, ...value }, (acc, next) => ({ ...acc, ...next }));
    const result = { ...value, ...replacement };
    return { ok: result.isError !== true, isError: result.isError, content: result.content, details: result.details };
  }
  event(envelope: AgentEventEnvelope): void {
    if (envelope.parentToolCallId || this.lifetime.signal.aborted) return;
    const event = envelope.event;
    if (event.type === "error") { void this.runner.emit("agent_settled", { type: "agent_settled", error: event.error }); return; }
    const name = event.type === "tool_start" ? "tool_execution_start" : event.type === "tool_update" ? "tool_execution_update" : event.type === "tool_end" ? "tool_execution_end" : event.type;
    if (!SUPPORTED.has(name)) return;
    void this.runner.emit(name as TrustedExtensionEventName, { ...event, type: name });
    if (event.type === "agent_end") void this.runner.emit("agent_settled", { type: "agent_settled" });
  }
  async dispose(): Promise<void> { this.lifetime.abort(); await this.runner.dispose(); await Promise.all([...this.pending]); }
}
