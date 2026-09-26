import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
const styles = await readFile(new URL("../src/styles/work-panel.css", import.meta.url), "utf8");
test("Phase 8 uses semantic focus/state surfaces", () => { assert.match(styles, /var\(--ds-focus\)/); assert.match(styles, /var\(--ds-error\)/); assert.match(styles, /var\(--ds-warning\)/); assert.match(styles, /browser-diagnostics-row/); });
