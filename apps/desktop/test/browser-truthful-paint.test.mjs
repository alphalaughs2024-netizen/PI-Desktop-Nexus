import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const index = await readFile(new URL("../electron/main/index.ts", import.meta.url), "utf8");
const pane = await readFile(new URL("../electron/main/browser-view.ts", import.meta.url), "utf8");
const core = await readFile(new URL("../src/components/workpanel/BrowserCoreTab.tsx", import.meta.url), "utf8");

test("all foreground Browser inspection tools request visible panel activation", () => {
  for (const tool of ["browser_open", "browser_navigate", "browser_list_tabs", "browser_snapshot", "browser_wait", "browser_screenshot"]) assert.match(index, new RegExp(tool));
  assert.match(index, /browserActivationRequested/);
});

test("ready requires a painted attached native guest", () => {
  assert.match(index, /surfaceReadiness/);
  assert.match(index, /paint === "painted"/);
  assert.match(pane, /wc\.on\("paint"/);
  assert.match(pane, /paint: this\.painted/);
  assert.match(core, /surface\?\.paint === "blank"/);
});
