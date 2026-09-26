import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
const styles = await readFile(new URL("../src/styles/work-panel.css", import.meta.url), "utf8");
test("Phase 7 has bounded motion and no guest animation", () => { assert.match(styles, /160ms/); assert.match(styles, /prefers-reduced-motion/); assert.doesNotMatch(styles, /browser-guest-surface[^\n]*animation/); });
