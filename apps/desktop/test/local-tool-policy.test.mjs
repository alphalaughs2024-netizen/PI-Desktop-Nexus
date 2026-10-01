import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";

const require = createRequire(new URL("../../../packages/agent-runtime/package.json", import.meta.url));
const load = require("jiti")(import.meta.url);
const { localToolAllowedInMode } = load("../electron/main/local-tool-policy.ts");
const { normalizeMode } = load("../../../packages/shared/src/index.ts");
const { AgentSidecar } = load("../electron/main/agent-sidecar.ts");
const { LocalToolExecutor } = load("../electron/main/local-tool-executor.ts");

for (const mode of ["plan", "goal", "chat"]) {
  test(`${mode}: guidance and browser inspection are available without granting mutation tools`, () => {
    const normalized = normalizeMode(mode, "agent");
    for (const tool of ["Skill", "Workflow", "BrowserPreview", "browser_snapshot", "browser_screenshot"]) {
      assert.equal(localToolAllowedInMode(tool, normalized), true, tool);
    }
    for (const tool of ["Write", "Edit", "Task", "PluginCheck", "PluginScaffold", "PluginPack", "plugin_example_write", "Git", "browser_click", "browser_evaluate", "browser_cdp", "unknown"]) {
      assert.equal(localToolAllowedInMode(tool, normalized), false, tool);
    }
  });
}

test("Agent retains its registered local tools", () => {
  for (const tool of ["Skill", "Workflow", "PluginScaffold", "browser_click"]) {
    assert.equal(localToolAllowedInMode(tool, "agent"), true);
  }
});

test("sidecar dispatch loads planning guidance and refuses local mutations and plugin proxies", async () => {
  const sidecar = Object.create(AgentSidecar.prototype);
  const executed = [];
  const responses = [];
  sidecar.localToolExecutor = new LocalToolExecutor(1000);
  sidecar.localTools = new Map(["Skill", "Workflow", "Git", "browser_evaluate"].map(name => [name, async ({ mode, args }) => {
    executed.push({ name, mode, args });
    return { ok: true, content: "guidance only" };
  }]));
  sidecar.host = { call: async () => { throw new Error("A plugin must not reach the host while planning"); } };
  sidecar.writeToChild = payload => { responses.push(JSON.parse(payload)); return true; };
  for (const mode of ["plan", "goal", "chat"]) {
    for (const toolName of ["Skill", "Workflow", "Git", "browser_evaluate", "PluginScaffold", "plugin_example_write"]) {
      await sidecar.onLine(JSON.stringify({ jsonrpc: "2.0", id: `${mode}-${toolName}`, method: "host.proxy", params: {
        method: "tools.execute", params: { mode, toolName, sessionId: "planning", toolCallId: `${mode}-${toolName}`, args: { id: "nexus/quality/brainstorming" } },
      } }));
      const response = responses.at(-1);
      if (["Skill", "Workflow"].includes(toolName)) assert.equal(response.result.ok, true);
      else assert.equal(response.result?.errorCode ?? response.error?.data?.errorCode, "TOOL_DISABLED_IN_PLAN");
    }
  }
  assert.equal(executed.length, 6);
  assert.deepEqual(executed.map(item => item.mode), ["plan", "plan", "goal", "goal", "plan", "plan"]);
  assert.ok(executed.every(item => item.args.id === "nexus/quality/brainstorming"));
});
