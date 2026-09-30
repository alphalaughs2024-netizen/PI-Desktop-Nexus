import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";
import { LocalSpeechWorker } from "../electron/main/speech-local.ts";
import { SpeechService } from "../electron/main/speech-service.ts";
class FakeWorker extends EventEmitter {
  messages = [];
  terminated = false;
  postMessage(value) { this.messages.push(value); }
  async terminate() { this.terminated = true; }
}
test("worker cancellation rejects owned work and late old exits cannot corrupt a retry", async () => {
  const workers = [];
  const client = new LocalSpeechWorker(() => { const worker = new FakeWorker(); workers.push(worker); return worker; });
  const abort = new AbortController();
  const first = client.transcribe(new Float32Array([0.1]), "parakeet-tdt-0.6b-v2-int8", "cache", abort.signal);
  abort.abort();
  await assert.rejects(first, /canceled/);
  assert.equal(workers[0].terminated, true);
  const second = client.transcribe(new Float32Array([0.2]), "parakeet-tdt-0.6b-v3-int8", "cache");
  workers[0].emit("exit", 1);
  workers[1].emit("message", { id: workers[1].messages[0].id, text: "retry succeeded" });
  assert.equal(await second, "retry succeeded");
  client.close();
});
test("worker timeout terminates decoding and a later request creates a new worker", async () => {
  const workers = [];
  const client = new LocalSpeechWorker(() => { const worker = new FakeWorker(); workers.push(worker); return worker; }, 15);
  await assert.rejects(client.transcribe(new Float32Array([0.1]), "parakeet-tdt-0.6b-v2-int8", "cache"), /timed out/);
  assert.equal(workers[0].terminated, true);
  const retry = client.transcribe(new Float32Array([0.1]), "parakeet-tdt-0.6b-v2-int8", "cache");
  workers[1].emit("message", { id: workers[1].messages[0].id, text: "works" });
  assert.equal(await retry, "works");
  client.close();
});
test("worker progress is nonterminal and recognition errors do not strand pending requests", async () => {
  const worker = new FakeWorker(); const progress = [];
  const client = new LocalSpeechWorker(() => worker);
  const first = client.transcribe(new Float32Array([0.1]), "parakeet-tdt-0.6b-v2-int8", "cache", undefined, value => progress.push(value));
  const id = worker.messages[0].id;
  worker.emit("message", { id, progress: { stage: "transcribing" } });
  worker.emit("message", { id, error: "invalid weights" });
  await assert.rejects(first, /invalid weights/);
  assert.deepEqual(progress, [{ stage: "transcribing" }]);
  client.close();
});
test("speech request can be canceled before settings finish and retried without a late result", async () => {
  let resolveSettings; let calls = 0;
  const settings = new Promise(resolve => { resolveSettings = resolve; });
  const service = new SpeechService("cache", () => settings, () => {}, async () => { calls += 1; return "text"; });
  const first = service.start("first", "audio");
  await assert.rejects(service.start("first", "audio"), /already exists/);
  await assert.rejects(service.start("other", "audio"), /active/);
  service.cancel("first");
  await assert.rejects(first, /canceled/);
  resolveSettings({ transcription: "local" });
  assert.equal(await service.start("retry", "audio"), "text");
  assert.equal(calls, 1);
  service.close();
});
test("speech progress and partial cancellation stay scoped to the originating request", async () => {
  let signal; let notify; let finish; const progress = [];
  const service = new SpeechService("cache", async () => undefined, value => progress.push(value), async (_audio, _settings, _cache, options) => {
    signal = options.signal; notify = options.onProgress;
    notify({ stage: "downloading", downloadedBytes: 100, totalBytes: 200 });
    return new Promise(resolve => { finish = resolve; });
  });
  const request = service.start("owned", "audio");
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(progress[0].requestId, "owned");
  service.cancel("unrelated"); assert.equal(signal.aborted, false);
  service.cancel("owned"); await assert.rejects(request, /canceled/);
  notify({ stage: "transcribing" }); finish("late text");
  assert.equal(signal.aborted, true); assert.equal(progress.length, 1);
  service.close();
});
