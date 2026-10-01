import { afterEach, expect, it } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AgentEventEnvelope, SubagentDefinition } from "@pi-desktop/shared";
import { CodexSubagents } from "./subagents.js";
import type { CodexConfig } from "./config.js";
const dirs: string[] = [];
afterEach(async () => { await Promise.all(dirs.splice(0).map(dir => rm(dir, { recursive: true, force: true }))); });
async function fixture() {
  const dir = await mkdtemp(join(tmpdir(), "nexus-delegates-")); dirs.push(dir);
  let current: string | undefined = "parent-turn";
  const provider = { id: "parent-provider", modelId: "parent-model", name: "Fixture", apiKey: "", baseUrl: "http://127.0.0.1", authKind: "none", supportsReasoning: false, supportedThinkingLevels: [] };
  const parent: CodexConfig = { sessionId: "parent", dataDir: dir, workspace: dir, permissionMode: "auto", provider };
  const definition: SubagentDefinition = { name: "reviewer", description: "Review", source: "user", tools: ["Read", "Grep"], prompt: "Read only", model: { providerId: "alternate", modelId: "exact" }, permission: "ask", maxTurns: 4 };
  const events: AgentEventEnvelope[] = []; const children: any[] = [];
  const host = { call: async <T>(_method: string, _params?: any) => ({ tools: ["Read", "Grep", "Write", "Bash"].map(name => ({ name, parameters: { type: "object", properties: {} } })) }) as T };
  const options = { parent, host, definitions: [definition], providers: { "alternate/exact": { ...provider, id: "alternate", modelId: "exact" } }, currentTurn: () => current, emit: (event: AgentEventEnvelope) => events.push(event), activity: () => {},
    create: (config: any, emit: any, tools: any) => {
      const state: any = { items: [], turn: { id: "child" } }; let closed = 0;
      const child = { config, tools, state, get closed() { return closed; }, finish(outcome = "completed", text = "Child report") {
        state.items = [{ kind: "assistant", text }]; state.turn.outcome = outcome;
        emit({ sessionId: config.sessionId, turnId: "child", ts: Date.now(), event: { type: "message_end", message: { id: "answer", role: "assistant", content: text, createdAt: new Date().toISOString(), status: "complete" } } });
        emit({ sessionId: config.sessionId, turnId: "child", ts: Date.now(), event: { type: "status", status: { isRunning: false } } });
      }, start: async () => ({ accepted: true }), interrupt: async () => child.finish("interrupted", "Partial result"), shutdown: async () => { closed++; }, snapshot: () => state };
      children.push(child); return child as any;
    } };
  const manager = new CodexSubagents(options);
  return { manager, options, children, events, definition, setCurrent: (value?: string) => { current = value; } };
}
it("pins exact provider/model and only declared tools, attributing child events to the parent", async () => {
  const f = await fixture();
  const started = await f.manager.execute("Task", { agent: "reviewer", task: "Review this" }, "parent-task");
  expect(started?.ok).toBe(true); expect(f.children[0].config).toMatchObject({ provider: { id: "alternate", modelId: "exact" }, restrictedTools: ["Read", "Grep"], maxModelRequests: 4 });
  f.children[0].finish();
  await f.manager.execute("TaskWait", { delegationIds: [(started!.content as any).delegationId] }, "wait");
  expect(f.events[0]).toMatchObject({ sessionId: "parent", turnId: "parent-turn", parentToolCallId: "parent-task", agentName: "reviewer" });
  expect(f.events[0].event).toMatchObject({ type: "message_end", message: { parentToolCallId: "parent-task", agentName: "reviewer" } });
  expect(f.events.some(event => ["status", "agent_end", "error"].includes(event.event.type))).toBe(false);
  expect(await f.manager.beforeComplete(new AbortController().signal)).toBeUndefined();
  expect(f.children[0].closed).toBe(1);
});
it("keeps live reasoning, commentary and final output inside the owning Task", async () => {
  const f = await fixture();
  let emitChild: any;
  const create = f.options.create;
  f.options.create = (config, emit, tools) => { emitChild = emit; return create(config, emit, tools); };
  f.manager.update(f.options);
  await f.manager.execute("Task", { agent: "reviewer", task: "Review" }, "task-owner");
  for (const type of ["message_start", "message_update", "message_end"]) {
    emitChild({ sessionId: "child", turnId: "child-turn", ts: Date.now(), event: { type, message: { id: "reasoning", role: "assistant", content: "", thinking: "Available model reasoning", status: "streaming", createdAt: new Date().toISOString() } } });
  }
  for (const event of f.events) expect(event).toMatchObject({ parentToolCallId: "task-owner", event: { message: { parentToolCallId: "task-owner", agentName: "reviewer" } } });
  await f.manager.stopAll();
});
it("reports actual shell policy and advisory ownership without changing tool rights", async () => {
  const f = await fixture(); f.definition.tools = ["Read", "Bash"];
  const started = await f.manager.execute("Task", { agent: "reviewer", task: "Inspect", ownership: { access: "read", paths: ["src"] } }, "t");
  expect(started?.content).toMatchObject({ ownership: { access: "write" }, executionPolicy: { tools: ["Read", "Bash"], shell: "nexus-host", permissionScope: "ask", parentPermissionMode: "auto", ownershipEnforcement: "scheduling-only" } });
  expect(f.manager.catalog()[0].description).toContain("not the parent's native shell sandbox");
  await f.manager.stopAll();
});
it("delivers a declared browser screenshot as image input with parent execution identity", async () => {
  const f = await fixture(); f.definition.model = undefined; f.definition.tools = ["browser_screenshot"];
  f.options.parent.provider.modelConfig = { input: ["text", "image"] } as any;
  const path = join(f.options.parent.workspace, "shot.png");
  await writeFile(path, Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jTrsAAAAASUVORK5CYII=", "base64"));
  const executions: any[] = [];
  f.options.host.call = async <T>(method: string, params?: any) => (method === "tools.list" ? { tools: [{ name: "browser_screenshot", parameters: {} }] }
    : (executions.push(params), { ok: true, content: "Screenshot", details: { result: { path } } })) as T;
  f.manager.update(f.options);
  expect((await f.manager.execute("Task", { agent: "reviewer", task: "Inspect the screenshot" }, "task"))?.ok).toBe(true);
  const bridge = await f.children[0].tools(() => ({ turn: { id: "child", runId: "child-run" } }));
  try {
    const response = await fetch(bridge.url, { method: "POST", headers: { Authorization: "Bearer " + bridge.token }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "browser_screenshot", arguments: { browserId: "browser-core-1" } } }) });
    const value = await response.json() as any;
    expect(value.result.content[1]).toMatchObject({ type: "image", mimeType: "image/png" });
    expect(executions[0]).toMatchObject({ sessionId: "parent", turnId: "parent-turn", permissionScope: "ask" });
  } finally { await bridge.close(); await f.manager.stopAll(); }
});
it("refuses model overrides, missing pins and unavailable tools without launching a worker", async () => {
  const f = await fixture();
  expect((await f.manager.execute("Task", { agent: "reviewer", task: "Review", model: "cheap" }, "t"))?.ok).toBe(false);
  f.options.providers = {} as any;
  expect((await f.manager.execute("Task", { agent: "reviewer", task: "Review" }, "t"))?.ok).toBe(false);
  f.definition.model = undefined; f.definition.tools = ["NotAvailable"];
  expect((await f.manager.execute("Task", { agent: "reviewer", task: "Review" }, "t"))?.ok).toBe(false);
  expect(f.children).toHaveLength(0);
});
it("inherits the selected chat model when unpinned and refuses concurrent writers", async () => {
  const f = await fixture(); f.definition.model = undefined; f.definition.tools = ["Write"];
  const first = await f.manager.execute("Task", { agent: "reviewer", task: "Write", ownership: { access: "read", paths: ["a"] } }, "t1");
  expect(first?.ok).toBe(true); expect(f.children[0].config.provider.id).toBe("parent-provider");
  expect((await f.manager.execute("Task", { agent: "reviewer", task: "Write", ownership: { access: "write", paths: ["b"] } }, "t2"))?.ok).toBe(false);
  await f.manager.stopAll();
});
it("keeps idle parent work open until reports can be delivered and delivers each once", async () => {
  const f = await fixture(); await f.manager.execute("Task", { agent: "reviewer", task: "Review" }, "task");
  let delivered = false;
  const waiting = f.manager.beforeComplete(new AbortController().signal).then(report => { delivered = true; return report; });
  await new Promise(resolve => setTimeout(resolve, 10)); expect(delivered).toBe(false);
  f.children[0].finish(); expect(await waiting).toContain("Child report");
  expect(await f.manager.beforeComplete(new AbortController().signal)).toBeUndefined();
});
it("stops children and preserves partial reports without resuming the parent", async () => {
  const f = await fixture(); await f.manager.execute("Task", { agent: "reviewer", task: "Review" }, "task");
  const controller = new AbortController(); const pending = f.manager.beforeComplete(controller.signal);
  controller.abort(); f.setCurrent(); await f.manager.stopAll(); expect(await pending).toBeUndefined();
  const list = await f.manager.execute("TaskWait", { delegationIds: [f.children[0].config.sessionId.split(":").at(-1)] }, "list");
  expect((list?.content as any).delegations[0]).toMatchObject({ status: "stopped", report: "Partial result" });
});
it("reconstructs unresolved records as interrupted without launching or replaying tools", async () => {
  const f = await fixture(); await f.manager.execute("Task", { agent: "reviewer", task: "Review" }, "task");
  const restored = new CodexSubagents(f.options); const result = await restored.execute("TaskList", {}, "list");
  expect((result?.content as any).delegations[0]).toMatchObject({ status: "aborted", error: expect.stringContaining("no tools replayed") });
  expect(f.children).toHaveLength(1); await f.manager.stopAll();
});
