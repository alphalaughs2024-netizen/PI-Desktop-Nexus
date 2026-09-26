import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
const toolbar = await readFile(new URL("../src/components/workpanel/BrowserToolbar.tsx", import.meta.url), "utf8");
const empty = await readFile(new URL("../src/components/workpanel/BrowserEmptyState.tsx", import.meta.url), "utf8");
const drawer = await readFile(new URL("../src/components/workpanel/BrowserDiagnosticsDrawer.tsx", import.meta.url), "utf8");
test("Phase 8 freezes Browser semantics and labels", () => { assert.match(toolbar, /role="toolbar"/); assert.match(toolbar, /aria-haspopup="menu"/); assert.match(toolbar, /role="menuitem"/); for (const label of ["Go back", "Go forward", "Reload page", "Stop loading", "Browser address", "Capture screenshot", "Open in default browser", "More Browser actions"]) assert.match(toolbar, new RegExp(label)); for (const label of ["Retry Browser", "Open Browser diagnostics", "Reopen Browser"]) assert.match(empty, new RegExp(label)); assert.match(drawer, /role="region"/); assert.match(drawer, /browser-diagnostics-title/); });
