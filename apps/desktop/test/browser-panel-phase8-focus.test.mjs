import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
const core = await readFile(new URL("../src/components/workpanel/BrowserCoreTab.tsx", import.meta.url), "utf8");
const drawer = await readFile(new URL("../src/components/workpanel/BrowserDiagnosticsDrawer.tsx", import.meta.url), "utf8");
test("Phase 8 protects diagnostics and address focus", () => { assert.match(core, /diagnosticsTriggerRef/); assert.match(core, /\.focus\(\)/); assert.match(drawer, /headingRef\.current\?\.focus/); assert.match(drawer, /Escape/); });
