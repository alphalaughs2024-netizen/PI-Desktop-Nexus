import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { chromium } from "playwright";

const output = resolve(process.argv[2]);
await mkdir(output, { recursive: true });
const browser = await chromium.connectOverCDP("http://127.0.0.1:9341");
const page = browser.contexts().flatMap(context => context.pages()).find(page => page.url().startsWith("http://localhost:5173"));
assert.ok(page, "Nexus renderer must be running");
const errors = [];
page.on("pageerror", error => errors.push(error.message));
const originalViewport = page.viewportSize();
await page.evaluate(async () => {
  const { api } = await import("/src/lib/api.ts");
  const { useAppStore } = await import("/src/stores/app-store.ts");
  const catalog = await api.subagentCatalog();
  const original = { list: api.listUserSubagents, catalog: api.subagentCatalog, save: api.setSubagentModel, providers: useAppStore.getState().providers, page: useAppStore.getState().page, tab: useAppStore.getState().settingsTab };
  const builtin = catalog.builtins.map(item => ({ ...item, model: undefined }));
  const custom = [{ id: "fixture-reviewer", name: "Fixture reviewer", description: "Fixture agent", tools: ["Read"], enabled: true, scope: { kind: "global" } }];
  const calls = [];
  let failNext = false;
  api.listUserSubagents = async () => ({ subagents: custom.map(item => ({ ...item })) });
  api.subagentCatalog = async () => ({ ...catalog, builtins: builtin.map(item => ({ ...item })) });
  api.setSubagentModel = async (id, source, model) => {
    if (failNext) { failNext = false; throw new Error("Fixture save failure"); }
    calls.push({ id, source, model });
    if (source === "builtin") builtin.find(item => item.name === id).model = model ?? undefined;
    else custom.find(item => item.id === id).model = model ? `${model.providerId}/${model.modelId}` : undefined;
    return { id, model };
  };
  const modelId = "family/exact-model-with-a-long-name:free";
  useAppStore.setState({ providers: ["a", "b"].map(id => ({ id, name: `Fixture provider ${id}`, vendorKey: "custom", enabled: true, hasSecret: false, authKind: "none", models: [{ id: modelId }] })) });
  useAppStore.getState().setPage("chat");
  window.modelPickerFixture = {
    calls, fail: () => { failNext = true; },
    restore: () => {
      api.listUserSubagents = original.list; api.subagentCatalog = original.catalog; api.setSubagentModel = original.save;
      useAppStore.setState({ providers: original.providers, page: original.page, settingsTab: original.tab });
    },
  };
});
await page.locator(".agent-subagents-page").waitFor({ state: "hidden" });
await page.evaluate(async () => { const { useAppStore } = await import("/src/stores/app-store.ts"); useAppStore.getState().setSettingsTab("subagents"); });

try {
  const picker = name => page.getByRole("button", { name: new RegExp(`^Model for ${name}:`) });
  await picker("explorer").waitFor();
  await picker("fixture-reviewer").waitFor();
  assert.equal(await page.locator(".subagent-row-model").count(), 6);
  await picker("explorer").click();
  const search = page.getByRole("textbox", { name: "Filter models" });
  await search.fill("provider b");
  await search.press("ArrowDown");
  await search.press("Enter");
  await page.getByRole("button", { name: /^Model for explorer: Fixture provider b/ }).waitFor();
  await picker("fixture-reviewer").click();
  await page.getByRole("option", { name: "family/exact-model-with-a-long-name:free", exact: true }).first().click();
  await page.getByRole("button", { name: /^Model for fixture-reviewer: Fixture provider a/ }).waitFor();
  await picker("explorer").click();
  await page.getByRole("option", { name: "Current", exact: true }).click();
  await page.getByRole("button", { name: "Model for explorer: Current", exact: true }).waitFor();
  await page.evaluate(() => window.modelPickerFixture.fail());
  await picker("fixture-reviewer").click();
  await page.getByRole("option", { name: "Current", exact: true }).click();
  await page.getByText("Fixture save failure", { exact: true }).waitFor();
  assert.ok(await page.getByRole("button", { name: /^Model for fixture-reviewer: Fixture provider a/ }).count());
  const bounds = [];
  for (const [width, height] of [[1280, 900], [720, 800]]) {
    await page.setViewportSize({ width, height });
    await picker("fixer").click();
    await page.getByRole("textbox", { name: "Filter models" }).fill("exact-model");
    const menu = await page.locator(".provider-service-menu.is-open").boundingBox();
    assert.ok(menu && menu.x >= 0 && menu.y >= 0 && menu.x + menu.width <= width + 1 && menu.y + menu.height <= height + 1);
    const row = await picker("fixer").boundingBox();
    assert.ok(row && row.x + row.width <= width);
    await page.screenshot({ path: join(output, `picker-${width}.png`) });
    await page.getByRole("textbox", { name: "Filter models" }).press("Escape");
    bounds.push({ width, height, menu });
  }
  const calls = await page.evaluate(() => window.modelPickerFixture.calls);
  assert.deepEqual(calls, [
    { id: "explorer", source: "builtin", model: { providerId: "b", modelId: "family/exact-model-with-a-long-name:free" } },
    { id: "fixture-reviewer", source: "user", model: { providerId: "a", modelId: "family/exact-model-with-a-long-name:free" } },
    { id: "explorer", source: "builtin", model: null },
  ]);
  assert.deepEqual(errors, []);
  await writeFile(join(output, "report.json"), JSON.stringify({ passed: true, calls, bounds, errors, note: "Live renderer with in-memory providers and save responses; no profile model selections were changed." }, null, 2));
  console.log("Model picker renderer checks passed: " + output);
} finally {
  await page.evaluate(() => { window.modelPickerFixture.restore(); delete window.modelPickerFixture; });
  if (originalViewport) await page.setViewportSize(originalViewport);
  await browser.close();
}
