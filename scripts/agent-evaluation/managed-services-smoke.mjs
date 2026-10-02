import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtemp, writeFile } from "node:fs/promises";
import { createServer, connect } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { runPreviewServer } from "../../apps/desktop/electron/main/preview-server.ts";
import { JsonRpcProcess } from "./process.mjs";

// Focused production-runner check; no model, provider credentials or app profile.
const binary = resolve(process.argv[2] ?? "target/debug/pi-desktop-host-core.exe");
const directory = await mkdtemp(join(tmpdir(), "nexus-managed-smoke-"));
const serverFile = join(directory, "server.mjs");
await writeFile(serverFile, "import {createServer} from 'node:http'; createServer((req,res)=>res.end('managed-preview')).listen(Number(process.argv[2]),'127.0.0.1',()=>console.log('ready'));\n");
const reservation = createServer();
await new Promise(resolveListen => reservation.listen(0, "127.0.0.1", resolveListen));
const port = reservation.address().port;
await new Promise(resolveClose => reservation.close(resolveClose));
const url = `http://127.0.0.1:${port}/`;
const rpc = new JsonRpcProcess(binary, [], { env: { ...process.env, PI_DESKTOP_DATA_DIR: join(directory, "profile") } }, () => {});
const send = rpc.send.bind(rpc);
rpc.send = message => send({ jsonrpc: "2.0", ...message });
const host = { call: (method, params, timeout) => rpc.request(method, params, timeout) };
const reachable = () => new Promise(resolveReachable => {
  const socket = connect(port, "127.0.0.1");
  const finish = value => { socket.destroy(); resolveReachable(value); };
  socket.once("connect", () => finish(true));
  socket.once("error", () => finish(false));
  socket.setTimeout(1000, () => finish(false));
});
try {
  await host.call("app.handshake", { protocolVersion: 11 });
  const { session } = await host.call("session.create", { title: "Managed smoke", mode: "agent", projectPath: directory });
  await host.call("session.configure", { id: session.id, mode: "agent", permissionMode: "auto" });
  const { effective: shell } = await host.call("commandShells.list", {});
  assert.ok(shell);
  const quote = value => shell.dialect === "powershell"
    ? "'" + value.replaceAll("'", "''") + "'"
    : shell.dialect === "cmd" ? '"' + value.replaceAll('"', '""') + '"'
    : "'" + value.replaceAll("'", "'\\''") + "'";
  const command = `${shell.dialect === "powershell" ? "& " : ""}${quote(process.execPath)} ${quote(serverFile)} ${port}`;
  const input = (args, mode = "agent") => ({ sessionId: session.id, turnId: "smoke", toolCallId: "smoke-" + crypto.randomUUID(), mode, args });
  const started = await runPreviewServer(host, input({ operation: "start", command, url, waitMs: 10000 }), shell);
  assert.equal(started.ok, true, JSON.stringify(started));
  assert.equal(started.content.ready, true, JSON.stringify(started));
  const id = started.content.process.id;
  assert.equal(await (await fetch(url)).text(), "managed-preview");
  const later = await runPreviewServer(host, input({ operation: "status", id, waitMs: 0 }, "plan"), shell);
  assert.equal(later.content.process.id, id);
  assert.equal(later.content.ready, true);
  assert.ok(later.content.output.some(chunk => chunk.text.includes("ready")));
  const collision = await runPreviewServer(host, input({ operation: "start", command, url }), shell);
  assert.equal(collision.errorCode, "PREVIEW_PORT_IN_USE");
  const stopped = await runPreviewServer(host, input({ operation: "stop", id }), shell);
  assert.equal(stopped.content.process.status, "stopped");
  assert.equal(await reachable(), false);
  const again = await runPreviewServer(host, input({ operation: "start", command, url, waitMs: 10000 }), shell);
  assert.equal(again.content.ready, true);
  await host.call("process.stopSession", { sessionId: session.id });
  assert.equal(await reachable(), false);
  const last = await runPreviewServer(host, input({ operation: "start", command, url, waitMs: 10000 }), shell);
  assert.equal(last.content.ready, true);
  const exited = once(rpc.child, "exit");
  rpc.child.stdin.end();
  let timer;
  try {
    await Promise.race([exited, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("HOST_SHUTDOWN_TIMEOUT")), 10000); })]);
  } finally { clearTimeout(timer); }
  assert.equal(rpc.child.exitCode, 0, rpc.stderr);
  assert.equal(await reachable(), false);
  console.log(JSON.stringify({ passed: true, directory, checks: ["production runner", "HTTP readiness", "later-turn inspection", "occupied port refusal", "stop releases port", "session stop", "graceful shutdown"] }, null, 2));
} finally {
  await rpc.close();
}
