import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
const drawer = await readFile(new URL("../src/components/workpanel/BrowserDiagnosticsDrawer.tsx", import.meta.url), "utf8");
const frame = await readFile(new URL("../src/components/workpanel/WorkPanelFrame.tsx", import.meta.url), "utf8");
test("Phase 7 preserves focus targets", () => { assert.match(drawer, /headingRef/); assert.match(drawer, /Escape/); assert.match(drawer, /Close Browser diagnostics/); assert.match(frame, /Maximize Work Panel/); assert.match(frame, /Dock Work Panel/); });
