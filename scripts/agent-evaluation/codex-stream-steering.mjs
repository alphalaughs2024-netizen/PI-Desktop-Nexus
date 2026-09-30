import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";
import { CodexAdapter } from "../../packages/agent-runtime/dist/codex/adapter.js";

/** Real Responses streaming fixture; Codex owns turn interruption, not this server. */
export async function steeringFixture() {
  const records = [];
  const server = createServer(async (request, response) => {
    if (request.method !== "POST" || !request.url?.endsWith("/responses")) { response.writeHead(404).end(); return; }
    const chunks = []; for await (const chunk of request) chunks.push(chunk);
    const body = JSON.parse(Buffer.concat(chunks).toString());
    const corrected = JSON.stringify(body.input).includes("Reply exactly EMERALD");
    const record = { corrected, input: body.input, startedAt: Date.now(), deltas: 0, completed: false, closedAt: undefined };
    records.push(record);
    response.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" });
    const id = "fixture-response-" + records.length;
    const itemId = "fixture-message-" + records.length;
    const send = (type, payload) => response.write("event: " + type + "\ndata: " + JSON.stringify({ type, ...payload }) + "\n\n");
    send("response.created", { response: { id, object: "response", status: "in_progress", output: [] } });
    send("response.output_item.added", { output_index: 0, item: { id: itemId, type: "message", role: "assistant", status: "in_progress", content: [] } });
    send("response.content_part.added", { item_id: itemId, output_index: 0, content_index: 0, part: { type: "output_text", text: "", annotations: [] } });
    let text = ""; const max = corrected ? 2 : 300;
    const timer = setInterval(() => {
      const delta = corrected ? (record.deltas === 0 ? "EMER" : "ALD") : "original-stream-" + record.deltas + " ";
      text += delta; record.deltas++;
      send("response.output_text.delta", { item_id: itemId, output_index: 0, content_index: 0, delta });
      if (record.deltas < max) return;
      clearInterval(timer);
      const item = { id: itemId, type: "message", role: "assistant", status: "completed", content: [{ type: "output_text", text, annotations: [] }] };
      send("response.output_text.done", { item_id: itemId, output_index: 0, content_index: 0, text });
      send("response.output_item.done", { output_index: 0, item });
      send("response.completed", { response: { id, object: "response", status: "completed", output: [item], usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 } } });
      record.completed = true; response.end();
    }, corrected ? 80 : 100);
    response.on("close", () => { clearInterval(timer); record.closedAt = Date.now(); });
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  return { records, url: "http://127.0.0.1:" + server.address().port + "/v1", close: async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); } };
}
export async function waitUntil(predicate, timeout = 15_000) {
  const deadline = Date.now() + timeout;
  while (!predicate()) { if (Date.now() > deadline) throw new Error("FIXTURE_WAIT_TIMEOUT"); await new Promise(resolve => setTimeout(resolve, 20)); }
}
export async function streamSteeringTrial(directory) {
  await mkdir(directory, { recursive: true }); const fixture = await steeringFixture();
  const events = []; let adapter; let recovered;
  try {
    const config = { sessionId: "stream-steering", dataDir: directory, workspace: join(directory, "workspace"), permissionMode: "auto", provider: { id: "fixture", name: "Local deterministic Responses fixture", modelId: "nexus-fixture", apiKey: "", authKind: "none", apiStyle: "responses", baseUrl: fixture.url, supportsReasoning: false, supportedThinkingLevels: [], modelConfig: { source: "generic", name: "fixture", baseUrl: "", reasoning: false, input: ["text", "image"], contextWindow: 32768, maxTokens: 8192 } } };
    adapter = new CodexAdapter(config, envelope => events.push(envelope));
    await adapter.start({ turnId: "host-turn", text: "Write a long original answer. Do not call tools." });
    await waitUntil(() => events.some(event => event.event.type === "message_update" && event.event.deltaText));
    const before = adapter.snapshot(); const steeredAt = Date.now();
    const outcome = await adapter.steer({ expectedTurnId: "host-turn", messageId: "stream-correction", text: "Reply exactly EMERALD. Do not call tools." });
    assert.equal(outcome.state, "accepted");
    await waitUntil(() => events.some(event => ["agent_end", "error"].includes(event.event.type)));
    const after = adapter.snapshot();
    assert.equal(after.turn.outcome, "completed");
    assert.equal(after.turn.id, before.turn.id); assert.equal(after.turn.runId, before.turn.runId); assert.equal(after.turn.startedAt, before.turn.startedAt);
    assert.notEqual(after.turn.nativeTurnId, before.turn.nativeTurnId);
    assert.equal(after.turn.nativeSegments.length, 1);
    assert.equal(after.items.find(item => item.status === "completed" && item.kind === "assistant")?.text, "EMERALD");
    assert.equal(events.filter(event => ["agent_end", "error"].includes(event.event.type)).length, 1);
    assert.equal(events.filter(event => event.event.type === "message_end" && event.event.message.id === "stream-correction").length, 1);
    await waitUntil(() => fixture.records[0].closedAt);
    assert.equal(fixture.records.length, 2); assert.equal(fixture.records[0].completed, false); assert.equal(fixture.records[1].completed, true);
    const old = before.items.find(item => item.kind === "assistant");
    const frozen = after.items.find(item => item.id === old.id);
    assert.equal(frozen.status, "interrupted");
    assert.equal(events.some(event => event.event.type === "tool_start"), false);
    await adapter.shutdown();
    const recoveryEvents = []; recovered = new CodexAdapter(config, event => recoveryEvents.push(event));
    const recovery = await recovered.recover(); assert.equal(recovery.turn.outcome, "completed"); assert.equal(recoveryEvents.length, 0);
    const report = { pin: after.session.version, mode: "deterministic native integration; no cloud requests", outcome, hostTurn: after.turn, stoppedOldStreamMs: fixture.records[0].closedAt - steeredAt, elapsedMs: after.turn.completedAt - after.turn.startedAt, partialText: frozen.text, finalText: "EMERALD", requests: fixture.records.map(({ input, ...record }) => record), acceptedInstructions: 1, terminalOutcomes: 1, recoveryReplayedEvents: recoveryEvents.length };
    await writeFile(join(directory, "report.json"), JSON.stringify(report, null, 2)); return report;
  } finally { await adapter?.shutdown(); await recovered?.shutdown(); await fixture.close(); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  if (!process.argv[2]) throw new Error("Pass an explicit isolated evidence directory.");
  console.log(JSON.stringify(await streamSteeringTrial(resolve(process.argv[2])), null, 2));
}
