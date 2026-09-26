import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
const styles = await readFile(new URL("../src/styles/work-panel.css", import.meta.url), "utf8");
test("Phase 8 narrow layout preserves essential Browser controls", () => { assert.match(styles, /max-width: 420px/); assert.match(styles, /min-width: 96px/); assert.match(styles, /browser-diagnostics-drawer--docked/); });
