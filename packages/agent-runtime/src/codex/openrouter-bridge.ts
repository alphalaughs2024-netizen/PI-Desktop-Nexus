import { randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { createServer, type IncomingMessage } from "node:http";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { RuntimeProviderConfig } from "../provider-binding.js";
import { CodexToolPolicy } from "./tool-policy.js";
import { responseUsage, type WireUsage } from "./billing.js";

const MAX_BODY_BYTES = 32 * 1024 * 1024;
const MAX_FRAME_BYTES = 8 * 1024 * 1024;
export function needsOpenRouterBridge(provider: RuntimeProviderConfig): boolean {
  try { const url = new URL(provider.baseUrl ?? ""); return url.protocol === "https:" && url.hostname === "openrouter.ai" && url.pathname.replace(/\/$/, "") === "/api/v1"; }
  catch { return false; }
}
/** Only the wire format changes; Codex still owns validation, approval and edits. */
export function bridgeRequest(request: any): any {
  const patchCalls = new Set<string>((Array.isArray(request.input) ? request.input : []).filter((i: any) => i.type === "custom_tool_call" && i.name === "apply_patch").map((i: any) => i.call_id));
  return { ...request,
    tools: request.tools?.map((tool: any) => tool.type === "custom" && tool.name === "apply_patch" ? {
      type: "function", name: "apply_patch", strict: true,
      description: "Apply a file patch in Nexus. input is the exact raw patch string. Use *** Begin Patch, *** Update File: relative/path, @@ context, -removed and +added lines, then *** End Patch. Add files with *** Add File: relative/path and +prefixed lines. Delete with *** Delete File: relative/path. Preserve existing file context.",
      parameters: { type: "object", properties: { input: { type: "string" } }, required: ["input"], additionalProperties: false },
    } : tool),
    input: Array.isArray(request.input) ? request.input.map((item: any) => {
      if (item.type === "custom_tool_call" && item.name === "apply_patch") {
        const { input, ...rest } = item; return { ...rest, type: "function_call", arguments: JSON.stringify({ input }) };
      }
      if (item.type === "custom_tool_call_output" && patchCalls.has(item.call_id)) return { ...item, type: "function_call_output" };
      return item;
    }) : request.input,
    ...(request.tool_choice?.type === "custom" && request.tool_choice.name === "apply_patch" ? { tool_choice: { type: "function", name: "apply_patch" } } : {}),
  };
}
function nativePatch(item: any): any {
  if (item?.type !== "function_call" || item.name !== "apply_patch") return item;
  const { arguments: args, ...rest } = item;
  let input = "";
  if (args) {
    const parsed = JSON.parse(args);
    if (typeof parsed?.input !== "string") throw new Error("CODEX_BRIDGE_PATCH_ARGUMENTS_INVALID");
    input = parsed.input;
  }
  return { ...rest, type: "custom_tool_call", input };
}
export function bridgeResponse(response: any): any {
  return response?.output ? { ...response, output: response.output.map(nativePatch) } : response;
}
export class PatchStreamMapper {
  private patchIds = new Set<string>();
  private patchIndices = new Set<number>();
  constructor(private policy?: CodexToolPolicy, private patchCompatibility = true, private observe?: (event: any) => void) {}
  frame(frame: string): string | undefined {
    const lines = frame.split(/\r?\n/);
    const data = lines.filter(line => line.startsWith("data:")).map(line => line.slice(5).trimStart()).join("\n");
    if (!data || data === "[DONE]") return frame;
    const event = JSON.parse(data);
    this.observe?.(event);
    this.policy?.event(event);
    if (!this.patchCompatibility) return frame;
    if (event.type === "response.output_item.added" && event.item?.type === "function_call" && event.item.name === "apply_patch") {
      this.patchIds.add(event.item.id); this.patchIndices.add(event.output_index); event.item = nativePatch(event.item);
    } else if (event.type?.startsWith("response.function_call_arguments.") && (this.patchIds.has(event.item_id) || this.patchIndices.has(event.output_index))) {
      // JSON fragments are not patch fragments. Emit the validated raw string at item/done.
      return undefined;
    } else if (event.type === "response.output_item.done") event.item = nativePatch(event.item);
    else if (event.response) event.response = bridgeResponse(event.response);
    return lines.filter(line => !line.startsWith("data:") && !line.startsWith("event:")).concat("event: " + event.type, "data: " + JSON.stringify(event)).join("\n");
  }
}
async function* mappedStream(body: AsyncIterable<Uint8Array>, policy?: CodexToolPolicy, patchCompatibility = true, observe?: (event: any) => void) {
  const decoder = new TextDecoder(); const mapper = new PatchStreamMapper(policy, patchCompatibility, observe); let buffer = "";
  for await (const chunk of body) {
    buffer += decoder.decode(chunk, { stream: true });
    if (Buffer.byteLength(buffer) > MAX_FRAME_BYTES) throw new Error("CODEX_BRIDGE_FRAME_LIMIT");
    let match: RegExpExecArray | null;
    while ((match = /\r?\n\r?\n/.exec(buffer))) {
      const frame = buffer.slice(0, match.index); buffer = buffer.slice(match.index + match[0].length);
      const output = mapper.frame(frame); if (output !== undefined) yield output + "\n\n";
    }
  }
  buffer += decoder.decode();
  if (buffer.trim()) { const output = mapper.frame(buffer); if (output !== undefined) yield output + "\n\n"; }
}
async function bodyJson(request: IncomingMessage) {
  const chunks: Buffer[] = []; let size = 0;
  for await (const chunk of request) { size += chunk.length; if (size > MAX_BODY_BYTES) throw new Error("CODEX_BRIDGE_BODY_LIMIT"); chunks.push(chunk); }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}
export type ProviderBridge = { url: string; token: string; close(): Promise<void> };
export async function startOpenRouterBridge(provider: RuntimeProviderConfig, fetcher: typeof fetch = fetch): Promise<ProviderBridge> {
  if (!needsOpenRouterBridge(provider)) throw new Error("CODEX_BRIDGE_ENDPOINT_UNSUPPORTED");
  return startProviderBridge(provider, { patchCompatibility: true }, fetcher);
}
export async function startProviderBridge(provider: RuntimeProviderConfig, options: { patchCompatibility?: boolean; allowedTools?: ReadonlySet<string>; maxRequests?: number; maxOutputTokens?: number; onPolicyFailure?: (code: string) => void; usageSink?: () => ((usage: WireUsage) => void) | undefined }, fetcher: typeof fetch = fetch): Promise<ProviderBridge> {
  const endpoint = new URL(provider.baseUrl ?? "");
  if (!["http:", "https:"].includes(endpoint.protocol) || endpoint.username || endpoint.password || endpoint.search || endpoint.hash) throw new Error("CODEX_ENDPOINT_INVALID");
  const token = randomBytes(32).toString("hex"); const expected = Buffer.from("Bearer " + token); const active = new Set<AbortController>();
  const handlers = new Set<Promise<void>>();
  let requests = 0;
  const server = createServer(async (request, response) => {
    const received = Buffer.from(request.headers.authorization ?? "");
    if (received.length !== expected.length || !timingSafeEqual(received, expected)) { response.writeHead(401); response.end(); return; }
    if (request.method !== "POST" || !["/responses", "/responses/compact"].includes(request.url ?? "")) { response.writeHead(404); response.end(); return; }
    const abort = new AbortController(); active.add(abort);
    let finish!: () => void;
    const handler = new Promise<void>(resolve => { finish = resolve; }); handlers.add(handler);
    const sink = options.usageSink?.();
    const wire: WireUsage = { id: randomUUID(), occurredAt: Date.now(), kind: request.url === "/responses/compact" ? "compaction" : "response", outcome: "failed" };
    let reported = false; let sent = false;
    const report = () => { if (!reported && sent) { reported = true; sink?.({ ...wire }); } };
    response.once("close", () => { if (!response.writableEnded) abort.abort(); });
    try {
      const requestData = await bodyJson(request);
      if (requestData.model !== provider.modelId) throw new Error("CODEX_BRIDGE_MODEL_MISMATCH");
      if (request.url === "/responses" && options.maxRequests !== undefined && ++requests > options.maxRequests) throw new Error("CODEX_DELEGATION_LIMIT");
      const policy = options.allowedTools ? new CodexToolPolicy(options.allowedTools) : undefined;
      const permitted = policy ? policy.request(requestData) : requestData;
      if (options.maxOutputTokens !== undefined) permitted.max_output_tokens = Math.min(options.maxOutputTokens, Number(permitted.max_output_tokens) || options.maxOutputTokens);
      sent = true;
      sink?.({ ...wire, outcome: "running" });
      const upstream = await fetcher(provider.baseUrl!.replace(/\/$/, "") + request.url, {
        method: "POST", headers: { "Content-Type": "application/json", ...provider.headers, Authorization: "Bearer " + provider.apiKey },
        body: JSON.stringify(options.patchCompatibility ? bridgeRequest(permitted) : permitted), signal: abort.signal, redirect: "error",
      });
      response.writeHead(upstream.status, { "Content-Type": upstream.headers.get("content-type") ?? "application/json" });
      if (!upstream.ok) { report(); await pipeline(Readable.fromWeb(upstream.body as any), response); return; }
      if (requestData.stream) await pipeline(Readable.from(mappedStream(upstream.body! as any, policy, options.patchCompatibility === true, event => {
        if (event.response?.id) wire.responseId = event.response.id;
        if (["response.completed", "response.done", "response.failed", "response.incomplete"].includes(event.type)) {
          Object.assign(wire, responseUsage(event.response, provider));
          wire.outcome = ["response.completed", "response.done"].includes(event.type) && event.response?.status !== "failed" && event.response?.status !== "incomplete" ? "completed" : "failed";
          report();
        }
      })), response);
      else {
        const result = await upstream.json();
        Object.assign(wire, responseUsage(result, provider));
        wire.outcome = ["failed", "incomplete"].includes((result as any)?.status) ? "failed" : "completed";
        report();
        policy?.response(result);
        response.end(JSON.stringify(options.patchCompatibility ? bridgeResponse(result) : result));
      }
    } catch (error) {
      if (error instanceof Error && ["CODEX_TOOL_POLICY_DENIED", "CODEX_DELEGATION_LIMIT", "CODEX_BRIDGE_MODEL_MISMATCH"].includes(error.message)) options.onPolicyFailure?.(error.message);
      // No provider request bodies or credentials in transport errors.
      if (!response.headersSent) { response.writeHead(502, { "Content-Type": "application/json" }); response.end(JSON.stringify({ error: { message: "CODEX_PROVIDER_BRIDGE_FAILED" } })); }
      else response.destroy();
    } finally { if (abort.signal.aborted) wire.outcome = "interrupted"; report(); active.delete(abort); handlers.delete(handler); finish(); }
  });
  server.headersTimeout = 30_000; server.requestTimeout = 30_000;
  await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  const address = server.address(); if (!address || typeof address === "string") throw new Error("CODEX_BRIDGE_START_FAILED");
  let closing: Promise<void> | undefined;
  return { url: "http://127.0.0.1:" + address.port, token, close: () => closing ??= (async () => {
    for (const controller of active) controller.abort();
    const pending = [...handlers];
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
    await Promise.all(pending);
  })() };
}
