import { afterEach, expect, it, vi } from "vitest";
import { bridgeRequest, bridgeResponse, needsOpenRouterBridge, PatchStreamMapper, startOpenRouterBridge, type ProviderBridge } from "./openrouter-bridge.js";
import type { RuntimeProviderConfig } from "../provider-binding.js";
const provider: RuntimeProviderConfig = { id: "p", name: "OpenRouter", modelId: "stealth/space-bunny-alpha", baseUrl: "https://openrouter.ai/api/v1", apiKey: "upstream-secret", supportsReasoning: false, supportedThinkingLevels: [] };
const bridges: ProviderBridge[] = [];
afterEach(async () => { await Promise.all(bridges.splice(0).map(b => b.close())); });
it("only enables compatibility for the official OpenRouter endpoint", () => {
  expect(needsOpenRouterBridge(provider)).toBe(true);
  for (const url of ["https://other.test/v1", "http://openrouter.ai/api/v1", "https://openrouter.ai.evil.test/api/v1", "https://openrouter.ai/api/v2"]) expect(needsOpenRouterBridge({ ...provider, baseUrl: url })).toBe(false);
});
it("translates only patch declarations, calls and matching outputs while preserving image/history inputs", () => {
  const result = bridgeRequest({ input: [{ type: "custom_tool_call", name: "apply_patch", call_id: "patch", input: "raw patch" }, { type: "custom_tool_call_output", call_id: "patch", output: "verified" }, { type: "custom_tool_call_output", call_id: "other", output: "unchanged" }, { type: "message", content: [{ type: "input_image", image_url: "data:image/png;base64,actual" }] }], tools: [{ type: "custom", name: "apply_patch" }, { type: "function", name: "exec_command" }], tool_choice: { type: "custom", name: "apply_patch" } });
  expect(result.tools[0]).toMatchObject({ type: "function", name: "apply_patch", parameters: { required: ["input"] } });
  expect(result.tools[1]).toEqual({ type: "function", name: "exec_command" });
  expect(result.input[0]).toMatchObject({ type: "function_call", arguments: '{"input":"raw patch"}' });
  expect(result.input[1].type).toBe("function_call_output"); expect(result.input[2].type).toBe("custom_tool_call_output");
  expect(result.input[3].content[0].image_url).toBe("data:image/png;base64,actual");
  expect(result.tool_choice.type).toBe("function");
});
it("reconstructs raw native patches and fails malformed arguments instead of executing them", () => {
  expect(bridgeResponse({ output: [{ type: "function_call", name: "apply_patch", id: "p", call_id: "c", arguments: '{"input":"raw patch"}' }] }).output[0]).toEqual({ type: "custom_tool_call", name: "apply_patch", id: "p", call_id: "c", input: "raw patch" });
  expect(() => bridgeResponse({ output: [{ type: "function_call", name: "apply_patch", arguments: '{"input":123}' }] })).toThrow("CODEX_BRIDGE_PATCH_ARGUMENTS_INVALID");
});
it("keeps patch JSON fragments out of native input and preserves ordinary streaming deltas", () => {
  const mapper = new PatchStreamMapper(); const frame = (event: any) => "data: " + JSON.stringify(event);
  const added = mapper.frame(frame({ type: "response.output_item.added", output_index: 1, item: { id: "p", type: "function_call", name: "apply_patch", arguments: "" } }));
  expect(added).toContain('"type":"custom_tool_call"');
  expect(mapper.frame(frame({ type: "response.function_call_arguments.delta", item_id: "p", delta: '{"input"' }))).toBeUndefined();
  expect(mapper.frame(frame({ type: "response.function_call_arguments.delta", item_id: "cmd", delta: '{"cmd"' }))).toContain('"item_id":"cmd"');
  const completed = mapper.frame(frame({ type: "response.output_item.done", item: { id: "p", type: "function_call", name: "apply_patch", arguments: '{"input":"raw patch"}' } }));
  expect(completed).toContain('"input":"raw patch"'); expect(completed).not.toContain('"arguments"');
});
it("authenticates the loopback service and streams arbitrarily split upstream frames with backpressure", async () => {
  const event = { type: "response.output_item.done", item: { id: "p", type: "function_call", name: "apply_patch", arguments: '{"input":"emerald 🟢"}' } };
  const bytes = new TextEncoder().encode("data: " + JSON.stringify(event) + "\r\n\r\n");
  const fetcher = vi.fn(async (_url: any, options: any) => {
    expect(options.headers.Authorization).toBe("Bearer upstream-secret");
    return new Response(new ReadableStream({ start(controller) { for (const byte of bytes) controller.enqueue(Uint8Array.of(byte)); controller.close(); } }), { headers: { "content-type": "text/event-stream" } });
  });
  const bridge = await startOpenRouterBridge(provider, fetcher as any); bridges.push(bridge);
  expect(bridge.token).not.toBe(provider.apiKey);
  expect((await fetch(bridge.url + "/responses", { method: "POST" })).status).toBe(401);
  expect((await fetch(bridge.url + "/invalid", { method: "POST", headers: { authorization: "Bearer " + bridge.token } })).status).toBe(404);
  const response = await fetch(bridge.url + "/responses", { method: "POST", headers: { authorization: "Bearer " + bridge.token }, body: JSON.stringify({ model: provider.modelId, stream: true, input: "hi" }) });
  expect(await response.text()).toContain('"input":"emerald 🟢"'); expect(fetcher).toHaveBeenCalledOnce();
});
it("aborts upstream work and closes the service without replaying requests", async () => {
  let observed: AbortSignal | undefined;
  const fetcher = vi.fn((_url: any, options: any) => new Promise<Response>((_, reject) => { observed = options.signal; observed!.addEventListener("abort", () => reject(new Error("aborted"))); }));
  const bridge = await startOpenRouterBridge(provider, fetcher as any); bridges.push(bridge);
  const request = fetch(bridge.url + "/responses", { method: "POST", headers: { authorization: "Bearer " + bridge.token }, body: JSON.stringify({ model: provider.modelId, input: "hi" }) }).catch(() => undefined);
  await vi.waitFor(() => expect(observed).toBeDefined()); await bridge.close(); await request;
  expect(observed!.aborted).toBe(true); expect(fetcher).toHaveBeenCalledOnce();
});
