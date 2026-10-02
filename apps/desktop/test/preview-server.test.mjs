import assert from "node:assert/strict";
import test from "node:test";
import { previewAddress, runPreviewServer } from "../electron/main/preview-server.ts";

const shell = { id: "bash", dialect: "posix" };
const input = (args, extra = {}) => ({ sessionId: "chat", toolCallId: "call", turnId: "turn", mode: "agent", args, ...extra });
function fixture(status = "running") {
  const calls = [];
  const host = { call: async (method, params) => {
    calls.push({ method, ...params });
    return { ok: true, content: { process: { id: "owned", status: params.toolName === "ProcessStop" ? "stopped" : status, previewUrl: "http://127.0.0.1:4123/" }, output: [], nextCursor: 0 } };
  } };
  return { calls, host };
}
const free = async () => false;

test("only loopback HTTP URLs are accepted, with localhost pinned to loopback", () => {
  for (const url of ["https://127.0.0.1:4123", "http://example.com:4123", "http://user:password@127.0.0.1:4123", "http://127.0.0.1", "file:///secret", "http://127.0.0.1:4123/#fragment"]) assert.throws(() => previewAddress(url));
  assert.equal(previewAddress("http://localhost:4123/").hostname, "127.0.0.1");
});

test("preview delegates launch to the host with exact shell and permission attribution", async () => {
  const f = fixture();
  const result = await runPreviewServer(f.host, input({ operation: "start", command: "npm run dev", cwd: "site", url: "http://localhost:4123/", waitMs: 0 }, { permissionScope: "ask" }), shell, async () => 200, free);
  const start = f.calls.find(call => call.toolName === "ProcessStart");
  assert.equal(start.sessionId, "chat");
  assert.equal(start.turnId, "turn");
  assert.equal(start.permissionScope, "ask");
  assert.equal(start.expectedCommandShellId, "bash");
  assert.deepEqual(start.args, { command: "npm run dev", cwd: "site", previewUrl: "http://127.0.0.1:4123/" });
  assert.equal(result.content.ready, true);
  assert.equal(result.content.process.id, "owned");
});

test("occupied port, host denial and Plan mode do not launch a preview", async () => {
  const f = fixture();
  const args = { operation: "start", command: "npm run dev", url: "http://127.0.0.1:4123/" };
  assert.equal((await runPreviewServer(f.host, input(args), shell, async () => 200, async () => true)).errorCode, "PREVIEW_PORT_IN_USE");
  assert.equal((await runPreviewServer(f.host, input(args, { mode: "plan" }), shell, async () => 200, free)).errorCode, "TOOL_DISABLED_IN_PLAN");
  assert.equal(f.calls.length, 0);
  const denied = { call: async () => ({ ok: false, denied: true, content: "denied" }) };
  assert.equal((await runPreviewServer(denied, input(args), shell, async () => { assert.fail("denied starts must not probe"); }, free)).ok, false);
});

test("a readiness timeout does not stop an owned process; a later turn can inspect it", async () => {
  const f = fixture();
  const first = await runPreviewServer(f.host, input({ operation: "start", command: "npm run dev", url: "http://127.0.0.1:4123/", waitMs: 0 }), shell, async () => undefined, free);
  assert.equal(first.ok, true);
  assert.equal(first.content.ready, false);
  assert.equal(f.calls.some(call => call.toolName === "ProcessStop"), false);
  const later = await runPreviewServer(f.host, input({ operation: "status", id: "owned", waitMs: 0 }, { turnId: "later", mode: "plan" }), shell, async () => 200, free);
  assert.equal(later.content.ready, true);
  assert.equal(f.calls.at(-1).turnId, "later");
});

test("an exited process cannot be reported ready even when the port responds", async () => {
  const f = fixture("failed");
  const result = await runPreviewServer(f.host, input({ operation: "status", id: "owned", waitMs: 0 }), shell, async () => 200, free);
  assert.equal(result.content.ready, false);
  assert.equal(result.errorCode, "PREVIEW_PROCESS_EXITED");
});

test("cancellation during launch cleans up the returned owned handle", async () => {
  const f = fixture();
  const controller = new AbortController();
  const call = f.host.call;
  f.host.call = async (method, params) => {
    const result = await call(method, params);
    if (params.toolName === "ProcessStart") controller.abort(new Error("cancelled"));
    return result;
  };
  await assert.rejects(runPreviewServer(f.host, input({ operation: "start", command: "npm run dev", url: "http://127.0.0.1:4123/" }, { signal: controller.signal }), shell, async () => 200, free), /cancelled/);
  assert.equal(f.calls.some(call => call.toolName === "ProcessStop" && call.args.id === "owned"), true);
  assert.equal(f.calls.some(call => call.method === "tools.abort" && call.toolCallId === "call:start"), true);
});

test("status cannot turn arbitrary process metadata into an external request", async () => {
  const host = { call: async () => ({ ok: true, content: { process: { id: "owned", status: "running", previewUrl: "http://example.com:4123/" } } }) };
  await assert.rejects(runPreviewServer(host, input({ operation: "status", id: "owned" }), shell, async () => { assert.fail("external requests are rejected before probing"); }, free), /PREVIEW_URL_INVALID/);
});
