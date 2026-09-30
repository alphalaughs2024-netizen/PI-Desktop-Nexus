import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { PersistenceOutbox, codexSteeringAppend } from "../electron/main/persistence-outbox.ts";

const message = { id: "steering-message", role: "user", content: "Reply EMERALD", steering: true,
  status: "complete", createdAt: "2026-09-30T15:49:29.000Z" };
const envelope = { sessionId: "session", turnId: "original-turn", ts: 1, event: { type: "message_end", message } };

test("accepted native steering retains message and original host turn identity", () => {
  assert.deepEqual(codexSteeringAppend(envelope, true), { key: "message:session:steering-message",
    sessionId: "session", turnId: "original-turn", message });
});

test("ordinary prompts, pi events, incomplete messages and delegate rows are not appended again", () => {
  assert.equal(codexSteeringAppend(envelope, false), undefined);
  assert.equal(codexSteeringAppend({ ...envelope, turnId: undefined }, true), undefined);
  assert.equal(codexSteeringAppend({ ...envelope, parentToolCallId: "delegate" }, true), undefined);
  for (const patch of [{ steering: false }, { role: "assistant" }, { status: "aborted" }]) {
    assert.equal(codexSteeringAppend({ ...envelope, event: { type: "message_end", message: { ...message, ...patch } } }, true), undefined);
  }
  assert.equal(codexSteeringAppend({ ...envelope, event: { type: "lifecycle", lifecycle: { kind: "steering_failed" } } }, true), undefined);
});

test("accepted steering survives host outage and app restart and drains once", async () => {
  const dir = await mkdtemp(join(tmpdir(), "nexus-steering-outbox-"));
  const outbox = new PersistenceOutbox(dir, () => {});
  const entry = codexSteeringAppend(envelope, true);
  await outbox.enqueue(entry, () => null); await outbox.enqueue(entry, () => null);
  const stored = JSON.parse(await readFile(join(dir, "session-message-outbox.json"), "utf8"));
  assert.equal(stored.length, 1); assert.equal(stored[0].message.content, "Reply EMERALD");
  const calls = [];
  const host = { isAvailable: () => true, call: async (method, params) => { calls.push({ method, params }); } };
  const recovered = new PersistenceOutbox(dir, () => {});
  await recovered.flush(() => host); await recovered.flush(() => host);
  assert.equal(calls.length, 1); assert.equal(calls[0].method, "session.appendMessage");
  assert.deepEqual(calls[0].params, { sessionId: "session", turnId: "original-turn", message });
  assert.deepEqual(JSON.parse(await readFile(join(dir, "session-message-outbox.json"), "utf8")), []);
});

test("main routes accepted steering through the durable outbox", async () => {
  const main = await readFile(new URL("../electron/main/index.ts", import.meta.url), "utf8");
  assert.match(main, /codexSteeringAppend\(envelope, codexEngineEnabled\)/);
  assert.match(main, /persistenceOutbox\.enqueue\(steeringAppend, \(\) => host\)/);
});
