import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { CodexController } from "../../packages/agent-runtime/dist/codex/controller.js";
import { CODEX_VERSION } from "../../packages/agent-runtime/dist/codex/config.js";
import { waitUntil } from "./codex-stream-steering.mjs";

export async function configuredDelegationTrial(directory) {
  await mkdir(directory, { recursive: true });
  const records = [], executions = [], events = [];
  let fixtureFailure;
  const server = createServer(async (req, res) => {
    try {
      const chunks = []; for await (const chunk of req) chunks.push(chunk);
      const body = JSON.parse(Buffer.concat(chunks));
      assert(JSON.stringify(body.input).includes("You are Nexus, the assistant inside the Nexus desktop app"), "Parent and child receive Nexus identity");
      const child = req.url.startsWith("/child/");
      const offered = (body.tools ?? []).flatMap(tool => tool.tools?.map(item => ({ ...item, namespace: tool.name })) ?? [tool]);
      records.push({ route: req.url, child, model: body.model, tools: offered.map(tool => tool.namespace ? tool.namespace + "__" + tool.name : tool.name) });
      const sequence = records.length;
      const hasToolResult = (body.input ?? []).some(item => item.type === "function_call_output");
      const hasReport = JSON.stringify(body.input).includes("Your configured subagents have settled.");
      let item;
      if (!hasToolResult) {
        const tool = offered.find(tool => tool.name === (child ? "Read" : "Task"));
        assert.ok(tool, "required tool is offered");
        item = { id: "item-" + sequence, type: "function_call", name: tool.name, ...(tool.namespace ? { namespace: tool.namespace } : {}), call_id: "call-" + sequence,
          arguments: JSON.stringify(child ? { path: "fixture.txt" } : { agent: "reviewer", task: "Read fixture.txt and report", ownership: { access: "read", paths: ["fixture.txt"] } }), status: "completed" };
      } else {
        if (child) await new Promise(resolve => setTimeout(resolve, 250));
        item = { id: "item-" + sequence, type: "message", role: "assistant", status: "completed", content: [{ type: "output_text", text: child ? "Verified child report" : hasReport ? "Integrated child report" : "Independent parent work done", annotations: [] }] };
      }
      res.writeHead(200, { "Content-Type": "text/event-stream" });
      const send = (type, payload) => res.write("data: " + JSON.stringify({ type, ...payload }) + "\n\n");
      const id = "response-" + sequence;
      send("response.created", { response: { id, status: "in_progress", output: [] } });
      send("response.output_item.added", { output_index: 0, item: { ...item, status: "in_progress" } });
      send("response.output_item.done", { output_index: 0, item });
      send("response.completed", { response: { id, status: "completed", output: [item], usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 } } }); res.end();
    } catch (error) { fixtureFailure = error; res.writeHead(500).end(); }
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const base = "http://127.0.0.1:" + server.address().port;
  const host = { call: async (method, params) => {
    if (method === "tools.list") return { tools: [{ name: "Read", parameters: { type: "object", properties: { path: { type: "string" } }, required: ["path"] } }] };
    if (method === "tools.abort") return { ok: true };
    assert.equal(method, "tools.execute"); executions.push(params);
    assert.equal(params.sessionId, "parent"); assert.equal(params.turnId, "parent-turn"); assert.equal(params.permissionScope, "ask");
    return { ok: true, content: "Fixture bytes" };
  } };
  const oldProfile = process.env.PI_DESKTOP_DATA_DIR;
  process.env.PI_DESKTOP_DATA_DIR = directory;
  const controller = new CodexController(event => events.push(event), host); controller.configure(directory);
  try {
    const provider = { id: "fixture-parent", name: "Local fixture", modelId: "parent-model", authKind: "none", apiStyle: "responses", baseUrl: base + "/parent/v1", supportsReasoning: false, supportedThinkingLevels: [], modelConfig: { input: ["text"], contextWindow: 32768, maxTokens: 1024 } };
    await controller.handle("agent.prompt", { sessionId: "parent", turnId: "parent-turn", mode: "agent", permissionMode: "auto", provider, scratchDir: join(directory, "workspace"), content: "Delegate one review, keep working, and integrate the report.",
      subagents: [{ name: "reviewer", description: "Review", tools: ["Read"], prompt: "Read only", source: "user", permission: "ask", model: { providerId: "fixture-child", modelId: "pinned-child-model" } }],
      subagentProviders: { "fixture-child/pinned-child-model": { ...provider, id: "fixture-child", modelId: "pinned-child-model", baseUrl: base + "/child/v1" } },
    });
    await waitUntil(() => fixtureFailure || events.some(event => !event.parentToolCallId && event.event.type === "agent_end"), 25_000);
    if (fixtureFailure) throw fixtureFailure;
    const status = await controller.handle("agent.getStatus", { sessionId: "parent" });
    assert.equal(status.status.isRunning, false);
    assert.equal(events.filter(event => !event.parentToolCallId && event.event.type === "agent_end").length, 1);
    assert.equal(executions.length, 1);
    assert.ok(records.filter(record => record.child).every(record => record.model === "pinned-child-model" && record.tools.join() === "mcp__nexus__Read"));
    assert.ok(records.some(record => record.child), "child must execute on alternate provider route");
    assert.ok(events.some(event => event.parentToolCallId && event.agentName === "reviewer" && event.sessionId === "parent" && event.turnId === "parent-turn"));
    assert.ok(events.some(event => event.event.type === "message_end" && event.event.message.content === "Integrated child report"));
    assert.equal(status.status.execution.turn.nativeSegments.length, 1);
    const { snapshot } = await controller.handle("agent.engineSnapshot", { sessionId: "parent" });
    const task = snapshot.items.find(item => item.label === "Task");
    assert.equal(task.result.details.status, "completed");
    assert.equal(task.result.details.modelId, "pinned-child-model");
    assert.ok(events.some(event => event.event.type === "tool_end" && event.event.toolName === "Task" && event.event.startedAt === task.startedAt && event.event.result?.details?.status === "completed"));
    assert.ok(records.filter(record => !record.child).every(record => !record.tools.some(name => name?.includes("spawn_agent"))), "native delegation must be disabled");
    const report = { pin: CODEX_VERSION, mode: "Real parent/child Codex processes + Nexus controller/MCP; local fixtures, no spending", records, executions,
      rootTerminalCount: 1, originalHostTurnRetained: true, alternateProviderHonored: true, childEventsAttributed: true, finalTaskMetadata: task.result.details, nativeSegments: status.status.execution.turn.nativeSegments };
    await writeFile(join(directory, "report.json"), JSON.stringify(report, null, 2)); return report;
  } catch (error) {
    await writeFile(join(directory, "failure.json"), JSON.stringify({ records, executions, events }, null, 2)); throw error;
  } finally {
    await controller.shutdown(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
    if (oldProfile === undefined) delete process.env.PI_DESKTOP_DATA_DIR; else process.env.PI_DESKTOP_DATA_DIR = oldProfile;
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  if (!process.argv[2]) throw new Error("Pass an isolated evidence directory.");
  console.log(JSON.stringify(await configuredDelegationTrial(resolve(process.argv[2])), null, 2));
}
