import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
const styles = await readFile(new URL("../src/styles/work-panel.css", import.meta.url), "utf8");
test("Phase 8 reduced motion removes decorative Browser animation", () => { assert.match(styles, /prefers-reduced-motion/); assert.match(styles, /browser-diagnostics-drawer--open[\s\S]*animation: none|animation: none[\s\S]*browser-diagnostics-drawer/); assert.match(styles, /browser-readiness-strip--starting/); });
