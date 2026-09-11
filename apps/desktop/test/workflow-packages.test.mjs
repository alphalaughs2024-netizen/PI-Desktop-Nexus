import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const desktopRoot = join(here, "..");
const repoRoot = join(desktopRoot, "../..");
const requireFromRuntime = createRequire(join(repoRoot, "packages/agent-runtime/package.json"));
const loadTypeScript = requireFromRuntime("jiti")(join(repoRoot, "packages/agent-runtime/jiti-runner.cjs"));
const packages = loadTypeScript(join(desktopRoot, "electron/main/workflow-packages.ts"));

function workspace() {
  return mkdtempSync(join(tmpdir(), "nexus-workflow-package-"));
}

function draft(overrides = {}) {
  return {
    name: "Release checklist",
    description: "Prepare a local release with evidence.",
    body: "# Release checklist\n\nCollect fresh validation evidence before release.",
    version: "1.0.0",
    supportedModes: ["agent"],
    requiredCapabilities: ["core-agent-tools", "terminal-tools", "test-execution"],
    priority: 70,
    defaultStage: "verification",
    automatic: true,
    activationTerms: ["prepare", "release"],
    fixtures: [{ positivePrompt: "Prepare the release checks.", negativePrompt: "What is a release?", expectedStage: "verification" }],
    level: "global",
    ...overrides,
  };
}

test("rejects malformed, reserved, and unknown-capability workflow packages", () => {
  assert.equal(packages.validateWorkflowPackageInput(draft({ id: "nexus/override" })).ok, false);
  assert.equal(packages.validateWorkflowPackageInput(draft({ id: "project/wrong-root" })).ok, false);
  assert.equal(packages.validateWorkflowPackageInput(draft({ requiredCapabilities: ["computer-use"] })).ok, false);
  assert.equal(packages.validateWorkflowPackageInput(draft({ activationTerms: ["a.*"] })).ok, false);
  assert.equal(packages.validateWorkflowPackageInput(draft({ fixtures: [] })).ok, false);
});

test("makes compatible authored packages available to the shared resolver without giving authority", () => {
  const dataDir = workspace();
  try {
    const record = packages.createWorkflowPackage(dataDir, draft());
    const manifests = packages.activeWorkflowPackageManifests(dataDir);
    assert.equal(manifests[0]?.id, record.id);
    assert.deepEqual(manifests[0]?.requiredCapabilities, ["core-agent-tools", "terminal-tools", "test-execution"]);
  } finally {
    rmSync(dataDir, { recursive: true, force: true });
  }
});

test("scaffolds a versioned package in the selected root and preserves the capability boundary", () => {
  const dataDir = workspace();
  try {
    const record = packages.createWorkflowPackage(dataDir, draft());
    assert.equal(record.id, "user/release-checklist");
    assert.equal(record.version, "1.0.0");
    assert.equal(record.compatibility.status, "compatible");
    const read = packages.readWorkflowPackage(dataDir, record.id);
    assert.match(read.body, /Release checklist/);
    assert.equal(read.workflow.requiredCapabilities.includes("computer-use"), false);
    assert.match(read.path, /agents[\\/]workflows[\\/]release-checklist[\\/]workflow\.json$/);
  } finally {
    rmSync(dataDir, { recursive: true, force: true });
  }
});

test("previews structured activation and runs positive and negative fixtures without retaining prompts", () => {
  const dataDir = workspace();
  try {
    const record = packages.createWorkflowPackage(dataDir, draft());
    const positive = packages.previewWorkflowPackage(dataDir, record.id, { prompt: "Prepare the release checks.", mode: "agent" });
    const negative = packages.previewWorkflowPackage(dataDir, record.id, { prompt: "What is a release?", mode: "agent" });
    assert.equal(positive.wouldActivate, true);
    assert.equal(negative.wouldActivate, false);
    const result = packages.runWorkflowPackageFixtures(dataDir, record.id);
    assert.deepEqual(result.fixtures.map((fixture) => fixture.passed), [true]);
    assert.equal(JSON.stringify(result).includes("Prepare the release"), false);
  } finally {
    rmSync(dataDir, { recursive: true, force: true });
  }
});

test("never makes incompatible or disabled package metadata into authority", () => {
  const dataDir = workspace();
  try {
    const record = packages.createWorkflowPackage(dataDir, draft({ requiredCapabilities: ["subagent-orchestration"] }));
    assert.equal(packages.previewWorkflowPackage(dataDir, record.id, { prompt: "Prepare release", mode: "agent", capabilities: ["core-agent-tools"] }).wouldActivate, false);
    packages.setWorkflowPackageEnabled(dataDir, record.id, false);
    assert.equal(packages.previewWorkflowPackage(dataDir, record.id, { prompt: "Prepare release", mode: "agent" }).reason, "disabled");
  } finally {
    rmSync(dataDir, { recursive: true, force: true });
  }
});
