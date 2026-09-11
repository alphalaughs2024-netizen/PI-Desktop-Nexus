import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const here = dirname(fileURLToPath(import.meta.url));
const desktopRoot = join(here, "..");
const repoRoot = join(desktopRoot, "../..");

const runtimeSrc = readFileSync(join(desktopRoot, "electron/main/plugin-runtime.ts"), "utf8");
const builtinSrc = readFileSync(join(desktopRoot, "electron/main/builtin-skills.ts"), "utf8");
const devToolsSrc = readFileSync(join(desktopRoot, "electron/main/plugin-dev-tools.ts"), "utf8");
const mainSrc = readFileSync(join(desktopRoot, "electron/main/index.ts"), "utf8");
const packageJson = JSON.parse(readFileSync(join(desktopRoot, "package.json"), "utf8"));
const skillDoc = readFileSync(
  join(desktopRoot, "resources/skills/plugin-development.md"),
  "utf8",
);
const operationsDoc = readFileSync(
  join(desktopRoot, "resources/skills/agent-operations.md"),
  "utf8",
);
const agentRuntimeSrc = readFileSync(
  join(repoRoot, "packages/agent-runtime/src/runtime.ts"),
  "utf8",
);
const sidecarSrc = readFileSync(join(repoRoot, "packages/agent-runtime/src/sidecar.ts"), "utf8");
const requireFromRuntime = createRequire(join(repoRoot, "packages/agent-runtime/package.json"));
const loadTypeScript = requireFromRuntime("jiti")(join(repoRoot, "packages/agent-runtime/jiti-runner.cjs"));
const { isPluginAuthoringRequest } = loadTypeScript(
  join(desktopRoot, "electron/main/builtin-skills.ts"),
);

test("the plugin runtime indexes contributed skills under caps", () => {
  assert.match(runtimeSrc, /registerSkills/);
  assert.match(runtimeSrc, /getSkills\(\)/);
  assert.match(runtimeSrc, /MAX_SKILLS_PER_PLUGIN = 32/);
  assert.match(runtimeSrc, /MAX_SKILL_BYTES = 128 \* 1024/);
  assert.match(runtimeSrc, /MAX_SKILL_DESCRIPTION_CHARS/);
  // Contributed paths must stay inside the plugin directory.
  assert.match(runtimeSrc, /resolveInsidePlugin/);
});

test("skills only reach the agent with agent.prompt.inject", () => {
  const gate = /permissions\.has\("agent\.prompt\.inject"\)/;
  assert.match(runtimeSrc, gate);
  const registerSkills = runtimeSrc.slice(runtimeSrc.indexOf("private registerSkills"));
  assert.match(registerSkills, gate);
  assert.match(registerSkills, /plugin\.skills\.skipped/);
});

test("unloading a plugin withdraws its skills", () => {
  const clear = runtimeSrc.slice(
    runtimeSrc.indexOf("private clearContributions"),
    runtimeSrc.indexOf("private registerSkills"),
  );
  assert.match(clear, /this\.skills/);
});

test("loading a skill body strips front matter and re-checks the cap", () => {
  const load = runtimeSrc.slice(
    runtimeSrc.indexOf("loadSkillBody("),
    runtimeSrc.indexOf("registerSkills"),
  );
  assert.match(load, /parseSkillFrontmatter/);
  assert.match(load, /MAX_SKILL_BYTES/);
  assert.match(load, /NOT_FOUND/);
  assert.match(load, /plugin\.skill\.load/);
});

test("bundled skill compatibility uses Nexus ids while retaining legacy loader aliases", () => {
  assert.match(builtinSrc, /nexus\/guidance\/agent-operations/);
  assert.match(builtinSrc, /nexus\/guidance\/plugin-development/);
  assert.match(builtinSrc, /LEGACY_AGENT_OPERATIONS_SKILL_ID/);
  assert.match(builtinSrc, /LEGACY_PLUGIN_DEV_SKILL_ID/);
  assert.match(operationsDoc, /name: Nexus agent operations/);
  assert.match(skillDoc, /name: Nexus plugin development/);
  assert.match(agentRuntimeSrc, /nexus\/guidance\/agent-operations/);
  assert.match(builtinSrc, /source: "builtin"/);
});

