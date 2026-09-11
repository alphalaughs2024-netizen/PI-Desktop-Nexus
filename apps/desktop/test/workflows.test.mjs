import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const desktopRoot = join(here, "..");
const repoRoot = join(desktopRoot, "../..");
const requireFromRuntime = createRequire(join(repoRoot, "packages/agent-runtime/package.json"));
const loadTypeScript = requireFromRuntime("jiti")(join(repoRoot, "packages/agent-runtime/jiti-runner.cjs"));
const {
  AGENT_OPERATIONS_WORKFLOW_ID,
  PLUGIN_DEVELOPMENT_WORKFLOW_ID,
  resolveWorkflows,
  validateWorkflowManifest,
} = loadTypeScript(join(desktopRoot, "electron/main/workflows.ts"));
const runtimeSource = readFileSync(join(repoRoot, "packages/agent-runtime/src/runtime.ts"), "utf8");
const mainSource = readFileSync(join(desktopRoot, "electron/main/index.ts"), "utf8");
const surfaceSource = readFileSync(join(desktopRoot, "src/components/ChatSurface.tsx"), "utf8");

const capabilities = ["core-agent-tools", "skill-loader", "plugin-development-tools"];

function resolve(overrides = {}) {
  return resolveWorkflows({
    prompt: "",
    mode: "agent",
    workspace: { isPluginWorkspace: false },
    capabilities,
    globalDisabledIds: [],
    projectOverrides: {},
    session: {},
    ...overrides,
  });
}

test("validates versioned Nexus workflow manifests", () => {
  assert.equal(validateWorkflowManifest({ id: "bad" }).ok, false);
  assert.equal(
    validateWorkflowManifest({
      id: "nexus/test",
      version: "1",
      name: "Test",
      description: "Test workflow",
      supportedModes: ["agent"],
      requiredCapabilities: ["core-agent-tools"],
      priority: 1,
      defaultStage: "active",
      skillFile: "test.md",
    }).ok,
    true,
  );
});

test("keeps operations available but makes plugin authoring the primary workflow", () => {
  const ordinary = resolve();
  assert.equal(ordinary.primary?.id, AGENT_OPERATIONS_WORKFLOW_ID);
  assert.deepEqual(ordinary.supportingIds, []);

  const authoring = resolve({ prompt: "Please create a Nexus plugin" });
  assert.equal(authoring.primary?.id, PLUGIN_DEVELOPMENT_WORKFLOW_ID);
  assert.equal(authoring.primary?.reasonCategory, "plugin_authoring_request");
  assert.deepEqual(authoring.supportingIds, [AGENT_OPERATIONS_WORKFLOW_ID]);
  assert.equal(resolve({ prompt: "What are Nexus plugins?" }).primary?.id, AGENT_OPERATIONS_WORKFLOW_ID);
});

test("applies capability, global, project, and session precedence without persisting prompt text", () => {
  assert.equal(
    resolve({
      prompt: "Create a plugin",
      capabilities: ["core-agent-tools", "skill-loader"],
    }).primary?.id,
    AGENT_OPERATIONS_WORKFLOW_ID,
  );
  assert.equal(
    resolve({
      prompt: "Create a plugin",
      globalDisabledIds: [PLUGIN_DEVELOPMENT_WORKFLOW_ID],
    }).primary?.id,
    AGENT_OPERATIONS_WORKFLOW_ID,
  );
  assert.equal(
    resolve({
      prompt: "Create a plugin",
      projectOverrides: { [PLUGIN_DEVELOPMENT_WORKFLOW_ID]: false },
    }).primary?.id,
    AGENT_OPERATIONS_WORKFLOW_ID,
  );
  const dismissed = resolve({
    prompt: "Create a plugin",
    session: { dismissedIds: [PLUGIN_DEVELOPMENT_WORKFLOW_ID] },
  });
  assert.equal(dismissed.primary?.id, AGENT_OPERATIONS_WORKFLOW_ID);
  assert.ok(!JSON.stringify(dismissed).includes("Create a plugin"));
});

test("a manual session selection can choose only an available compatible workflow", () => {
  const active = resolve({
    session: { manualActiveId: PLUGIN_DEVELOPMENT_WORKFLOW_ID },
  });
  assert.equal(active.primary?.id, PLUGIN_DEVELOPMENT_WORKFLOW_ID);
  assert.equal(active.primary?.source, "manual");
  assert.equal(
    resolve({
      mode: "goal",
      session: { manualActiveId: PLUGIN_DEVELOPMENT_WORKFLOW_ID },
    }).primary?.id,
    AGENT_OPERATIONS_WORKFLOW_ID,
  );
});

test("injects only active guidance, keeps Workflow guidance-only, and exposes transparent controls", () => {
  assert.match(runtimeSource, /<active-nexus-workflow/);
  assert.match(runtimeSource, /cannot add tools, permissions, execution rights, or bypass confirmations/);
  assert.match(runtimeSource, /WORKFLOW_TOOL_NAME = "Workflow"/);
  assert.match(mainSource, /s\.setLocalTool\("Workflow"/);
  assert.match(mainSource, /clearWorkflowSession\(dataDir, id\)/);
  assert.match(surfaceSource, /<ActiveWorkflowCard sessionId=\{activeSessionId\} \/>/);
});
