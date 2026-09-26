import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
const guest = await readFile(new URL("../src/components/workpanel/BrowserGuestSurface.tsx", import.meta.url), "utf8");
test("Phase 7 guest bounds remain owned by BrowserGuestSurface", () => { assert.doesNotMatch(guest, /BrowserHost|BrowserCdp|WebContents|from "electron"/); assert.match(guest, /visible: false/); assert.match(guest, /browserCoreSurfaceSet/); });
