import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const main = readFileSync(resolve("electron/main/index.ts"), "utf8");
const broker = readFileSync(resolve("electron/main/browser-broker.ts"), "utf8");
const cdp = readFileSync(resolve("electron/main/browser-cdp.ts"), "utf8");
const host = readFileSync(resolve("electron/main/browser-host.ts"), "utf8");
const view = readFileSync(resolve("electron/main/browser-view.ts"), "utf8");
const typed = readFileSync(resolve("electron/main/browser-typed-tools.ts"), "utf8");
const runtime = readFileSync(resolve("../../packages/agent-runtime/src/runtime.ts"), "utf8");

test("listing tabs reveals the Browser panel for the active conversation", () => {
  assert.match(main, /\["browser_open", "browser_navigate", "browser_list_tabs", "browser_snapshot"/);
  assert.match(main, /browserActivationRequested[\s\S]*focus: "panel"/);
});

test("typed Browser inputs reach their handlers", () => {
  assert.match(runtime, /browser_evaluate: \{ browserId: Type\.String\(\), expression: Type\.String\(\) \}/);
  assert.match(runtime, /browser_wait: \{ browserId: Type\.String\(\), condition: Type\.Union/);
  assert.match(typed, /broker\.wait\(args\.condition,[\s\S]*args\.timeoutMs\)/);
  assert.match(typed, /broker\.type\([\s\S]*Boolean\(args\.clearFirst\)/);
  assert.match(typed, /broker\.keypress\([\s\S]*args\.modifiers/);
  assert.match(cdp, /Input\.insertText/);
  assert.match(cdp, /Input\.dispatchKeyEvent/);
});

test("screenshot results give the agent a saved path without image base64", () => {
  assert.match(host, /if \(!scratch\) throw new Error/);
  assert.match(host, /writeFileSync\(path, Buffer\.from\(shot\.data, "base64"\)\)/);
  assert.match(main, /\(\(\{ data: _data, \.\.\.metadata \}\) => metadata\)/);
});

test("wait and page links use live guest state", () => {
  assert.match(broker, /condition\.kind === "page_load" && state\?\.url && !state\.isLoading/);
  assert.match(broker, /code === "TIMEOUT"/);
  assert.match(view, /setWindowOpenHandler[\s\S]*wc\.loadURL\(allowed\)/);
});
