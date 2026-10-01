import { expect, it } from "vitest";
import { CodexToolPolicy } from "./tool-policy.js";
import { PatchStreamMapper } from "./openrouter-bridge.js";

const allowed = "mcp__nexus__Read";
const fixture = () => {
  const policy = new CodexToolPolicy(new Set([allowed]));
  const body = policy.request({ tools: [{ type: "function", name: allowed }, { type: "custom", name: "apply_patch" }, { type: "function", name: "exec_command" }, { type: "namespace", name: "escape", tools: [{ type: "function", name: allowed }] }] });
  return { policy, body };
};
it("offers only exact host-owned tools and rejects forced native tools", () => {
  expect(fixture().body.tools).toEqual([{ type: "function", name: allowed }]);
  expect(() => fixture().policy.request({ tools: [], tool_choice: { type: "custom", name: "apply_patch" } })).toThrow("CODEX_TOOL_POLICY_DENIED");
});
it("rejects unoffered, native and namespaced calls in complete responses", () => {
  for (const item of [{ type: "custom_tool_call", name: "apply_patch" }, { type: "function_call", name: "exec_command" }, { type: "function_call", name: "mcp__nexus__Write" }, { type: "function_call", name: allowed, namespace: "escape" }, { type: "local_shell_call", action: {} }]) {
    expect(() => fixture().policy.response({ output: [item] })).toThrow("CODEX_TOOL_POLICY_DENIED");
  }
  expect(() => fixture().policy.response({ output: [{ type: "function_call", name: allowed }] })).not.toThrow();
  expect(() => fixture().policy.response({ output: [{ type: "compaction", encrypted_content: "opaque" }] })).not.toThrow();
});
it("keeps the pinned Codex MCP namespace while filtering its children", () => {
  const policy = new CodexToolPolicy(new Set([allowed]));
  expect(policy.request({ tools: [{ type: "namespace", name: "mcp__nexus", tools: [{ type: "function", name: "Read" }, { type: "function", name: "Write" }] }] }).tools[0].tools).toEqual([{ type: "function", name: "Read" }]);
  expect(() => policy.response({ output: [{ type: "function_call", namespace: "mcp__nexus", name: "Read" }] })).not.toThrow();
  expect(() => policy.response({ output: [{ type: "function_call", namespace: "mcp__nexus", name: "Write" }] })).toThrow("CODEX_TOOL_POLICY_DENIED");
});
it("validates streamed calls before added/done/response frames reach Codex", () => {
  for (const event of [
    { type: "response.output_item.added", item: { type: "custom_tool_call", name: "apply_patch" } },
    { type: "response.output_item.done", item: { type: "function_call", name: "exec_command" } },
    { type: "response.completed", response: { output: [{ type: "function_call", name: "mcp__nexus__Write" }] } },
    { type: "response.function_call_arguments.delta", item_id: "unadmitted", delta: "{}" },
  ]) expect(() => new PatchStreamMapper(fixture().policy, false).frame("data: " + JSON.stringify(event))).toThrow("CODEX_TOOL_POLICY_DENIED");
  const mapper = new PatchStreamMapper(fixture().policy, false);
  expect(mapper.frame('data: {"type":"response.output_item.added","item":{"id":"read","type":"function_call","name":"mcp__nexus__Read"}}')).toContain(allowed);
  expect(mapper.frame('data: {"type":"response.function_call_arguments.delta","item_id":"read","delta":"{}"}')).toContain("{}");
});
