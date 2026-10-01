import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { prepareLaunch, CODEX_VERSION } from "../../packages/agent-runtime/dist/codex/config.js";
import { JsonRpcProcess } from "./process.mjs";
import { waitUntil } from "./codex-stream-steering.mjs";

/** Probe the pinned native role contract with a local Responses fixture, no API keys. */
export async function nativeDelegationTrial(directory) {
  await mkdir(directory, { recursive: true });
  const records = []; const events = [];
  let fixtureFailure;
  const server = createServer(async (req, res) => {
    try {
      if (req.method !== "POST" || !req.url?.endsWith("/responses")) { res.writeHead(404).end(); return; }
      const chunks = []; for await (const chunk of req) chunks.push(chunk);
      const body = JSON.parse(Buffer.concat(chunks));
      const offered = (body.tools ?? []).flatMap(tool => tool.tools?.map(child => ({ ...child, namespace: tool.name })) ?? [tool]);
      const child = body.model === "nexus-role-child";
      records.push({ route: req.url, model: body.model, child, tools: offered.map(tool => tool.name), roleInstructions: JSON.stringify(body.input).includes("NEXUS_ROLE_MARKER") });
      const sequence = records.length;
      const outputs = (body.input ?? []).filter(item => item.type === "function_call_output");
      let item;
      if (!child && !outputs.length) {
        const spawn = offered.find(tool => tool.name?.endsWith("spawn_agent"));
        assert.ok(spawn, "native spawn tool is offered");
        item = { id: "item-" + sequence, type: "function_call", call_id: "call-" + sequence,
          name: spawn.name, ...(spawn.namespace ? { namespace: spawn.namespace } : {}),
          arguments: JSON.stringify({ agent_type: "nexus_review", message: "Report NEXUS_ROLE_MARKER. Do not change files." }), status: "completed" };
      } else {
        if (!child) await waitUntil(() => records.some(record => record.child), 10_000).catch(() => undefined);
        item = { id: "item-" + sequence, type: "message", role: "assistant", status: "completed", content: [{ type: "output_text", text: child ? "Child report" : "Parent report", annotations: [] }] };
      }
      res.writeHead(200, { "Content-Type": "text/event-stream" });
      const send = (type, payload) => res.write("event: " + type + "\ndata: " + JSON.stringify({ type, ...payload }) + "\n\n");
      const id = "response-" + sequence;
      send("response.created", { response: { id, object: "response", status: "in_progress", output: [] } });
      send("response.output_item.added", { output_index: 0, item: { ...item, status: "in_progress" } });
      send("response.output_item.done", { output_index: 0, item });
      send("response.completed", { response: { id, object: "response", status: "completed", output: [item], usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 } } });
      res.end();
    } catch (error) { fixtureFailure = error; res.writeHead(500).end(); }
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const base = "http://127.0.0.1:" + server.address().port;
  let rpc;
  try {
    const config = { sessionId: "role-probe", dataDir: directory, workspace: join(directory, "workspace"), permissionMode: "auto",
      provider: { id: "fixture", name: "Local fixture", modelId: "nexus-role-parent", apiKey: "", authKind: "none", apiStyle: "responses", baseUrl: base + "/parent/v1", supportsReasoning: false, supportedThinkingLevels: [], modelConfig: { input: ["text"], contextWindow: 32768, maxTokens: 1024 } } };
    await mkdir(config.workspace, { recursive: true });
    const launch = await prepareLaunch(config, directory);
    const catalogPath = join(directory, "model-catalog.json");
    const catalog = JSON.parse(await readFile(catalogPath, "utf8"));
    catalog.models[0].multi_agent_version = "v1";
    catalog.models.push({ ...catalog.models[0], slug: "nexus-role-child", display_name: "Child fixture" });
    await writeFile(catalogPath, JSON.stringify(catalog));
    const rolePath = join(directory, "reviewer.toml");
    await writeFile(rolePath, 'model = "nexus-role-child"\nmodel_provider = "alternate"\nsandbox_mode = "read-only"\ndeveloper_instructions = "NEXUS_ROLE_MARKER: Read-only reviewer; use only file reading and search."\n[features]\nshell_tool = false\n');
    const setting = (key, value) => ["-c", key + "=" + JSON.stringify(value)];
    launch.args.push(...setting("features.multi_agent", true),
      ...setting("agents.nexus_review.description", "Nexus reviewer fixture"), ...setting("agents.nexus_review.config_file", rolePath.replaceAll("\\", "/")),
      ...setting("model_providers.alternate.name", "Alternate fixture"), ...setting("model_providers.alternate.base_url", base + "/alternate/v1"),
      ...setting("model_providers.alternate.wire_api", "responses"), ...setting("model_providers.alternate.requires_openai_auth", false));
    rpc = new JsonRpcProcess(launch.command, launch.args, { cwd: launch.cwd, env: launch.env }, event => events.push(event));
    await rpc.request("initialize", { clientInfo: { name: "nexus-role-probe", version: "1" }, capabilities: { experimentalApi: true } });
    rpc.send({ method: "initialized" });
    const { thread } = await rpc.request("thread/start", { model: config.provider.modelId, modelProvider: "nexus", cwd: config.workspace, approvalPolicy: "never", sandbox: "workspace-write", experimentalRawEvents: true });
    await rpc.request("turn/start", { threadId: thread.id, input: [{ type: "text", text: "Delegate one read-only review to nexus_review." }] });
    await waitUntil(() => fixtureFailure || events.some(event => event.method === "turn/completed" && event.params.threadId === thread.id), 25_000);
    if (fixtureFailure) throw fixtureFailure;
    const report = { pin: CODEX_VERSION, mode: "native Codex, local Responses fixture; no cloud spending", records,
      childObserved: records.some(record => record.child),
      requestedAlternateProviderHonored: records.some(record => record.child && record.route.startsWith("/alternate/")),
      eventMethods: [...new Set(events.map(event => event.method))],
      delegationItems: events.filter(event => event.params?.item?.type?.includes("collab")).map(event => ({ method: event.method, item: event.params.item })),
      errors: events.filter(event => event.method === "error").map(event => event.params) };
    await writeFile(join(directory, "report.json"), JSON.stringify(report, null, 2));
    assert.ok(report.childObserved, "native role starts its pinned model");
    return report;
  } finally { await rpc?.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  if (!process.argv[2]) throw new Error("Pass an isolated evidence directory.");
  console.log(JSON.stringify(await nativeDelegationTrial(resolve(process.argv[2])), null, 2));
}
