import { createServer } from "node:http";
import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { readFile, realpath } from "node:fs/promises";
import { relative, isAbsolute } from "node:path";
import type { RuntimeHost } from "../host-client.js";
import type { EngineSnapshot } from "@pi-desktop/shared";
export type NexusTool = { name: string; description?: string; parameters?: unknown; risk?: unknown; planSafeActions?: readonly string[] };
export type NexusToolResult = { ok: boolean; content: unknown; isError?: boolean; errorCode?: string; denied?: boolean; details?: unknown };
export type NexusToolBridge = { url: string; token: string; close(): Promise<void> };
export type NexusToolOptions = {
 host: RuntimeHost; sessionId: string; scratchDir: string; mode: "agent" | "plan" | "goal";
 snapshot(): EngineSnapshot; tools?: NexusTool[]; imageInput: boolean;
 executeLocal?: (name: string, args: any, toolCallId: string) => Promise<NexusToolResult | undefined>;
};
const nativeTools = new Set(["Read", "Write", "Edit", "Bash"]);
export function nexusToolCatalog(tools: NexusTool[]): NexusTool[] {
 const unique = new Map<string, NexusTool>();
 for (const tool of tools) {
  if (!/^[A-Za-z][A-Za-z0-9_.-]{0,127}$/.test(tool.name) || nativeTools.has(tool.name) || /^context_|prompt.*inspector/i.test(tool.name)) continue;
  if (!tool.parameters || typeof tool.parameters !== "object") continue;
  if (!unique.has(tool.name)) unique.set(tool.name, tool);
 }
 return [...unique.values()];
}
/** Model image blocks remain intact; transcript diagnostics keep metadata only. */
export function nexusToolDiagnostics(value: unknown): unknown {
 if (Array.isArray(value)) return value.map(nexusToolDiagnostics);
 if (!value || typeof value !== "object") return value;
 const record = value as Record<string, unknown>;
 const image = record.type === "image" || record.type === "input_image" || record.type === "image_url" || (typeof record.mimeType === "string" && record.mimeType.startsWith("image/") && typeof record.data === "string");
 return Object.fromEntries([
  ...Object.entries(record).filter(([key, child]) => !(image && ["data", "image_url"].includes(key)) && !(key === "url" && typeof child === "string" && child.startsWith("data:image/"))).map(([key, child]) => [key, nexusToolDiagnostics(child)]),
  ...(image ? [["imageDataOmitted", true]] : []),
 ]);
}
export async function nexusToolContent(result: NexusToolResult, name: string, scratchDir: string, imageInput: boolean) {
 const content: any[] = [{ type: "text", text: typeof result.content === "string" ? result.content : JSON.stringify(result.content ?? {}) }];
 if (name === "browser_screenshot" && result.ok && imageInput) {
  const details = result.details as any;
  const metadata = details?.result ?? details;
  if (typeof metadata?.path !== "string") throw new Error("NEXUS_SCREENSHOT_IMAGE_MISSING");
  const [root, path] = await Promise.all([realpath(scratchDir), realpath(metadata.path)]);
  const child = relative(root, path);
  if (child.startsWith("..") || isAbsolute(child)) throw new Error("NEXUS_SCREENSHOT_PATH_INVALID");
  const bytes = await readFile(path);
  if (bytes.length > 8 * 1024 * 1024) throw new Error("NEXUS_SCREENSHOT_TOO_LARGE");
  const jpeg = bytes[0] === 0xff && bytes[1] === 0xd8;
  const png = bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
  if (!jpeg && !png) throw new Error("NEXUS_SCREENSHOT_FORMAT_INVALID");
  content.push({ type: "image", mimeType: jpeg ? "image/jpeg" : "image/png", data: bytes.toString("base64") });
 } else if (name === "browser_screenshot" && !imageInput) content.push({ type: "text", text: "This model has no image-input capability. Screenshot metadata alone is not visual verification." });
 return { content, isError: !result.ok || result.isError === true || result.denied === true };
}
/** Private streamable-HTTP MCP endpoint; Nexus remains the tool/permission owner. */
export async function startNexusToolBridge(options: NexusToolOptions): Promise<NexusToolBridge> {
 const listed = await options.host.call<{ tools: NexusTool[] }>("tools.list", { sessionId: options.sessionId });
 const tools = nexusToolCatalog([...(listed.tools ?? []), ...(options.tools ?? [])]);
 const catalog = new Map(tools.map(tool => [tool.name, tool]));
 const token = randomUUID(); let closed = false;
 const active = new Set<string>();
 type CachedRequest = { signature: string; promise: Promise<unknown>; completed: boolean; bytes: number };
 const requests = new Map<string, CachedRequest>();
 const admitted = new Map<string, string>();
 let cacheBytes = 0;
 let currentRun: string | undefined;
 const trimCache = () => {
  for (const [key, entry] of requests) {
   if (requests.size <= 128 && cacheBytes <= 16 * 1024 * 1024) break;
   if (!entry.completed) continue;
   requests.delete(key); cacheBytes -= entry.bytes;
  }
 };
 const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
 const server = createServer(async (req, res) => {
  const auth = Buffer.from(req.headers.authorization ?? ""); const expected = Buffer.from("Bearer " + token);
  if (req.url !== "/mcp" || auth.length !== expected.length || !timingSafeEqual(auth, expected) || req.headers.origin) { res.writeHead(403).end(); return; }
  if (req.method !== "POST") { res.writeHead(405).end(); return; }
  const reply = (body: unknown) => { if (!res.destroyed) res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify(body)); };
  try {
   let size = 0; const chunks: Buffer[] = [];
   for await (const chunk of req) { size += chunk.length; if (size > 1024 * 1024) throw new Error("NEXUS_TOOL_REQUEST_TOO_LARGE"); chunks.push(chunk); }
   const message = JSON.parse(Buffer.concat(chunks).toString());
   if (!message || message.jsonrpc !== "2.0" || typeof message.method !== "string" || Array.isArray(message)) throw new Error("NEXUS_TOOL_REQUEST_INVALID");
   if (message.id === undefined) { res.writeHead(202).end(); return; }
   if (typeof message.id !== "string" && typeof message.id !== "number") throw new Error("NEXUS_TOOL_REQUEST_INVALID");
   let result: unknown;
   if (message.method === "initialize") result = { protocolVersion: message.params?.protocolVersion ?? "2025-03-26", capabilities: { tools: {} }, serverInfo: { name: "nexus", version: "1.0.0" }, instructions: "Use these tools for Nexus Browser, previews, skills, workflows, plugins and delegated work. Native Codex tools handle files and shell. Tool success must be verified from results." };
   else if (message.method === "ping") result = {};
   else if (message.method === "tools/list") result = { tools: tools.map(tool => ({ name: tool.name, description: tool.description ?? tool.name, inputSchema: tool.parameters })) };
   else if (message.method === "tools/call") {
    const name = String(message.params?.name ?? ""); const tool = catalog.get(name);
    if (!tool) { reply({ jsonrpc: "2.0", id: message.id, error: { code: -32602, message: "Unknown or unavailable Nexus tool" } }); return; }
    const state = options.snapshot();
    if (closed || !state.turn || state.turn.outcome) throw new Error("NEXUS_TOOL_TURN_INACTIVE");
    if (currentRun !== state.turn.runId) {
     currentRun = state.turn.runId; admitted.clear();
     for (const [key, entry] of requests) if (entry.completed) { requests.delete(key); cacheBytes -= entry.bytes; }
    }
    const key = digest([state.turn.runId, message.id]);
    const signature = digest([name, message.params.arguments ?? {}]);
    const previous = admitted.get(key);
    if (previous && previous !== signature) throw new Error("NEXUS_TOOL_REQUEST_CONFLICT: request ID already belongs to a different call");
    let entry = requests.get(key);
    if (previous && !entry) throw new Error("NEXUS_TOOL_RESULT_EXPIRED: previous call was not replayed; inspect its outcome");
    if (!entry) {
     if (active.size >= 64 || admitted.size >= 4096) throw new Error("NEXUS_TOOL_REQUEST_LIMIT: request was not dispatched");
     const toolCallId = randomUUID(); active.add(toolCallId);
     entry = { signature, promise: Promise.resolve(), completed: false, bytes: 0 };
     requests.set(key, entry); admitted.set(key, signature);
     const owned = entry;
     entry.promise = (async () => {
      try {
       const args = message.params.arguments ?? {};
       const local = await options.executeLocal?.(name, args, toolCallId);
       const value = local ?? await options.host.call<NexusToolResult>("tools.execute", { sessionId: options.sessionId, turnId: state.turn!.id, toolCallId, toolName: name, args, mode: options.mode, ...(tool.risk ? { declaredRisk: tool.risk } : {}), ...(tool.planSafeActions ? { planSafeActions: tool.planSafeActions } : {}) });
       return await nexusToolContent(value, name, options.scratchDir, options.imageInput);
      } catch (error) { return { content: [{ type: "text", text: error instanceof Error ? error.message : "Nexus tool failed" }], isError: true }; }
      finally { active.delete(toolCallId); }
     })();
     entry.promise = entry.promise.then(value => {
      owned.completed = true;
      owned.bytes = Buffer.byteLength(JSON.stringify(value));
      if (requests.get(key) === owned) cacheBytes += owned.bytes;
      trimCache();
      return value;
     });
    }
    result = await entry.promise;
   } else { reply({ jsonrpc: "2.0", id: message.id, error: { code: -32601, message: "Method not supported" } }); return; }
   reply({ jsonrpc: "2.0", id: message.id, result });
  } catch (error) { if (!res.destroyed) res.writeHead(400, { "Content-Type": "application/json" }).end(JSON.stringify({ error: error instanceof Error ? error.message : "NEXUS_TOOL_REQUEST_INVALID" })); }
 });
 await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", () => { server.off("error", reject); resolve(); }); });
 const address = server.address(); if (!address || typeof address === "string") throw new Error("NEXUS_TOOL_BRIDGE_START_FAILED");
 return { url: "http://127.0.0.1:" + address.port + "/mcp", token, close: async () => {
  if (closed) return; closed = true;
  const aborts = Promise.allSettled([...active].map(toolCallId => options.host.call("tools.abort", { sessionId: options.sessionId, toolCallId }, 1_000)));
  requests.clear(); admitted.clear(); cacheBytes = 0; server.closeAllConnections();
  await new Promise<void>(resolve => server.close(() => resolve()));
  let timer: ReturnType<typeof setTimeout> | undefined;
  try { await Promise.race([aborts, new Promise<void>(resolve => { timer = setTimeout(resolve, 1_000); })]); }
  finally { if (timer) clearTimeout(timer); }
 } };
}
