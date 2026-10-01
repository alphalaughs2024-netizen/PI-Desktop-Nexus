import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";

const require = createRequire(import.meta.url);
const { transformSync } = createRequire(require.resolve("vite"))("esbuild");
const source = readFileSync(new URL("../src/lib/browser-composer-bridge.ts", import.meta.url), "utf8");
const module = { exports: {} };
vm.runInNewContext(transformSync(source, { loader: "ts", format: "cjs" }).code, { module, exports: module.exports, require: () => ({}) });
const history = module.exports.browserComposerHistory;
const message = (id, role, content) => ({ id, role, content, createdAt: id, thinking: "private", toolArgs: { secret: "hidden" }, attachments: [{ path: "private.png" }] });

test("floating history includes only bounded conversation text and reports truncation", () => {
  const input = Array.from({ length: 30 }, (_, id) => message(id, id % 2 ? "assistant" : "user", "hello"));
  input.push(message(31, "tool", "large tool result"));
  const output = history(input, "Current chat");
  assert.equal(output.title, "Current chat");
  assert.equal(output.messages.length, 24);
  assert.equal(output.messages[0].id, 6);
  assert.equal(output.truncated, true);
  assert.ok(output.messages.every(value => !value.thinking && !value.toolArgs && !value.attachments && value.role !== "tool"));
  const limited = history(Array.from({ length: 10 }, (_, id) => message(id, "assistant", "x".repeat(20000))), "Large chat");
  assert.equal(limited.messages.reduce((sum, value) => sum + value.content.length, 0), 48000);
  assert.ok(limited.messages.every(value => value.content.length <= 12000));
  assert.equal(limited.truncated, true);
  assert.equal(history([message(1, "user", "Hello"), message(2, "assistant", "")], "Small").truncated, false);
});
