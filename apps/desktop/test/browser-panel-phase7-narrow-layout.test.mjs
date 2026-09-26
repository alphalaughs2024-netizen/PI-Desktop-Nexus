import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
const styles = await readFile(new URL("../src/styles/work-panel.css", import.meta.url), "utf8");
const toolbar = await readFile(new URL("../src/components/workpanel/BrowserToolbar.tsx", import.meta.url), "utf8");
test("Phase 7 keeps narrow controls usable", () => { assert.match(styles, /max-width: 420px/); assert.match(toolbar, /browser-toolbar-overflow/); assert.match(styles, /min-width: 96px/); });
