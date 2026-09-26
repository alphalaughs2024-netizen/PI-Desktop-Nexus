import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [core, broker] = await Promise.all([
  readFile(new URL("../src/components/workpanel/BrowserCoreTab.tsx", import.meta.url), "utf8"),
  readFile(new URL("../electron/main/browser-broker.ts", import.meta.url), "utf8"),
]);

test("renderer maps failures to stable safe copy and clears operations", () => {
  assert.match(core, /finally \{ setOperation\(""\); \}/);
  assert.doesNotMatch(core, /catch \(error\)[^}]*error\.message/);
  assert.match(core, /Browser action failed\. Inspect the Browser state and retry\./);
  assert.match(core, /The Browser timed out\. Retry is safe\.|BROWSER_TIMEOUT/);
});

test("broker preserves possibly-applied semantics without replay", () => {
  assert.match(broker, /BROWSER_POSSIBLY_APPLIED/);
  assert.match(broker, /possiblyApplied/);
  assert.match(broker, /this\.queue = chained/);
});
