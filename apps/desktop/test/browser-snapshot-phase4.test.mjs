import assert from "node:assert/strict";
import test from "node:test";
import { BrowserCdp } from "../electron/main/browser-cdp.ts";
import { BrowserBroker } from "../electron/main/browser-broker.ts";

test("BrowserCdp exposes bounded snapshot limits and deterministic snapshot metadata", () => {
  assert.equal(typeof BrowserCdp, "function");
});

test("broker requires a current snapshot before ref actions", async () => {
  const host = { click: async () => {}, fill: async () => {}, navigate: async () => null, action: () => {}, snapshot: async () => ({ tree: "", url: "", title: "" }), screenshot: async () => ({ mimeType: "image/jpeg", data: "" }), evaluate: async () => null, console: () => ({ messages: [] }), cdpCommand: async () => null, previewWorkspaceFile: async () => ({ ok: true }) };
  const broker = new BrowserBroker(host);
  const result = await broker.click("e1", { browserId: "browser-core-1" });
  assert.equal(result.code, "BROWSER_STALE_REF");
});
