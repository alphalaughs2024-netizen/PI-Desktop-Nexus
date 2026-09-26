import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const policy = await readFile(new URL("../electron/main/browser-policy.ts", import.meta.url), "utf8");
const typed = await readFile(new URL("../electron/main/browser-typed-tools.ts", import.meta.url), "utf8");
const core = await readFile(new URL("../src/components/workpanel/BrowserCoreTab.tsx", import.meta.url), "utf8");
const shared = await readFile(new URL("../../../packages/shared/src/types.ts", import.meta.url), "utf8");

test("about:blank is a safe Browser destination and AI can request a new tab", () => {
  assert.match(policy, /about:blank/);
  assert.match(typed, /newTab=true/);
  assert.match(typed, /about:blank/);
  assert.match(shared, /createTab\?: boolean/);
  assert.match(core, /New tab/);
  assert.match(core, /browserNavigate\("about:blank"/);
});
