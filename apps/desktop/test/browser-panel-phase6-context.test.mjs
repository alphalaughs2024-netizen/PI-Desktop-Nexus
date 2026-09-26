import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
const strip = await readFile(new URL("../src/components/workpanel/BrowserReadinessStrip.tsx", import.meta.url), "utf8");
test("context strip keeps safe source labels and maximized location", () => {
  for (const label of ["Opened by you", "Opened by agent", "Previewing workspace file"]) assert.match(strip, new RegExp(label));
  assert.match(strip, /presentation === "maximized"/);
  assert.doesNotMatch(strip, /prompt|tool args|BrowserId|project path/i);
});
