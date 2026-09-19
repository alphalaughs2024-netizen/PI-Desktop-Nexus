import assert from "node:assert/strict";
import { readFile, rm, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { register } from "node:module";
import { pathToFileURL } from "node:url";

register(pathToFileURL(join(process.cwd(), "apps/desktop/test/helpers/ts-import-hooks.mjs")));

const { IncidentIndex, Logger } = await import("../electron/main/logger.ts");
const [typesSource, mainSource, hostSource, rpcSpecSource] = await Promise.all([
  readFile(new URL("../../../packages/shared/src/types.ts", import.meta.url), "utf8"),
  readFile(new URL("../electron/main/index.ts", import.meta.url), "utf8"),
  readFile(new URL("../../../crates/host-core/src/rpc/mod.rs", import.meta.url), "utf8"),
  readFile(new URL("../../../docs/spec/03-runtime/06-host-rpc-protocol.md", import.meta.url), "utf8"),
]);

test("incident summaries count stable codes without retaining raw messages", () => {
  let now = 1_000;
  const incidents = new IncidentIndex({
    now: () => now,
    maxEntries: 3,
    ttlMs: 100,
  });
  incidents.record({ channel: "app", category: "updater", level: "warn", code: "UPDATE_NETWORK" });
  incidents.record({ channel: "app", category: "updater", level: "warn", code: "UPDATE_NETWORK" });
  incidents.record({ channel: "app", category: "runtime", level: "error", code: "HOST_UNAVAILABLE" });
  incidents.record({ channel: "app", category: "diagnostics", level: "warn", code: "THIRD_PARTY" });
  const first = incidents.snapshot();
  assert.equal(first.length, 3);
  const network = first.find((item) => item.code === "UPDATE_NETWORK");
  assert.equal(network?.count, 2);
  assert.equal(network?.firstSeen, "1970-01-01T00:00:01.000Z");
  assert.equal(network?.lastSeen, "1970-01-01T00:00:01.000Z");
  assert.equal(network?.fingerprint, "app/updater/UPDATE_NETWORK");
  assert.equal(first.some((item) => item.code === "THIRD_PARTY"), true);
  assert.equal("message" in first[0], false);
  assert.equal("data" in first[0], false);
  incidents.record({ channel: "app", category: "runtime", level: "error", code: "TOKEN_PRIVATE_VALUE" });
  assert.equal(incidents.snapshot().some((item) => item.code === "TOKEN_PRIVATE_VALUE"), false);
  incidents.record({ channel: "app", category: "runtime", level: "error", code: "path/to/private.log" });
  assert.equal(incidents.snapshot().some((item) => item.code.includes("private")), false);
  now += 101;
  assert.deepEqual(incidents.snapshot(), []);

  const bounded = new IncidentIndex({ now: () => 2_000, maxEntries: 2 });
  bounded.record({ channel: "app", category: "runtime", level: "warn", code: "ONE" });
  bounded.record({ channel: "app", category: "runtime", level: "warn", code: "TWO" });
  bounded.record({ channel: "app", category: "runtime", level: "warn", code: "THREE" });
  assert.equal(bounded.snapshot().length, 2);
  assert.equal(bounded.snapshot().some((item) => item.code === "ONE"), false);
});

test("logger exposes bounded incident summaries while raw logs remain separate", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "pi-desktop-health-"));
  try {
    const logger = new Logger(dataDir, "debug");
    logger.app("updater", "warn", "raw transport detail must stay in the log", {
      code: "UPDATE_NETWORK",
      data: { responseBody: "private response" },
    });
    const summaries = logger.getIncidentSummaries();
    assert.equal(summaries[0].code, "UPDATE_NETWORK");
    assert.equal(summaries[0].count, 1);
    assert.equal("message" in summaries[0], false);
    assert.equal("data" in summaries[0], false);
    const raw = await readFile(join(dataDir, "logs", "app", "updater.log"), "utf8");
    assert.match(raw, /private response/);
  } finally {
    await rm(dataDir, { recursive: true, force: true });
  }
});

test("app.health keeps compatibility fields and adds safe runtime diagnostics", () => {
  for (const field of ["ok", "protocolVersion", "version", "uptimeMs", "toolBudget"]) {
    assert.match(hostSource, new RegExp(`\\\"${field}\\\"`), field);
  }
  assert.match(hostSource, /\"workspace\"/);
  assert.match(hostSource, /\"capabilities\"/);
  assert.match(mainSource, /logger\.getIncidentSummaries\(\)/);
  assert.match(mainSource, /updater\.getDiagnosticSnapshot\(\)/);
  assert.match(mainSource, /summonShortcutStatus/);
  assert.match(mainSource, /code: "SHORTCUT_UNAVAILABLE"/);
  assert.match(typesSource, /export type DiagnosticIncidentSummary = \{/);
  assert.match(typesSource, /incidents\?: DiagnosticIncidentSummary\[\]/);
  assert.match(typesSource, /runtime\?: AppHealthRuntime/);
  assert.match(rpcSpecSource, /app\.health[\s\S]*workspace[\s\S]*capabilities/);
});
