import { createHash } from "node:crypto";
import type { AgentEventEnvelope, Mode, PlanExecution, PlanProposal } from "@pi-desktop/shared";
import type { RuntimeHost } from "../host-client.js";
import type { CodexAdapter } from "./adapter.js";
import type { NexusTool, NexusToolResult } from "./nexus-tools.js";

const CONTROL = new Set(["EnterPlanMode", "EnterGoalMode", "SubmitPlan", "SubmitGoal"]);
const INSPECTION = new Set(["Read", "Glob", "Grep", "Bash", "ProcessRead", "PreviewServer", "BrowserPreview", "Skill", "Workflow", "asktool"]);
const schema = (properties = {}, required: string[] = []) => ({ type: "object", properties, required, additionalProperties: false });
export function planningTools(mode: Mode, tools: NexusTool[]): NexusTool[] {
  return tools.filter(tool => INSPECTION.has(tool.name) || tool.name === (mode === "goal" ? "SubmitGoal" : "SubmitPlan") || !!tool.planSafeActions?.length);
}
export function modeInstructions(mode: Mode): string {
  return mode === "agent" ? "Use your offered file, image and command tools for execution. EnterPlanMode/EnterGoalMode stop execution before entering Nexus's approval workflow." :
    `You are in Nexus ${mode} mode. Use only offered Nexus inspection tools, including the permission-checked Bash tool. No implementation or delegation before approval. Clarify with asktool, then submit the complete exact Markdown through ${mode === "goal" ? "SubmitGoal" : "SubmitPlan"}. The host owns the artifact and approval; stop after submission.`;
}
export function approvedInstruction(execution: PlanExecution, sessionId: string): string {
  if (execution.sessionId !== sessionId || execution.state !== "running" || !execution.id || !execution.proposalId ||
    !["plan", "goal"].includes(execution.kind) || typeof execution.plan !== "string" || !execution.plan.trim() ||
    !execution.artifact?.relativePath || execution.artifact.sha256 !== createHash("sha256").update(execution.plan).digest("hex") ||
    execution.artifact.sizeBytes !== Buffer.byteLength(execution.plan)) throw new Error("PLAN_EXECUTION_NOT_FOUND");
  return [execution.kind === "goal" ? "The user approved this goal contract. Reach it autonomously and verify every acceptance criterion. Report each criterion as met or unmet with observed evidence. Respect the contract's boundaries; report blockers." : "Execute the approved implementation plan and verify its result.",
    "Host-created artifact: " + execution.artifact.relativePath, "Title: " + execution.title, "Approval question: " + execution.question,
    "The following is the exact approved Markdown. Do not replace or renegotiate it or ask for approval again.",
    `<approved-${execution.kind}-markdown>`, execution.plan, `</approved-${execution.kind}-markdown>`].join("\n");
}

export class CodexPlans {
  constructor(private options: { host: RuntimeHost; adapter(): CodexAdapter; tools(): NexusTool[]; emit(event: AgentEventEnvelope): void; baseInstructions: string }) {}
  catalog(mode: Mode): NexusTool[] {
    if (mode === "agent") return ["plan", "goal"].map(kind => ({ name: kind === "plan" ? "EnterPlanMode" : "EnterGoalMode",
      description: `Stop execution and enter Nexus ${kind} mode to inspect and submit a host-owned contract for explicit approval.`, parameters: schema() }));
    return [{ name: mode === "plan" ? "SubmitPlan" : "SubmitGoal", description: `Submit the exact complete Markdown ${mode} contract for explicit approval. No execution starts before approval.`,
      parameters: schema({ title: { type: "string" }, markdown: { type: "string" }, question: { type: "string" } }, ["title", "markdown", "question"]) }];
  }
  async execute(name: string, args: any): Promise<NexusToolResult | undefined> {
    if (!CONTROL.has(name)) return undefined;
    const adapter = this.options.adapter(); const turnId = adapter.activeTurnId();
    if (!turnId || !this.catalog(adapter.config.mode ?? "agent").some(tool => tool.name === name)) return { ok: false, isError: true, content: "PLAN_NOT_ACTIVE" };
    const kind = name.endsWith("Goal") || name === "EnterGoalMode" ? "goal" : "plan";
    if (name.startsWith("Submit") && (typeof args.title !== "string" || !args.title.trim() || typeof args.markdown !== "string" || !args.markdown.trim() || typeof args.question !== "string" || !args.question.trim())) {
      return { ok: false, isError: true, content: "PLAN_INVALID_ARGUMENT" };
    }
    const itemId = await adapter.awaitToolItem(name, args);
    let result: unknown;
    await adapter.controlBoundary(itemId, async () => {
      if (name.startsWith("Enter")) {
        await this.options.host.call("plans.enter", { sessionId: adapter.config.sessionId, turnId, toolCallId: itemId, kind });
        const tools = planningTools(kind, [...this.options.tools(), ...this.catalog(kind)]);
        result = { details: { mode: kind, kind, planningState: "planning" } };
        this.emitState("planning", kind);
        return { result, text: modeInstructions(kind) + "\nContinue the original user request by inspecting and preparing its contract.",
          config: { mode: kind, restrictedTools: tools.map(tool => tool.name), developerInstructions: this.options.baseInstructions + "\n\n" + modeInstructions(kind) } };
      }
      const response = await this.options.host.call<{ status: string; proposal: PlanProposal }>("plans.submit", {
        sessionId: adapter.config.sessionId, turnId, toolCallId: itemId, kind, title: args.title.trim(), markdown: args.markdown, question: args.question.trim(),
      });
      const proposal = response.proposal;
      if (response.status !== "pending" || !proposal?.id || proposal.markdown !== args.markdown || !proposal.artifact?.relativePath ||
        proposal.artifact.sha256 !== createHash("sha256").update(args.markdown).digest("hex") || proposal.artifact.sizeBytes !== Buffer.byteLength(args.markdown)) throw new Error("PLAN_SUBMIT_FAILED");
      result = { details: { proposal } };
      this.emitState("awaiting_approval", kind, proposal);
      return { result };
    });
    return { ok: true, content: result };
  }
  private emitState(state: "planning" | "awaiting_approval", kind: "plan" | "goal", proposal?: PlanProposal): void {
    const adapter = this.options.adapter();
    this.options.emit({ sessionId: adapter.config.sessionId, turnId: adapter.activeTurnId(), ts: Date.now(), event: { type: "planning_state", state, kind,
      ...(proposal ? { proposal, proposalId: proposal.id, artifact: proposal.artifact, title: proposal.title, question: proposal.question, markdown: proposal.markdown, plan: proposal.markdown, version: proposal.version } : {}) } });
  }
}
