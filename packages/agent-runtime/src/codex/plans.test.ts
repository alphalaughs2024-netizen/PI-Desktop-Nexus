import { expect, it } from "vitest";
import { createHash } from "node:crypto";
import { CodexPlans, approvedInstruction, planningTools } from "./plans.js";
const markdown = "# Plan\r\n\r\nKeep exact bytes.\n";
const artifact = { relativePath:".pi/plan/fixture.md", sha256:createHash("sha256").update(markdown).digest("hex"), sizeBytes:Buffer.byteLength(markdown) };
it("offers only inspection and the matching submit tool in contract modes", () => {
  const names = planningTools("plan", ["Read", "Write", "Edit", "Bash", "Task", "SubmitGoal", "SubmitPlan", "asktool", "browser_evaluate"].map(name => ({name, parameters:{}}))).map(tool => tool.name);
  expect(names).toEqual(["Read", "Bash", "SubmitPlan", "asktool"]);
});
it("submits exact Markdown only after the native boundary and keeps the proposal pending", async () => {
  let stopped = false; const calls: any[] = [], events: any[] = [];
  const adapter = { config:{sessionId:"chat", mode:"plan"}, activeTurnId:() => "turn", awaitToolItem:async () => "native-submit",
    controlBoundary: async (_: string, prepare: any) => {stopped = true; const value = await prepare(); expect(value.text).toBeUndefined();} };
  const host = {call:async <T>(method: string, args: any) => {expect(stopped).toBe(true); calls.push({method,args}); return {status:"pending", proposal:{id:"proposal", markdown:args.markdown, artifact}} as T;}};
  const plans = new CodexPlans({adapter:() => adapter as any, host, tools:() => [], baseInstructions:"base", emit:event => events.push(event)});
  expect((await plans.execute("SubmitPlan", {title:"Plan", markdown, question:"Approve?"}))?.ok).toBe(true);
  expect(calls[0]).toMatchObject({method:"plans.submit", args:{sessionId:"chat", turnId:"turn", toolCallId:"native-submit", markdown}});
  expect(events[0].event).toMatchObject({type:"planning_state", state:"awaiting_approval", proposalId:"proposal"});
  expect((await plans.execute("SubmitGoal", {title:"Goal", markdown, question:"Approve?"}))?.ok).toBe(false);
});
it("rejects unclaimed, mismatched or tampered approved executions", () => {
  const execution: any = {id:"execution", proposalId:"proposal", sessionId:"chat", state:"running", kind:"goal", plan:markdown, artifact, title:"Goal", question:"Approve?"};
  expect(approvedInstruction(execution, "chat")).toContain(markdown);
  expect(() => approvedInstruction({...execution, state:"queued"}, "chat")).toThrow();
  expect(() => approvedInstruction(execution, "other")).toThrow();
  expect(() => approvedInstruction({...execution, plan:markdown+"modified"}, "chat")).toThrow();
});
it("cannot transition the host before its native item binds, including cancellation", async () => {
  let bind!: (id: string) => void;
  const gate = new Promise<string>(resolve => { bind = resolve; });
  let boundaries = 0;
  const adapter = { config: { sessionId: "chat", mode: "agent" }, activeTurnId: () => "turn", awaitToolItem: () => gate,
    controlBoundary: async () => { boundaries++; } };
  const plans = new CodexPlans({ adapter: () => adapter as any, host: { call: async () => { throw Error("unexpected host call"); } }, tools: () => [], baseInstructions: "base", emit: () => {} });
  const pending = plans.execute("EnterPlanMode", {});
  await Promise.resolve(); expect(boundaries).toBe(0);
  bind("matched"); await pending; expect(boundaries).toBe(1);
  adapter.awaitToolItem = () => Promise.reject(Error("turn cancelled"));
  await expect(plans.execute("EnterPlanMode", {})).rejects.toThrow("turn cancelled");
  expect(boundaries).toBe(1);
});
