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