test("session Skill loading is restricted to the bounded advertised catalog", () => {
  assert.match(mainSrc, /instructionCatalogWithinBudget\(instructionCatalog\)/);
  assert.match(mainSrc, /sessionSkillIds\.get\(sessionId\)\?\.has\(id\)/);
});

test("a reloaded plugin re-indexes its skills, so an edit needs no restart", () => {
  // Hot reload runs unload/load; the catalog must be rebuilt from disk there,
  // and the body is read on every Skill call regardless.
  assert.match(runtimeSrc, /this\.registerSkills\(loaded\)/);
  assert.match(runtimeSrc.slice(runtimeSrc.indexOf("loadSkillBody(")), /readFileSync\(skill\.path/);
});

test("main marks user recipes separately from plugin guidance", () => {
  assert.match(mainSrc, /const instructionCatalog = \[/);
  assert.match(mainSrc, /\.\.\.plugins\s*\n?\s*\.getSkills\(\)/);
  assert.match(mainSrc, /source: "plugin" as const/);
  assert.match(mainSrc, /source: "user" as const/);
  assert.match(mainSrc, /\n\s+instructionCatalog,\n/);
  assert.match(mainSrc, /setLocalTool\("Skill"/);
  assert.match(mainSrc, /loadScopedPluginGuidance/);
});

test("the agent runtime advertises skills and rebuilds when the catalog changes", () => {
  assert.match(agentRuntimeSrc, /instructionCatalogPrompt/);
  assert.match(agentRuntimeSrc, /SKILL_TOOL_NAME/);
  assert.match(agentRuntimeSrc, /instructionCatalogDigest/);
  assert.match(sidecarSrc, /instructionCatalog/);
});

test("explicit plugin authoring requests activate the first-turn guidance without generic false positives", () => {
  // A missing authoring verb or missing plugin target must keep the guide out
  // of an ordinary project's first-turn catalog.
  assert.equal(isPluginAuthoringRequest("Create a Nexus plugin"), true);
  assert.equal(isPluginAuthoringRequest("Please scaffold a plugin"), true);
  assert.equal(isPluginAuthoringRequest("What are Nexus plugins?"), false);
  assert.equal(isPluginAuthoringRequest("Build this application"), false);
});

test("the operations guidance is always available while plugin guidance is scoped to a workspace or explicit authoring request", () => {
  assert.match(builtinSrc, /isPluginWorkspace/);
  assert.match(builtinSrc, /export function isPluginAuthoringRequest/);
  assert.match(builtinSrc, /schemaVersion.*number/s);
  assert.match(builtinSrc, /pluginPaths\.some/);
  assert.match(builtinSrc, /AGENT_OPERATIONS_SKILL_ID/);
  assert.match(builtinSrc, /pluginAuthoringRequested/);
  assert.match(builtinSrc, /for \(const manifest of WORKFLOW_MANIFESTS\)/);
  assert.match(builtinSrc, /manifest\.id === PLUGIN_DEV_SKILL_ID/);
  assert.match(builtinSrc, /!input\.pluginAuthoringRequested/);
  assert.match(builtinSrc, /!isPluginWorkspace\(input\.workspacePath, input\.pluginPaths\)/);
  assert.match(mainSrc, /builtinSkills\(\{/);
  assert.match(mainSrc, /pluginAuthoringRequested: isPluginAuthoringRequest\(overrides\.prompt\)/);
  assert.match(mainSrc, /prompt: req\.content/);
});

test("the on-demand operations guide carries the detailed workflow", () => {
  assert.match(operationsDoc, /^---\n/);
  assert.match(operationsDoc, /Read.*Glob.*Grep/);
  assert.match(operationsDoc, /BrowserPreview.*ToolSearch/);
  assert.match(operationsDoc, /Task.*TaskWait/);
});

test("the built-in skill body loads through the same Skill tool", () => {
  // Host-owned skills are not in any registry, so main tries them first, then
  // the user's own skills, then a plugin's — bare ids cannot collide with the
  // `<pluginId>/<skillId>` form.
  assert.match(builtinSrc, /export function loadBuiltinSkillBody/);
  assert.match(
    mainSrc,
    /loadBuiltinSkillBody\(id\) \?\?\s*\(await loadUserSkillBody\(id, projectPath\)\) \?\?\s*loadScopedPluginGuidance\(/,
  );
  assert.match(mainSrc, /const userIds = \(await activeUserSkills/);
});

test("Skill is read-only guidance in Agent, Plan, and Goal modes", () => {
  assert.match(agentRuntimeSrc, /this\.instructionCatalog\.length/);
  assert.doesNotMatch(
    agentRuntimeSrc.slice(agentRuntimeSrc.indexOf("const skillTools"), agentRuntimeSrc.indexOf("const modeTools")),
    /this\.mode === "agent"/,
  );
  const planProxy = mainSrc.slice(mainSrc.indexOf("const planLocalTool"), mainSrc.indexOf("if (method === \"project.instructions.resolve\")"));
  assert.doesNotMatch(planProxy, /requestedToolName === "Skill"/);
});

test("plugin guidance is scope-checked again when loaded on demand", () => {
  assert.match(mainSrc, /loadScopedPluginGuidance\(plugins, id, projectPath, pluginActiveInProject\)/);
});

test("the built-in skill ships as a packaged resource with a dev fallback", () => {
  const resources = packageJson.build.extraResources.map((entry) => entry.to);
  assert.ok(resources.includes("skills"), "resources/skills must be packaged");
  assert.match(builtinSrc, /process\.resourcesPath/);
  assert.match(builtinSrc, /resources\/skills/);
});

test("the built-in skill documents the constraints a plugin author will hit", () => {
  assert.match(skillDoc, /^---\n/);
  assert.match(skillDoc, /description: /);
  for (const token of [
    "PluginScaffold",
    "PluginCheck",
    "PluginPack",
    "agent.prompt.inject",
    "store-only",
    "schemaVersion",
    "pi.commands.register",
    "window.pluginBridge",
  ]) {
    assert.ok(skillDoc.includes(token), `built-in skill must mention ${token}`);
  }
  assert.doesNotMatch(skillDoc, /onLoad\(pi\)|pi\.registerCommand/);
});

test("plugin dev tools resolve paths inside the workspace and report failures", () => {
  assert.match(devToolsSrc, /resolveWithinRoot\(root, value\)/);
  assert.match(devToolsSrc, /no workspace is open/);
  assert.match(devToolsSrc, /isError: true/);
  // Scaffolding loads the plugin so the first edit is already a hot reload.
  assert.match(devToolsSrc, /registerDevPlugin\(target\.path\)/);
  assert.match(devToolsSrc, /loadPlugin\(target\.path, permissions\)/);
});

test("only PluginCheck is available outside agent mode", () => {
  const builderEnd = agentRuntimeSrc.indexOf(
    "const builtins = tools.map(exec)",
  );
  const builderStart = agentRuntimeSrc.lastIndexOf("const tools =", builderEnd);
  assert.ok(builderStart >= 0 && builderEnd > builderStart);
  const builder = agentRuntimeSrc.slice(builderStart, builderEnd);
  const agentBranchStart = builder.indexOf('if (this.mode === "agent")');
  assert.ok(agentBranchStart >= 0);
  const nonAgentBranch = builder.slice(0, agentBranchStart);
  assert.match(nonAgentBranch, /"PluginCheck"/);
  assert.doesNotMatch(nonAgentBranch, /PluginScaffold|PluginPack/);
  assert.match(
    builder.slice(agentBranchStart),
    /tools\.push\("PluginScaffold", "PluginPack"\)/,
  );
});

test("main registers the three plugin dev tools as local tools", () => {
  assert.match(mainSrc, /registerPluginDevTools\(s, \{/);
  for (const name of ["PluginScaffold", "PluginCheck", "PluginPack"]) {
    assert.ok(
      devToolsSrc.includes(`setLocalTool("${name}"`),
      `${name} must be served by main, not host-core`,
    );
  }
});
