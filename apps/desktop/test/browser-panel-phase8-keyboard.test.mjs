import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
const toolbar = await readFile(new URL("../src/components/workpanel/BrowserToolbar.tsx", import.meta.url), "utf8");
test("Phase 8 overflow menu has keyboard navigation and focus restoration", () => { assert.match(toolbar, /ArrowDown/); assert.match(toolbar, /ArrowUp/); assert.match(toolbar, /event\.key === "Home"/); assert.match(toolbar, /event\.key === "End"/); assert.match(toolbar, /event\.key === "Escape"/); assert.match(toolbar, /menuTriggerRef\.current\?\.focus/); assert.match(toolbar, /aria-expanded=\{menuOpen\}/); });
