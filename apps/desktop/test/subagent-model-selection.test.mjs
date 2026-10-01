import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
const require = createRequire(new URL("../../../packages/agent-runtime/package.json", import.meta.url));
const load = require("jiti")(import.meta.url);
const { builtinSubagentModels } = load("../electron/main/subagent-model-preferences.ts");
const { saveSubagentModelSelection } = load("../electron/main/subagent-model-selection.ts");
const { loadSubagentDefinitions, resolveSubagentProviders } = await import("@pi-desktop/agent-runtime");
const providers = [
  { id: "endpoint-a", name: "Gateway", vendorKey: "custom", enabled: true, authKind: "none", models: [{ id: "family/model:free" }] },
  { id: "endpoint-b", name: "Gateway", vendorKey: "custom", enabled: true, authKind: "none", models: [{ id: "family/model:free" }] },
];
function fixture() {
  const dir = mkdtempSync(join(tmpdir(), "nexus-model-picker-"));
  const calls = [];
  const host = { call: async (method, params) => {
    calls.push({ method, params });
    if (method === "providers.list") return { providers };
    if (method === "agents.setModel") return { subagent: { id: params.id, model: params.model } };
    throw new Error("unexpected host method");
  } };
  return { dir, calls, host };
}

test("built-in pin persists the exact endpoint/model and only changes its model field", async () => {
  const { dir, host } = fixture();
  const baseline = await loadSubagentDefinitions(null, { userDocuments: [] });
  const model = { providerId: "endpoint-b", modelId: "family/model:free" };
  await saveSubagentModelSelection(dir, host, { id: "explorer", source: "builtin", model });
  const preferences = builtinSubagentModels(dir);
  assert.deepEqual(preferences, { explorer: model });
  const loaded = await loadSubagentDefinitions(null, { userDocuments: [], builtinModels: preferences });
  const explorer = loaded.definitions.find(item => item.name === "explorer");
  assert.deepEqual(explorer, { ...baseline.definitions.find(item => item.name === "explorer"), model });
  const resolved = await resolveSubagentProviders({ definitions: loaded.definitions, providers, getSecret: async () => undefined });
  assert.equal(resolved.providers["endpoint-b/family/model:free"].id, "endpoint-b");
  await saveSubagentModelSelection(dir, host, { id: "explorer", source: "builtin", model: null });
  assert.deepEqual(builtinSubagentModels(dir), {});
  const current = await loadSubagentDefinitions(null, { userDocuments: [], builtinModels: builtinSubagentModels(dir) });
  assert.equal(current.definitions.find(item => item.name === "explorer").model, undefined);
});

test("custom row changes only the model document field and Current explicitly clears it", async () => {
  const { dir, host, calls } = fixture();
  await saveSubagentModelSelection(dir, host, { id: "mine", source: "user", model: { providerId: "endpoint-a", modelId: "family/model:free" } });
  assert.deepEqual(calls.at(-1), { method: "agents.setModel", params: { id: "mine", model: "endpoint-a/family/model:free" } });
  await saveSubagentModelSelection(dir, host, { id: "mine", source: "user", model: null });
  assert.deepEqual(calls.at(-1).params, { id: "mine", model: "" });
});

test("stale selection and invalid preset fail without losing an existing pin", async () => {
  const { dir, host } = fixture();
  const selection = { id: "fixer", source: "builtin", model: { providerId: "endpoint-a", modelId: "family/model:free" } };
  await saveSubagentModelSelection(dir, host, selection);
  const path = join(dir, "agent-capabilities", "builtin-subagent-models.json");
  const before = readFileSync(path, "utf8");
  await assert.rejects(saveSubagentModelSelection(dir, host, { ...selection, model: { providerId: "removed", modelId: "family/model:free" } }), /no fallback/);
  await assert.rejects(saveSubagentModelSelection(dir, host, { ...selection, model: { providerId: "endpoint-a", modelId: "different-model" } }), /no fallback/);
  await assert.rejects(saveSubagentModelSelection(dir, host, { ...selection, id: "missing" }), /not found/);
  assert.equal(readFileSync(path, "utf8"), before);
  writeFileSync(path, "invalid");
  assert.throws(() => builtinSubagentModels(dir), /Cannot read saved/);
  await assert.rejects(saveSubagentModelSelection(dir, host, { ...selection, model: null }), /Cannot read saved/);
  assert.equal(readFileSync(path, "utf8"), "invalid");
});
