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
  BRAINSTORMING_WORKFLOW_ID,
  SYSTEMATIC_DEBUGGING_WORKFLOW_ID,
  TEST_DRIVEN_DEVELOPMENT_WORKFLOW_ID,
  VERIFICATION_WORKFLOW_ID,
  WRITING_PLANS_WORKFLOW_ID,
  EXECUTING_PLANS_WORKFLOW_ID,
  USING_GIT_WORKTREES_WORKFLOW_ID,
  FINISHING_DEVELOPMENT_BRANCH_WORKFLOW_ID,
  REQUESTING_CODE_REVIEW_WORKFLOW_ID,
  RECEIVING_CODE_REVIEW_WORKFLOW_ID,
  DISPATCHING_PARALLEL_AGENTS_WORKFLOW_ID,
  SUBAGENT_DRIVEN_DEVELOPMENT_WORKFLOW_ID,
  WORKFLOW_MANIFESTS,
  PLUGIN_DEVELOPMENT_WORKFLOW_ID,
  resolveWorkflows,
  transitionPlanWorkflowSession,
  validateWorkflowManifest,
} = loadTypeScript(join(desktopRoot, "electron/main/workflows.ts"));
const runtimeSource = readFileSync(join(repoRoot, "packages/agent-runtime/src/runtime.ts"), "utf8");
const mainSource = readFileSync(join(desktopRoot, "electron/main/index.ts"), "utf8");
const surfaceSource = readFileSync(join(desktopRoot, "src/components/ChatSurface.tsx"), "utf8");

const capabilities = [
  "core-agent-tools",
  "skill-loader",
  "plugin-development-tools",
  "file-tools",
  "terminal-tools",
  "test-execution",
  "git-worktree-operations",
  "subagent-orchestration",
];

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
      fixtures: [{ positivePrompt: "Use it", negativePrompt: "Discuss it", expectedStage: "active" }],
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

test("starts feature work in discovery and advances an approved discovery to test-first implementation", () => {
  const discovery = resolve({ prompt: "Add a shareable project activity feed." });
  assert.equal(discovery.primary?.id, BRAINSTORMING_WORKFLOW_ID);
  assert.equal(discovery.primary?.stage, "discovery");
  assert.equal(discovery.primary?.reasonCategory, "feature_request");

  const implementation = resolve({
    prompt: "Yes, implement the approved design now.",
    session: { primaryId: BRAINSTORMING_WORKFLOW_ID, stage: "discovery" },
  });
  assert.equal(implementation.primary?.id, TEST_DRIVEN_DEVELOPMENT_WORKFLOW_ID);
  assert.equal(implementation.primary?.stage, "implementation");
  assert.equal(implementation.primary?.reasonCategory, "approved_implementation");
});

test("selects diagnosis for reproducible failures and verification for completion checks", () => {
  const diagnosis = resolve({ prompt: "The plugin test fails every time with ECONNREFUSED; find and fix it." });
  assert.equal(diagnosis.primary?.id, SYSTEMATIC_DEBUGGING_WORKFLOW_ID);
  assert.equal(diagnosis.primary?.stage, "diagnosis");
  const verification = resolve({
    prompt: "Before you mark this complete, run the focused checks and verify the fix.",
    session: { primaryId: TEST_DRIVEN_DEVELOPMENT_WORKFLOW_ID, stage: "implementation" },
  });
  assert.equal(verification.primary?.id, VERIFICATION_WORKFLOW_ID);
  assert.equal(verification.primary?.stage, "verification");
});

test("does not force quality workflows for casual discussion", () => {
  assert.equal(resolve({ prompt: "What is test-driven development?" }).primary?.id, AGENT_OPERATIONS_WORKFLOW_ID);
  assert.equal(resolve({ prompt: "Can we discuss systematic debugging techniques?" }).primary?.id, AGENT_OPERATIONS_WORKFLOW_ID);
  assert.equal(resolve({ prompt: "Tell me whether TDD is useful." }).primary?.id, AGENT_OPERATIONS_WORKFLOW_ID);
});

test("ships every Phase 2 workflow as rewritten Nexus guidance", () => {
  const resources = [
    ["brainstorming.md", "Nexus discovery and design", "Nexus Plan mode"],
    ["systematic-debugging.md", "Nexus systematic debugging", "root-cause hypothesis"],
    ["test-driven-development.md", "Nexus test-first implementation", "focused failing test"],
    ["verification-before-completion.md", "Nexus verification before completion", "fresh evidence"],
  ];
  for (const [file, name, phrase] of resources) {
    const body = readFileSync(join(desktopRoot, "resources/skills", file), "utf8");
    assert.match(body, new RegExp(`name: ${name}`));
    assert.ok(body.includes(phrase), `${file} must contain Nexus-native guidance`);
    assert.ok(!body.includes("Codex"), `${file} must not carry Codex instructions`);
  }
});

