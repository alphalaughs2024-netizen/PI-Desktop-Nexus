import assert from "node:assert/strict";
import test from "node:test";
import { BrowserBroker } from "../electron/main/browser-broker.ts";

function host(overrides = {}) {
  const calls = [];
  return { calls, host: { navigate: async () => { calls.push("navigate"); return { url: "https://example.com" }; }, action: (value) => calls.push(value), snapshot: async () => ({ tree: "", url: "", title: "" }), screenshot: async () => ({ mimeType: "image/png", data: "" }), click: async () => calls.push("click"), fill: async () => calls.push("fill"), evaluate: async () => 1, console: () => ({ messages: [] }), cdpCommand: async () => null, previewWorkspaceFile: async () => ({ ok: true }), ...overrides } };
}

test("broker preserves request metadata and serializes mutations", async () => {
  const { host: target, calls } = host();
  const broker = new BrowserBroker(target);
  const result = await broker.navigate({ url: "https://example.com" }, "session-a", { mode: "agent" });
  assert.equal(result.ok, true);
  assert.match(result.requestId, /^browser-/);
  assert.equal(calls[0], "navigate");
});

test("broker denies mutating actions in Plan mode", async () => {
  const { host: target } = host();
  const broker = new BrowserBroker(target);
  const result = await broker.click("e1", { mode: "plan" });
  assert.equal(result.ok, false);
  assert.equal(result.code, "BROWSER_POLICY_BLOCKED");
});

test("broker reports ambiguous mutation timeout without replay", async () => {
  const { host: target } = host({ click: async () => new Promise(() => {}) });
  const broker = new BrowserBroker(target);
  const resultPromise = broker.click("e1");
  const result = await Promise.race([resultPromise, new Promise((resolve) => setTimeout(() => resolve("timeout"), 11000))]);
  assert.notEqual(result, "timeout");
  assert.equal(result.code, "BROWSER_POSSIBLY_APPLIED");
  assert.equal(result.possiblyApplied, true);
});
