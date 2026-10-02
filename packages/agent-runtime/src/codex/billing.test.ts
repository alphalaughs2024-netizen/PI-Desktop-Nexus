import { expect, it } from "vitest";
import { responseUsage, priceWireUsage } from "./billing.js";
import { startProviderBridge } from "./openrouter-bridge.js";
import type { RuntimeProviderConfig } from "../provider-binding.js";

const provider: RuntimeProviderConfig = { id: "custom", name: "Endpoint", baseUrl: "https://endpoint.test/v1", modelId: "same-model", apiKey: "fixture-key", supportsReasoning: false, supportedThinkingLevels: [] };
it("normalizes Responses usage and only accepts identifiable USD charges", () => {
  const r = { id: "r", usage: { input_tokens: 100, output_tokens: 80, total_tokens: 180, input_tokens_details: { cached_tokens: 20 }, output_tokens_details: { reasoning_tokens: 30 }, cost: 1 } };
  expect(responseUsage(r,provider)).toEqual({ responseId: "r", amountUsd: undefined, usage: { inputTokens: 80, outputTokens: 50, cacheReadTokens: 20, cacheWriteTokens: 0, reasoningTokens: 30, totalTokens: 180 } });
  expect(responseUsage({ ...r, usage: { ...r.usage, cost_usd: "0" } },provider).amountUsd).toBe("0.000000000");
  expect(responseUsage({ ...r, usage: { ...r.usage, input_tokens_details: { cached_tokens: 101 } } },provider).usage).toBeUndefined();
});
it("preserves reported charges, snapshots provider estimates and does not invent generic prices", async () => {
  const wire = { id: "w", occurredAt: 1, kind: "response" as const, outcome: "completed" as const, usage: { inputTokens: 100, outputTokens: 10, totalTokens: 110 } };
  expect(await priceWireUsage({ ...wire, amountUsd: "0" },provider)).toEqual({ amountUsd: "0", provenance: "provider_reported" });
  expect((await priceWireUsage(wire,{ ...provider,billingRates: {input: 1,output: 2} })).provenance).toBe("provider_estimate");
  expect((await priceWireUsage(wire,provider)).provenance).toBe("unpriced");
});
it("records every streaming request once at start and once at completion before forwarding the terminal event", async () => {
  const records: any[] = [];
  const payload = { type: "response.completed", response: { id: "r1", status: "completed", usage: { input_tokens: 2, output_tokens: 3, total_tokens: 5 } } };
  const bridge = await startProviderBridge(provider, { usageSink: () => record => records.push(record) }, (async (_url: any, options: any) => {
    expect(options.redirect).toBe("error");
    return new Response(`data: ${JSON.stringify(payload)}\n\ndata: [DONE]\n\n`, {headers:{"content-type":"text/event-stream"}});
  }) as any);
  try {
    const r = await fetch(bridge.url+"/responses", {method:"POST",headers:{Authorization:`Bearer ${bridge.token}`},body:JSON.stringify({model:provider.modelId,stream:true})});
    expect(await r.text()).toContain("response.completed");
    expect(records).toHaveLength(2); expect(records[0].outcome).toBe("running"); expect(records[1].outcome).toBe("completed");
    expect(records[0].id).toBe(records[1].id); expect(records[1].usage.totalTokens).toBe(5);
  } finally { await bridge.close(); }
});
it("retains a request without usage after an upstream failure", async () => {
  const records:any[]=[];
  const bridge=await startProviderBridge(provider,{usageSink:()=>r=>records.push(r)},(async()=>new Response("bad",{status:503})) as any);
  try {
    const r=await fetch(bridge.url+"/responses",{method:"POST",headers:{Authorization:`Bearer ${bridge.token}`},body:JSON.stringify({model:provider.modelId})});
    await r.text(); expect(records).toHaveLength(2); expect(records[1].outcome).toBe("failed"); expect(records[1].usage).toBeUndefined();
  } finally {await bridge.close();}
});