test("declares a positive and negative activation fixture for every quality workflow", () => {
  for (const id of [
    BRAINSTORMING_WORKFLOW_ID,
    SYSTEMATIC_DEBUGGING_WORKFLOW_ID,
    TEST_DRIVEN_DEVELOPMENT_WORKFLOW_ID,
    VERIFICATION_WORKFLOW_ID,
  ]) {
    const manifest = WORKFLOW_MANIFESTS.find((candidate) => candidate.id === id);
    assert.ok(manifest?.fixtures.length, `${id} needs workflow fixtures`);
    assert.ok(manifest?.fixtures.every((fixture) => fixture.positivePrompt && fixture.negativePrompt));
  }
});

test("activates Nexus plan authoring from Plan mode without treating plan discussion as execution", () => {
  const planMode = resolve({
    mode: "plan",
    prompt: "Design a safe migration plan for the session store.",
  });
  assert.equal(planMode.primary?.id, WRITING_PLANS_WORKFLOW_ID);
  assert.equal(planMode.primary?.stage, "proposed_design");
  assert.equal(planMode.primary?.reasonCategory, "plan_mode");
  assert.match(planMode.primary?.nextAction ?? "", /proposal/i);

  const discussion = resolve({ prompt: "What is an implementation plan?" });
  assert.equal(discussion.primary?.id, AGENT_OPERATIONS_WORKFLOW_ID);
});

test("tracks the host-owned plan lifecycle without persisting plan content", () => {
  const proposed = transitionPlanWorkflowSession({}, "proposed");
  assert.deepEqual(
    { id: proposed.primaryId, stage: proposed.stage, reason: proposed.reasonCategory },
    { id: WRITING_PLANS_WORKFLOW_ID, stage: "proposed_design", reason: "plan_proposed" },
  );
  const approved = transitionPlanWorkflowSession(proposed, "approved");
  assert.equal(approved.stage, "approved_plan");
  const executing = transitionPlanWorkflowSession(approved, "executing");
  assert.equal(executing.primaryId, EXECUTING_PLANS_WORKFLOW_ID);
  assert.equal(executing.stage, "executing");
  assert.equal(executing.reasonCategory, "plan_approved");
  const verified = transitionPlanWorkflowSession(executing, "verified");
  assert.equal(verified.stage, "verified");
  assert.match(JSON.stringify(verified), /^(?!.*Approved plan body).*$/);
  const paused = transitionPlanWorkflowSession(executing, "paused");
  assert.equal(paused.stage, "paused");
  assert.equal(paused.reasonCategory, "plan_execution_paused");
});

test("keeps paused plan execution visible after restart instead of replaying it", () => {
  const paused = transitionPlanWorkflowSession({}, "paused");
  const resolution = resolve({ mode: "agent", session: paused });
  assert.equal(resolution.primary?.id, EXECUTING_PLANS_WORKFLOW_ID);
  assert.equal(resolution.primary?.stage, "paused");
  assert.match(resolution.primary?.nextAction ?? "", /new approved plan/i);
  assert.match(mainSource, /Host-core never replays approved executions after a restart/);
});

test("keeps an active workflow stage through ordinary operations follow-up prompts", () => {
  const active = resolve({
    prompt: "Continue with the next task.",
    session: {
      primaryId: TEST_DRIVEN_DEVELOPMENT_WORKFLOW_ID,
      stage: "implementation",
      reasonCategory: "approved_implementation",
    },
  });
  assert.equal(active.primary?.id, TEST_DRIVEN_DEVELOPMENT_WORKFLOW_ID);
  assert.equal(active.primary?.stage, "implementation");
});

test("ships Nexus-native plan authoring and execution guidance with host approval boundaries", () => {
  const resources = [
    ["writing-plans.md", "Nexus plan authoring", "SubmitPlan"],
    ["executing-plans.md", "Nexus plan execution", "host-created plan artifact"],
  ];
  for (const [file, name, phrase] of resources) {
    const body = readFileSync(join(desktopRoot, "resources/skills", file), "utf8");
    assert.match(body, new RegExp(`name: ${name}`));
    assert.ok(body.includes(phrase), `${file} must use the existing Nexus plan flow`);
    assert.ok(!body.includes("Codex"), `${file} must not carry Codex instructions`);
  }
  assert.match(mainSource, /transitionPlanWorkflowSession/);
  assert.match(mainSource, /executionState === "completed"/);
  assert.match(mainSource, /executionState === "interrupted"/);
  assert.match(mainSource, /event\.proposal\?\.status === "interrupted"/);
});

