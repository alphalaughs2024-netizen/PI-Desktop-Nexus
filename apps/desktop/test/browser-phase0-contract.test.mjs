import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const adr = await readFile(new URL("../../../docs/adr/0234-browser-built-in-capability-contract.md", import.meta.url), "utf8");
const shared = await readFile(new URL("../../../packages/shared/src/types.ts", import.meta.url), "utf8");

test("Browser Phase 0 contract freezes built-in ownership and compatibility boundary", () => {
  assert.match(adr, /Browser is a core Nexus capability/);
  assert.match(adr, /exactly one core Browser tool/);
  assert.match(adr, /pi\.browser\.\*.*compatibility/);
  assert.match(adr, /BROWSER_POSSIBLY_APPLIED/);
  assert.match(adr, /contextIsolation: true/);
});

test("Browser Phase 0 shared identities and result envelope are additive", () => {
  for (const name of ["BrowserId", "BrowserRequestId", "BrowserSnapshotId", "BrowserElementRef", "BrowserRequestContext", "BrowserErrorCode", "BrowserResult"]) assert.match(shared, new RegExp(`export type ${name}`));
});
