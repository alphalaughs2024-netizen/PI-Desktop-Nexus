import { afterEach, expect, it } from "vitest";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { nexusToolCatalog, nexusToolContent, startNexusToolBridge, type NexusToolBridge } from "./nexus-tools.js";
const bridges: NexusToolBridge[] = []; const dirs: string[] = [];
afterEach(async () => { await Promise.all(bridges.splice(0).map(b => b.close())); await Promise.all(dirs.splice(0).map(d => rm(d, { recursive: true, force: true }))); });
const definition = (name: string) => ({ name, description: name, parameters: { type: "object", properties: {} } });
it("exposes host-owned services while excluding replaced native tools and untouched systems", () => {
 expect(nexusToolCatalog(["Read", "Write", "Edit", "Bash", "context_search", "browser_open", "Workflow", "plugin_example_action"].map(definition)).map(t => t.name)).toEqual(["browser_open", "Workflow", "plugin_example_action"]);
});
it("keeps the host definition authoritative when an extension repeats a reserved name", () => {
 const host = { ...definition("browser_open"), description: "host-owned" };
 expect(nexusToolCatalog([host, { ...host, description: "extension override" }])[0].description).toBe("host-owned");
});
it("requires private authentication and refuses browser origins, unknown tools and inactive turns", async () => {
 let active = false; let calls = 0;
 const host = { call: async <T>(method: string) => { if (method === "tools.list") return { tools: [definition("browser_open")] } as T; calls++; return { ok: true, content: "opened" } as T; } };
 const bridge = await startNexusToolBridge({ host, sessionId: "bound", scratchDir: tmpdir(), mode: "agent", imageInput: false, snapshot: () => ({ turn: active ? { id: "turn", runId: "run" } : undefined } as any) }); bridges.push(bridge);
 const request = (name: string, headers = {}) => fetch(bridge.url, { method: "POST", headers: { Authorization: "Bearer " + bridge.token, ...headers }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: {} } }) });
 expect((await fetch(bridge.url, { method: "POST" })).status).toBe(403);
 expect((await request("browser_open", { Origin: "https://untrusted.test" })).status).toBe(403);
 expect((await request("browser_open")).status).toBe(400);
 active = true; expect((await (await request("missing")).json()).error.code).toBe(-32602); expect(calls).toBe(0);
});
it("binds host identity and reuses an identical MCP request without duplicate mutation", async () => {
 const executions: any[] = [];
 const host = { call: async <T>(method: string, params?: any) => method === "tools.list" ? { tools: [definition("plugin_test_write")] } as T : (executions.push(params), { ok: true, content: "saved" } as T) };
 const bridge = await startNexusToolBridge({ host, sessionId: "bound-session", scratchDir: tmpdir(), mode: "agent", imageInput: false, snapshot: () => ({ turn: { id: "bound-turn", runId: "run" } } as any) }); bridges.push(bridge);
 const call = () => fetch(bridge.url, { method: "POST", headers: { Authorization: "Bearer " + bridge.token }, body: JSON.stringify({ jsonrpc: "2.0", id: 7, method: "tools/call", params: { name: "plugin_test_write", arguments: { sessionId: "forged" } } }) });
 await Promise.all([call(), call()]); expect(executions).toHaveLength(1); expect(executions[0]).toMatchObject({ sessionId: "bound-session", turnId: "bound-turn", mode: "agent" });
});
it("exposes only declared child tools and binds permission, shell and parent execution identity", async () => {
 const executions: any[] = [];
 const host = { call: async <T>(method: string, params?: any) => method === "tools.list" ? { tools: [definition("Read"), definition("Write"), definition("Bash")] } as T : (executions.push(params), { ok: true, content: "read" } as T) };
 const bridge = await startNexusToolBridge({ host, sessionId: "parent", scratchDir: tmpdir(), mode: "agent", imageInput: false, snapshot: () => ({ turn: { id: "child", runId: "run" } } as any),
  includeNative: true, allowedTools: ["Read"], permissionScope: "ask", commandShell: { id: "powershell", dialect: "powershell" }, executionContext: () => ({ turnId: "parent-turn", mode: "agent" }) }); bridges.push(bridge);
 const call = async (method: string, params?: any) => (await (await fetch(bridge.url, { method: "POST", headers: { Authorization: "Bearer " + bridge.token }, body: JSON.stringify({ jsonrpc: "2.0", id: method, method, params }) })).json()) as any;
 expect((await call("tools/list")).result.tools.map((tool: any) => tool.name)).toEqual(["Read"]);
 await call("tools/call", { name: "Read", arguments: { sessionId: "forged", permissionScope: "auto" } });
 expect(executions[0]).toMatchObject({ sessionId: "parent", turnId: "parent-turn", permissionScope: "ask", expectedCommandShellId: "powershell", expectedCommandShellDialect: "powershell" });
});
it("retains in-flight identity across completed-cache eviction and refuses expired replays", async () => {
 let finish!: (value: any) => void;
 let started!: () => void;
 const admitted = new Promise<void>(resolve => { started = resolve; });
 let mutations = 0;
 const host = { call: async <T>(method: string, params?: any): Promise<T> => {
  if (method === "tools.list") return { tools: [definition("plugin_test_write")] } as T;
  if (method === "tools.abort") { finish({ ok: false, content: "aborted" }); return {} as T; }
  if (params.args.pending) { mutations++; started(); return new Promise<T>(resolve => { finish = resolve; }); }
  return { ok: true, content: "finished" } as T;
 } };
 const bridge = await startNexusToolBridge({ host, sessionId: "bound", scratchDir: tmpdir(), mode: "agent", imageInput: false, snapshot: () => ({ turn: { id: "turn", runId: "run" } } as any) }); bridges.push(bridge);
 const call = (id: number, args = {}) => fetch(bridge.url, { method: "POST", headers: { Authorization: "Bearer " + bridge.token }, body: JSON.stringify({ jsonrpc: "2.0", id, method: "tools/call", params: { name: "plugin_test_write", arguments: args } }) });
 const pending = call(1, { pending: true }); await admitted;
 for (let id = 2; id < 132; id++) expect((await call(id)).status).toBe(200);
 const repeated = call(1, { pending: true });
 const conflicting = await call(1, { pending: false });
 expect(conflicting.status).toBe(400); expect((await conflicting.json()).error).toContain("NEXUS_TOOL_REQUEST_CONFLICT");
 const expired = await call(2);
 expect(expired.status).toBe(400); expect((await expired.json()).error).toContain("NEXUS_TOOL_RESULT_EXPIRED");
 expect(mutations).toBe(1);
 finish({ ok: true, content: "saved" });
 expect((await pending).status).toBe(200); expect((await repeated).status).toBe(200);
 expect(mutations).toBe(1);
});
it("delivers actual bounded screenshots to vision models and rejects paths outside scratch", async () => {
 const root = await mkdtemp(join(tmpdir(), "nexus-image-")); dirs.push(root); const path = join(root, "shot.png");
 await writeFile(path, Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jTrsAAAAASUVORK5CYII=", "base64"));
 const result = { ok: true, content: "screenshot", details: { result: { path } } };
 const content = await nexusToolContent(result, "browser_screenshot", root, true);
 expect(content.content[1]).toMatchObject({ type: "image", mimeType: "image/png" });
 expect((await nexusToolContent(result, "browser_screenshot", root, false)).content[1].text).toContain("not visual verification");
 const other = await mkdtemp(join(tmpdir(), "nexus-image-other-")); dirs.push(other);
 await expect(nexusToolContent(result, "browser_screenshot", other, true)).rejects.toThrow("NEXUS_SCREENSHOT_PATH_INVALID");
});
it("aborts only owned host calls when the engine connection closes", async () => {
 const aborted: any[] = []; let finish!: (value: any) => void; let started!: () => void; const admitted = new Promise<void>(r => { started = r; });
 const host = { call: async <T>(method: string, params?: any): Promise<T> => {
  if (method === "tools.list") return { tools: [definition("browser_wait")] } as T;
  if (method === "tools.abort") { aborted.push(params); finish({ ok: false, content: "aborted" }); return {} as T; }
  started(); return new Promise<T>(r => { finish = r; });
 } };
 const bridge = await startNexusToolBridge({ host, sessionId: "owned", scratchDir: tmpdir(), mode: "agent", imageInput: false, snapshot: () => ({ turn: { id: "turn", runId: "run" } } as any) }); bridges.push(bridge);
 const pending = fetch(bridge.url, { method: "POST", headers: { Authorization: "Bearer " + bridge.token }, body: JSON.stringify({ jsonrpc: "2.0", id: 8, method: "tools/call", params: { name: "browser_wait" } }) }).catch(() => undefined);
 await admitted; await bridge.close(); await pending; expect(aborted).toHaveLength(1); expect(aborted[0].sessionId).toBe("owned");
});

it("closes HTTP connections within a bound even if host abort never responds", async () => {
 let admitted!: () => void;
 const started = new Promise<void>(resolve => { admitted = resolve; });
 const host = { call: async <T>(method: string): Promise<T> => {
  if (method === "tools.list") return { tools: [definition("browser_wait")] } as T;
  if (method === "tools.execute") admitted();
  return new Promise<T>(() => undefined);
 } };
 const bridge = await startNexusToolBridge({ host, sessionId: "owned", scratchDir: tmpdir(), mode: "agent", imageInput: false, snapshot: () => ({ turn: { id: "turn", runId: "run" } } as any) }); bridges.push(bridge);
 const pending = fetch(bridge.url, { method: "POST", headers: { Authorization: "Bearer " + bridge.token }, body: JSON.stringify({ jsonrpc: "2.0", id: 9, method: "tools/call", params: { name: "browser_wait" } }) }).catch(() => undefined);
 await started;
 const before = Date.now(); await bridge.close(); await pending;
 expect(Date.now() - before).toBeLessThan(2000);
});