test("activates managed Git and review workflows only for concrete lifecycle requests", () => {
  const isolation = resolve({ prompt: "Create an isolated Nexus worktree for this feature." });
  assert.equal(isolation.primary?.id, USING_GIT_WORKTREES_WORKFLOW_ID);
  assert.equal(isolation.primary?.stage, "isolation");

  const finishing = resolve({ prompt: "The implementation is complete; finish this development branch." });
  assert.equal(finishing.primary?.id, FINISHING_DEVELOPMENT_BRANCH_WORKFLOW_ID);
  assert.equal(finishing.primary?.stage, "integration");

  const review = resolve({ prompt: "Please request a code review for this completed change." });
  assert.equal(review.primary?.id, REQUESTING_CODE_REVIEW_WORKFLOW_ID);
  assert.equal(review.primary?.stage, "review_requested");

  const feedback = resolve({ prompt: "Apply the code review feedback after checking each finding." });
  assert.equal(feedback.primary?.id, RECEIVING_CODE_REVIEW_WORKFLOW_ID);
  assert.equal(feedback.primary?.stage, "review_feedback");

  assert.equal(resolve({ prompt: "What is a git worktree?" }).primary?.id, AGENT_OPERATIONS_WORKFLOW_ID);
  assert.equal(resolve({ prompt: "Explain code review best practices." }).primary?.id, AGENT_OPERATIONS_WORKFLOW_ID);
});

test("ships Nexus-native Git and review guidance without granting authority", () => {
  const resources = [
    ["using-git-worktrees.md", "Nexus managed Git worktrees", "GitWorktree"],
    ["finishing-a-development-branch.md", "Nexus development branch completion", "no-push-by-default"],
    ["requesting-code-review.md", "Nexus code review request", "Review evidence"],
    ["receiving-code-review.md", "Nexus code review reception", "Verify each finding"],
  ];
  for (const [file, name, phrase] of resources) {
    const body = readFileSync(join(desktopRoot, "resources/skills", file), "utf8");
    assert.match(body, new RegExp(`name: ${name}`));
    assert.ok(body.includes(phrase), `${file} must carry the Nexus contract`);
    assert.ok(!body.includes("Codex"), `${file} must not carry Codex instructions`);
  }
  assert.match(runtimeSource, /GitWorktree/);
  assert.match(runtimeSource, /AGENT_CORE_TOOL_NAMES[\s\S]*"GitWorktree"/);
  assert.match(mainSource, /s\.setLocalTool\("GitWorktree"/);
});

test("activates delegation workflows only for concrete bounded work", () => {
  const parallel = resolve({ prompt: "Investigate these three independent read-only areas in parallel and report the results." });
  assert.equal(parallel.primary?.id, DISPATCHING_PARALLEL_AGENTS_WORKFLOW_ID);
  assert.equal(parallel.primary?.stage, "parallelizing");

  const execution = resolve({ prompt: "Use subagents to execute the approved implementation plan with bounded tasks." });
  assert.equal(execution.primary?.id, SUBAGENT_DRIVEN_DEVELOPMENT_WORKFLOW_ID);
  assert.equal(execution.primary?.stage, "delegated_execution");

  assert.equal(resolve({ prompt: "What are parallel agents?" }).primary?.id, AGENT_OPERATIONS_WORKFLOW_ID);
  assert.equal(resolve({ prompt: "Explain how subagents work." }).primary?.id, AGENT_OPERATIONS_WORKFLOW_ID);
});

test("ships Nexus-native delegation guidance with isolation and ownership boundaries", () => {
  const resources = [
    ["dispatching-parallel-agents.md", "Nexus parallel task coordination", "read-only"],
    ["subagent-driven-development.md", "Nexus subagent-driven development", "GitWorktree"],
  ];
  for (const [file, name, phrase] of resources) {
    const body = readFileSync(join(desktopRoot, "resources/skills", file), "utf8");
    assert.match(body, new RegExp(`name: ${name}`));
    assert.ok(body.includes(phrase), `${file} must carry the Nexus contract`);
    assert.ok(!body.includes("Codex"), `${file} must not carry Codex instructions`);
  }
  assert.match(runtimeSource, /ownership/);
  assert.match(runtimeSource, /concurrent mutation work is refused/);
});
