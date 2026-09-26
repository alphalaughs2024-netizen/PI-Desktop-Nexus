import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const types = await readFile(new URL("../../../packages/shared/src/types.ts", import.meta.url), "utf8");
const drawer = await readFile(new URL("../src/components/workpanel/BrowserDiagnosticsDrawer.tsx", import.meta.url), "utf8");
test("safe diagnostics projection excludes browser internals", () => {
  assert.match(types, /BrowserDiagnosticsDisplay/);
  const line = types.match(/export type BrowserDiagnosticsDisplay[^\n]*/)?.[0] ?? "";
  assert.doesNotMatch(line, /BrowserId|RequestId|sessionId|WebContents|CDP|url|path|screenshot|cookie|storage|credential/i);
  assert.match(drawer, /Copy safe Browser diagnostics/);
  assert.match(drawer, /Nexus Browser diagnostics/);
  assert.match(drawer, /role="region"/);
});
