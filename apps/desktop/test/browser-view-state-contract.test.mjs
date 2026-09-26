import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const types = await readFile(new URL("../../../packages/shared/src/types.ts", import.meta.url), "utf8");
const protocol = await readFile(new URL("../../../packages/shared/src/protocol.ts", import.meta.url), "utf8");
const main = await readFile(new URL("../electron/main/index.ts", import.meta.url), "utf8");

test("Phase 5 keeps navigation state separate from safe Browser view state", () => {
  assert.match(types, /BrowserSource/);
  assert.match(types, /BrowserViewState/);
  assert.match(types, /readiness: BrowserReadiness/);
  assert.match(types, /safeLocation/);
  assert.match(types, /safeTitle/);
  assert.doesNotMatch(types.match(/export type BrowserViewState[^\n]*/)?.[0] ?? "", /BrowserId|WebContents|cookie|storage|screenshot|path:/i);
  assert.match(protocol, /browserGetViewState/);
  assert.match(protocol, /browserViewState/);
});

test("Phase 5 Main view-state publisher sanitizes location and title", () => {
  assert.match(main, /safeBrowserLocation/);
  assert.match(main, /url\.host\}\$\{url\.pathname\}/);
  assert.match(main, /browserViewSource/);
  assert.match(main, /workspace-preview/);
});
