import assert from "node:assert/strict";
import test from "node:test";
import { rendererPermissionAllowed } from "../electron/main/renderer-permissions.ts";

for (const stage of ["request", "check"]) {
  test(`${stage}: Nexus can copy text, guests cannot access the clipboard`, () => {
    assert.equal(rendererPermissionAllowed(10, 10, "clipboard-sanitized-write", {}, stage), true);
    for (const requester of [10, 11, undefined]) {
      assert.equal(rendererPermissionAllowed(10, requester, "clipboard-read", {}, stage), false);
      assert.equal(rendererPermissionAllowed(10, requester, "clipboard-sanitized-write", {}, stage), requester === 10);
      assert.equal(rendererPermissionAllowed(10, requester, "notifications", {}, stage), false);
    }
  });

  test(`${stage}: microphone remains audio-only and scoped to Nexus`, () => {
    const audio = stage === "request" ? { mediaTypes: ["audio"] } : { mediaType: "audio" };
    assert.equal(rendererPermissionAllowed(10, 10, "media", audio, stage), true);
    assert.equal(rendererPermissionAllowed(10, 11, "media", audio, stage), false);
    assert.equal(rendererPermissionAllowed(10, undefined, "media", audio, stage), false);
    for (const details of [{}, { mediaTypes: ["video"], mediaType: "video" }, { mediaTypes: ["audio", "video"], mediaType: "unknown" }]) {
      assert.equal(rendererPermissionAllowed(10, 10, "media", details, stage), false);
    }
  });
}
