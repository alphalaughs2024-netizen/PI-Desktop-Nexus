import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const status = await readFile(new URL("../src/components/workpanel/BrowserOperationStatus.tsx", import.meta.url), "utf8");
const error = await readFile(new URL("../src/components/workpanel/BrowserErrorNotice.tsx", import.meta.url), "utf8");
const empty = await readFile(new URL("../src/components/workpanel/BrowserEmptyState.tsx", import.meta.url), "utf8");

test("Phase 5 preserves stable accessible state actions", () => {
  assert.match(status, /browser-operation-status/);
  assert.match(error, /browser-error-notice/);
  assert.match(empty, /Diagnostics/);
  assert.match(empty, /Retry/);
  assert.match(empty, /Reopen/);
});
