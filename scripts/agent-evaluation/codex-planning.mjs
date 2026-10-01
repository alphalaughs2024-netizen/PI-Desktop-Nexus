import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { CodexController } from "../../packages/agent-runtime/dist/codex/controller.js";
import { CODEX_VERSION } from "../../packages/agent-runtime/dist/codex/config.js";
import { JsonRpcProcess } from "./process.mjs";
async function waitUntil(predicate, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) { if (await predicate()) return; await new Promise(resolve => setTimeout(resolve, 25)); }
  throw new Error("PLANNING_TRIAL_TIMEOUT");
}

/** Actual Windows Codex and Rust artifacts; deterministic local provider, no spending. */
export async function planningTrial(directory, hostBinary) {
  await mkdir(directory, { recursive: true });
  const events = [], records = [], hostCalls = [], trials = [];
  const stages = { plan: "enter", goal: "enter" };
  let failure, controller;
  const server = createServer(async (req, res) => {
    try {
      const chunks = []; for await (const chunk of req) chunks.push(chunk);
      const body = JSON.parse(Buffer.concat(chunks));
      const kind = req.url.startsWith("/goal/") ? "goal" : "plan";
      const tools = (body.tools ?? []).flatMap(tool => tool.tools?.map(child => ({ ...child, namespace: tool.name })) ?? [tool]);
      const stage = stages[kind];
      records.push({ kind, stage, model: body.model, tools: tools.map(tool => tool.namespace ? tool.namespace + "__" + tool.name : tool.name) });
      let item;
      const text = "# " + kind + "\r\n\r\nVerify the fixture without changing it.\n";
      const names = { enter: kind === "plan" ? "EnterPlanMode" : "EnterGoalMode", ask: "asktool", submit: kind === "plan" ? "SubmitPlan" : "SubmitGoal" };
      if (stage === "approved") {
        assert.ok(JSON.stringify(body.input).includes(`<approved-${kind}-markdown>`));
        assert.ok(tools.some(tool => tool.name === "apply_patch"));
        item = { type: "message", role: "assistant", content: [{ type: "output_text", text: "Approved fixture verified", annotations: [] }] };
      } else {
        const tool = tools.find(tool => tool.name === names[stage]); assert.ok(tool, "required " + names[stage]);
        if (stage !== "enter") assert.ok(!tools.some(tool => ["apply_patch", "exec_command", "Write", "Edit", "Task"].includes(tool.name)));
        const args = stage === "enter" ? {} : stage === "ask" ? { questions: [{ question: "Proceed with inspection?", options: ["Yes", "No"] }] } : { title: "Fixture " + kind, markdown: text, question: "Approve fixture?" };
        item = { type: "function_call", name: tool.name, namespace: tool.namespace, call_id: "call-" + records.length, arguments: JSON.stringify(args) };
        stages[kind] = stage === "enter" ? "ask" : stage === "ask" ? "submit" : "pending";
      }
      item = { ...item, id: "item-" + records.length, status: "completed" };
      res.writeHead(200, { "Content-Type": "text/event-stream" });
      const send = (type, data) => res.write("data: " + JSON.stringify({ type, ...data }) + "\n\n");
      const id = "response-" + records.length;
      send("response.created", { response: { id, status: "in_progress", output: [] } });
      send("response.output_item.added", { output_index: 0, item: { ...item, status: "in_progress" } });
      send("response.output_item.done", { output_index: 0, item });
      send("response.completed", { response: { id, status: "completed", output: [item], usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 } } }); res.end();
    } catch (error) { failure = error; res.writeHead(500).end(); }
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const oldProfile = process.env.PI_DESKTOP_DATA_DIR;
  process.env.PI_DESKTOP_DATA_DIR = directory;
  const rpc = new JsonRpcProcess(hostBinary, [], { env: { ...process.env, PI_DESKTOP_DATA_DIR: join(directory, "host") } }, () => {});
  const send = rpc.send.bind(rpc); rpc.send = message => send({ jsonrpc: "2.0", ...message });
  const host = { call: async (method, params, timeout) => { hostCalls.push({method, params}); return rpc.request(method, params, timeout); } };
  controller = new CodexController(event => {
    events.push(event);
    if (event.event.type === "asktool_request") void controller.handle("asktool.resolve", { sessionId: event.sessionId,
      requestId: event.event.request.requestId, answers: [["Yes"]] }).catch(error => { failure = error; });
  }, host);
  controller.configure(directory);
  try {
    await host.call("app.handshake", { protocolVersion: 11 });
    for (const kind of ["plan", "goal"]) {
      const workspace = join(directory, kind); await mkdir(workspace, { recursive: true });
      const { session } = await host.call("session.create", { title:"Fixture " + kind, mode:"agent", projectPath:workspace });
      await host.call("session.configure", { id:session.id, mode:"agent", permissionMode:"auto" });
      const { turnId } = await host.call("session.beginTurn", { sessionId:session.id });
      const provider = { id:"fixture", name:"Local fixture", modelId:"fixture-"+kind, authKind:"none", apiStyle:"responses",
        baseUrl:"http://127.0.0.1:"+server.address().port+"/"+kind+"/v1", supportsReasoning:false, supportedThinkingLevels:[], modelConfig:{input:["text"], contextWindow:32768, maxTokens:1024} };
      const params = { sessionId:session.id, turnId, mode:"agent", permissionMode:"auto", provider, projectPath:workspace, scratchDir:workspace, content:"Enter " + kind + " mode, ask then submit." };
      await controller.handle("agent.prompt", params);
      await waitUntil(async () => failure || (await controller.handle("agent.getStatus", {sessionId:session.id})).status.execution?.turn?.outcome, 45_000);
      if (failure) throw failure;
      const snapshot = (await controller.handle("agent.engineSnapshot", {sessionId:session.id})).snapshot;
      assert.equal(snapshot.turn.outcome, "completed"); assert.equal(snapshot.turn.id, turnId);
      assert.equal(snapshot.turn.nativeSegments.length, 2);
      const pending = await host.call("plans.pending", {sessionId:session.id});
      assert.equal(pending.state, "awaiting_approval"); assert.equal(pending.plans.length, 1);
      const proposal = pending.plans[0];
      const bytes = await readFile(join(workspace, proposal.artifact.relativePath), "utf8");
      assert.equal(bytes, proposal.markdown);
      assert.equal(stages[kind], "pending");
      await host.call("session.endTurn", {turnId, status:"completed", createNotification:false});
      const resolution = await host.call("plans.resolve", {proposalId:proposal.id, sessionId:session.id, turnId:proposal.turnId,
        toolCallId:proposal.toolCallId, version:proposal.version, action:"approve", targetPermissionMode:"auto"});
      const { execution } = await host.call("plans.claimExecution", {executionId:resolution.execution.id});
      const second = await host.call("session.beginTurn", {sessionId:session.id});
      stages[kind] = "approved";
      await controller.handle("agent.executeApprovedPlan", {...params, turnId:second.turnId, execution});
      await waitUntil(async () => failure || (await controller.handle("agent.getStatus", {sessionId:session.id})).status.execution?.turn?.outcome, 30_000);
      if (failure) throw failure;
      const final = (await controller.handle("agent.engineSnapshot", {sessionId:session.id})).snapshot;
      assert.equal(final.turn.outcome, "completed"); assert.equal(final.session.nativeHandle, snapshot.session.nativeHandle);
      assert.equal(events.filter(event => event.sessionId === session.id && event.turnId === turnId && event.event.type === "agent_end").length, 1);
      assert.equal(events.filter(event => event.sessionId === session.id && event.turnId === second.turnId && event.event.type === "agent_end").length, 1);
      await host.call("session.endTurn", {turnId:second.turnId, status:"completed", createNotification:false});
      await host.call("plans.finishExecution", {executionId:execution.id, status:"completed"});
      trials.push({kind, exactArtifact:true, pendingUntilExplicitApproval:true, nativeToolsRestored:true, sameNativeHandle:true, oneTerminalPerTurn:true});
    }
    const report = {pin:CODEX_VERSION, trials, records, hostCalls:hostCalls.map(call => call.method)};
    await writeFile(join(directory, "report.json"), JSON.stringify(report, null, 2)); return report;
  } catch (error) {
    await writeFile(join(directory, "failure.json"), JSON.stringify({error:String(error), records, events, hostCalls}, null, 2)); throw error;
  } finally {
    await controller.shutdown(); await rpc.close();
    server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
    if (oldProfile === undefined) delete process.env.PI_DESKTOP_DATA_DIR; else process.env.PI_DESKTOP_DATA_DIR = oldProfile;
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  if (!process.argv[2] || !process.argv[3]) throw new Error("Pass an isolated evidence directory and explicit compatible host binary.");
  const report = await planningTrial(resolve(process.argv[2]), resolve(process.argv[3])); console.log(JSON.stringify({pin:report.pin, trials:report.trials}, null, 2));
}
