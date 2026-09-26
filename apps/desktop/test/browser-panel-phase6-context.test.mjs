import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
const strip = await readFile(new URL("../src/components/workpanel/BrowserReadinessStrip.tsx", import.meta.url), "utf8");
const source = await readFile(new URL("../src/components/workpanel/BrowserSourceRow.tsx", import.meta.url), "utf8");
test("context strip keeps safe source labels without page or session identifiers", () => {
  for (const label of ["Opened by you", "Opened by agent", "Workspace preview", "Background session"]) assert.match(source, new RegExp(label));
  assert.doesNotMatch(source, /prompt|tool args|BrowserId|project path|sessionId/i);
});
