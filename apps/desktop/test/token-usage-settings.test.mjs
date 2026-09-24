import assert from "node:assert/strict";
import { access } from "node:fs/promises";
import { constants } from "node:fs";
import { readFile } from "node:fs/promises";
import test from "node:test";

const search = await readFile(
  new URL("../src/lib/settings-search.ts", import.meta.url),
  "utf8",
);
const settingsPage = await readFile(
  new URL("../src/pages/SettingsPage.tsx", import.meta.url),
  "utf8",
);
const api = await readFile(new URL("../src/lib/api.ts", import.meta.url), "utf8");

test("settings has a native usage destination backed by host token history", () => {
  assert.match(search, /id: "usage"/);
  assert.match(search, /settings\.nav\.usage/);
  assert.match(settingsPage, /UsagePage/);
  assert.match(settingsPage, /tab === "usage"/);
  assert.match(api, /getTokenUsageHistory/);
});

test("native usage page exists", async () => {
  await access(
    new URL("../src/components/settings/UsagePage.tsx", import.meta.url),
    constants.F_OK,
  );
});

test("native usage page exposes the Token Insights dashboard surfaces", async () => {
  const usage = await readFile(
    new URL("../src/components/settings/UsagePage.tsx", import.meta.url),
    "utf8",
  );
  assert.match(usage, /usage-heatmap/);
  assert.match(usage, /usage-kpi-grid/);
  assert.match(usage, /usageModelsTitle/);
  assert.match(usage, /<output className="usage-hero-title"/);
  assert.match(usage, /aria-pressed/);
  assert.match(usage, /usage-filter-control/);
  assert.match(usage, /usageClearFilters/);
  assert.match(usage, /usage-cost-card/);
  assert.match(usage, /usage-dashboard-section/);
  assert.match(usage, /usage-page-header/);
  assert.match(usage, /usage-privacy-popover/);
  assert.match(usage, /usage-primary-summary/);
  assert.doesNotMatch(usage, /Future provider wiring/);
  assert.match(usage, /usage-local-overview/);
  assert.match(usage, /usage-cost-sources/);
  assert.match(usage, /usage-provider-accounts/);
  assert.match(usage, /usage-token-activity/);
  assert.match(usage, /Catalog estimate/);
  assert.match(usage, /Provider reported/);
  assert.match(usage, /Unpriced/);
  assert.match(usage, /Unavailable/);
});

test("chat spend popover has session and provider-account UI without billing wiring", async () => {
  const app = await readFile(new URL("../src/App.tsx", import.meta.url), "utf8");
  const chrome = await readFile(new URL("../src/styles/chrome.css", import.meta.url), "utf8");
  assert.match(app, /Spend &amp; limits/);
  assert.match(app, /This Nexus session/);
  assert.match(app, /Provider account/);
  assert.match(app, /XKIRO/);
  assert.match(app, /View usage details/);
  assert.match(chrome, /cost-summary-provider-grid/);
  assert.match(chrome, /width: min\(360px/);
  assert.doesNotMatch(app, /contextVault|billing|usage\/history|api\.xkiro/);
});

test("cost popover state is initialized before its provider-account effect", async () => {
  const app = await readFile(new URL("../src/App.tsx", import.meta.url), "utf8");
  const stateIndex = app.indexOf('const [costOpen, setCostOpen] = useState(false);');
  const effectIndex = app.indexOf('if (!costOpen) return;');
  assert.ok(stateIndex >= 0);
  assert.ok(effectIndex >= 0);
  assert.ok(stateIndex < effectIndex);
});

test("provider account refresh uses the canonical whitelisted IPC channel", async () => {
  const protocol = await readFile(new URL("../../../packages/shared/src/protocol.ts", import.meta.url), "utf8");
  const api = await readFile(new URL("../src/lib/api.ts", import.meta.url), "utf8");
  const main = await readFile(new URL("../electron/main/index.ts", import.meta.url), "utf8");
  assert.match(protocol, /providerAccountGet:\s*"pi-desktop\/provider-account\/get"/);
  assert.match(api, /IPC\.invoke\.providerAccountGet/);
  assert.match(main, /handle\(IPC\.invoke\.providerAccountGet/);
});
