import assert from "node:assert/strict";
import test from "node:test";
import { dirname, join } from "node:path";
import { register } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
register(pathToFileURL(join(here, "helpers/ts-import-hooks.mjs")));

const {
  automaticFailureKey,
  classifyUpdateFailure,
  shouldReportAutomaticFailure,
} = await import("../electron/main/update-failure.ts");

test("classifies safe updater failure categories", () => {
  assert.equal(classifyUpdateFailure(new Error("No published versions on GitHub")), "feed-unavailable");
  assert.equal(classifyUpdateFailure(new Error("request failed: ECONNRESET")), "network");
  assert.equal(classifyUpdateFailure(new Error("repository configuration is invalid")), "configuration");
  assert.equal(classifyUpdateFailure({ code: "UPDATE_CHECK_TIMEOUT" }), "timeout");
});

test("automatic updater failures de-duplicate by class and current version", () => {
  const first = automaticFailureKey("network", "0.0.4");
  assert.equal(shouldReportAutomaticFailure(null, first), true);
  assert.equal(shouldReportAutomaticFailure(first, first), false);
  assert.equal(shouldReportAutomaticFailure(first, automaticFailureKey("timeout", "0.0.4")), true);
  assert.equal(shouldReportAutomaticFailure(first, automaticFailureKey("network", "0.0.5")), true);
});
