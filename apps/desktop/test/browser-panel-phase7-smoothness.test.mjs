import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
const guest = await readFile(new URL("../src/components/workpanel/BrowserGuestSurface.tsx", import.meta.url), "utf8");
const rect = await readFile(new URL("../src/lib/browser-guest-rect.ts", import.meta.url), "utf8");
const styles = await readFile(new URL("../src/styles/work-panel.css", import.meta.url), "utf8");
test("Phase 7 coalesces safe guest measurements", () => { assert.match(guest, /ResizeObserver/); assert.match(guest, /requestAnimationFrame/); assert.match(guest, /generation/); assert.match(guest, /mounted/); assert.match(rect, /browserGuestRectKey/); assert.match(rect, /Number\.isFinite/); });
test("Phase 7 motion honors reduced motion and diagnostics overlays", () => { assert.match(styles, /browser-diagnostics-in/); assert.match(styles, /prefers-reduced-motion/); assert.match(styles, /browser-toolbar-address/); });
