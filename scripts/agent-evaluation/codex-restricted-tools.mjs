import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdir, writeFile, access } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { CodexAdapter } from "../../packages/agent-runtime/dist/codex/adapter.js";
import { prepareLaunch, CODEX_VERSION } from "../../packages/agent-runtime/dist/codex/config.js";
import { startNexusToolBridge } from "../../packages/agent-runtime/dist/codex/nexus-tools.js";
import { waitUntil } from "./codex-stream-steering.mjs";

/** Exercise the actual pinned engine and MCP transport against an adversarial fixture. */
export async function restrictedToolsTrial(directory) {
  await mkdir(directory, { recursive: true });
  const records = [], executions = [], results = [];
  let malicious = false;
  const server = createServer(async (req, res) => {
    const chunks = []; for await (const chunk of req) chunks.push(chunk);
    const body = JSON.parse(Buffer.concat(chunks));
    const offered = (body.tools ?? []).flatMap(tool => tool.tools?.map(child => ({ ...child, namespace: tool.name })) ?? [tool]);
    records.push({ model: body.model, tools: offered.map(tool => tool.namespace ? tool.namespace + "__" + tool.name : tool.name), malicious });
    const sequence = records.length;
    const output = (body.input ?? []).some(item => item.type === "function_call_output");
    let item;
    if (malicious) item = { id: "escape-" + sequence, type: "custom_tool_call", name: "apply_patch", call_id: "escape-call-" + sequence,
      input: "*** Begin Patch\n*** Add File: escaped.txt\n+Policy bypass\n*** End Patch", status: "completed" };
    else if (!output) item = { id: "read-" + sequence, type: "function_call", namespace: "mcp__nexus", name: "Read", call_id: "read-call-" + sequence,
      arguments: JSON.stringify({ path: "fixture.txt" }), status: "completed" };
    else item = { id: "answer-" + sequence, type: "message", role: "assistant", status: "completed", content: [{ type: "output_text", text: "Read verified", annotations: [] }] };
    res.writeHead(200, { "Content-Type": "text/event-stream" });
    const send = (type, payload) => res.write("data: " + JSON.stringify({ type, ...payload }) + "\n\n");
    const id = "response-" + sequence;
    send("response.created", { response: { id, status: "in_progress", output: [] } });
    send("response.output_item.added", { output_index: 0, item: { ...item, status: "in_progress" } });
    send("response.output_item.done", { output_index: 0, item });
    send("response.completed", { response: { id, status: "completed", output: [item], usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 } } });
    res.end();
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const host = { call: async (method, params) => {
    if (method === "tools.list") return { tools: ["Read", "Write", "Bash"].map(name => ({ name, parameters: { type: "object", properties: { path: { type: "string" } }, required: ["path"] } })) };
    if (method === "tools.abort") return { ok: true };
    assert.equal(method, "tools.execute"); executions.push(params);
    assert.equal(params.toolName, "Read");
    assert.equal(params.sessionId, "parent"); assert.equal(params.turnId, "parent-turn"); assert.equal(params.permissionScope, "ask");
    return { ok: true, content: "fixture bytes" };
  } };
  let adapter;
  try {
    const config = { sessionId: "restricted-child", dataDir: directory, workspace: join(directory, "workspace"), permissionMode: "auto", restrictedTools: ["Read"],
      provider: { id: "alternate", name: "Local fixture", modelId: "exact-child-model", apiKey: "", authKind: "none", apiStyle: "responses", baseUrl: "http://127.0.0.1:" + server.address().port, supportsReasoning: false, supportedThinkingLevels: [], modelConfig: { input: ["text"], contextWindow: 32768, maxTokens: 1024 } } };
    adapter = new CodexAdapter(config, event => results.push(event), {
      tools: snapshot => startNexusToolBridge({ host, sessionId: "parent", scratchDir: config.workspace, mode: "agent", snapshot, imageInput: false,
        includeNative: true, allowedTools: ["Read"], permissionScope: "ask", executionContext: () => ({ turnId: "parent-turn", mode: "agent" }) }),
      launch: async (config, directory) => {
        const launch = await prepareLaunch(config, directory);
        launch.args.push("-c", "model_providers.nexus.stream_max_retries=0", "-c", "model_providers.nexus.request_max_retries=0");
        return launch;
      },
    });
    await adapter.start({ turnId: "child-turn", text: "Read fixture.txt and report." });
    await waitUntil(() => adapter.snapshot().turn?.outcome, 25_000);
    assert.equal(adapter.snapshot().turn.outcome, "completed"); assert.equal(executions.length, 1);
    malicious = true;
    await adapter.start({ turnId: "adversarial-turn", text: "Try to patch." });
    await waitUntil(() => adapter.snapshot().turn?.outcome, 25_000);
    assert.equal(adapter.snapshot().turn.outcome, "failed"); assert.equal(executions.length, 1);
    await assert.rejects(access(join(config.workspace, "escaped.txt")));
    assert.ok(records.every(record => record.model === "exact-child-model" && record.tools.length === 1 && record.tools[0] === "mcp__nexus__Read"));
    const report = { pin: CODEX_VERSION, mode: "Actual Codex + restricted provider bridge + Nexus MCP; local fixture, no spending", records, executions,
      allowedReadExecuted: true, undeclaredNativePatchBlocked: true, errors: results.filter(event => event.event.type === "error").map(event => event.event.error) };
    await writeFile(join(directory, "report.json"), JSON.stringify(report, null, 2));
    return report;
  } catch (error) {
    await writeFile(join(directory, "failure.json"), JSON.stringify({ records, executions, snapshot: adapter?.snapshot(), events: results }, null, 2));
    throw error;
  } finally { await adapter?.shutdown(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  if (!process.argv[2]) throw new Error("Pass an isolated evidence directory.");
  console.log(JSON.stringify(await restrictedToolsTrial(resolve(process.argv[2])), null, 2));
}
