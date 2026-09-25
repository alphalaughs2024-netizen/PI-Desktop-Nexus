import assert from "node:assert/strict";
import test from "node:test";
import { BrowserBroker } from "../electron/main/browser-broker.ts";

function host() { return { navigate: async () => ({ url: "https://example.com" }), action: () => {}, snapshot: async () => ({ tree: "", url: "", title: "" }), screenshot: async () => ({ mimeType: "image/png", data: "" }), click: async () => {}, fill: async () => {}, evaluate: async () => null, console: () => ({ messages: [] }), cdpCommand: async () => null, previewWorkspaceFile: async () => ({ ok: true }) }; }

test("Phase 3 keeps one opaque browser identity and list/open reuse it", async () => {
  const broker = new BrowserBroker(host());
  const first = broker.listTabs();
  const opened = await broker.open();
  const second = broker.listTabs();
  assert.equal(first.length, 1);
  assert.equal(first[0].browserId, second[0].browserId);
  assert.equal(opened.ok, true);
  assert.notEqual(first[0].browserId, "singleton");
});

test("Phase 3 records guest generation on lifecycle changes", () => {
  const broker = new BrowserBroker(host());
  const initial = broker.listTabs()[0].guestGeneration;
  broker.guestDisposed();
  assert.equal(broker.listTabs()[0].state, "unavailable");
  broker.guestReady();
  assert.equal(broker.listTabs()[0].state, "ready");
  assert.ok(broker.listTabs()[0].guestGeneration > initial);
});
