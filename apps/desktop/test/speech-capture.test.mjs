import assert from "node:assert/strict";
import test from "node:test";
import { startSpeechRecording, recordedAudioToWav } from "../src/lib/speech-capture.ts";
import { decodeSpeechWav } from "../electron/main/speech.ts";
function installGlobals(values) {
  const descriptors = Object.fromEntries(Object.keys(values).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries(values)) Object.defineProperty(globalThis, key, { configurable: true, value });
  return () => { for (const [key, descriptor] of Object.entries(descriptors)) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; } };
}
function audioGlobals(duration = 1) {
  return {
    AudioContext: class { async decodeAudioData() { return { duration }; } async close() {} },
    OfflineAudioContext: class {
      constructor(_channels, frames) { this.frames = frames; this.destination = {}; }
      createBufferSource() { return { connect() {}, start() {} }; }
      async startRendering() { return { getChannelData: () => new Float32Array(this.frames) }; }
    },
  };
}
test("renderer WAV conversion caps delayed recording stop at the host's 60-second boundary", async () => {
  const restore = installGlobals(audioGlobals(60.2));
  try { const wav = await recordedAudioToWav(new Blob(["recording"])); assert.equal(decodeSpeechWav(wav).length, 60 * 16_000); }
  finally { restore(); }
});
test("automatic recording limit resolves the same finished promise without pressing Done", async () => {
  let limit; let stopped = 0;
  class Recorder {
    state = "inactive"; mimeType = "audio/webm";
    start() { this.state = "recording"; }
    stop() { this.state = "inactive"; this.ondataavailable({ data: new Blob(["audio"]) }); queueMicrotask(() => this.onstop()); }
  }
  const restore = installGlobals({ ...audioGlobals(), navigator: { mediaDevices: { getUserMedia: async () => ({ getTracks: () => [{ stop: () => { stopped += 1; } }] }) } },
    MediaRecorder: Recorder, window: { setTimeout: callback => { limit = callback; return 1; }, clearTimeout() {} } });
  try { const recording = await startSpeechRecording(); limit(); const wav = await recording.finished; assert.equal(decodeSpeechWav(wav).length, 16_000); assert.equal(await recording.stop(), wav); assert.equal(stopped, 1); }
  finally { restore(); }
});
test("recording cancellation releases tracks and resolves no audio", async () => {
  let stopped = 0;
  class Recorder { state = "inactive"; start() { this.state = "recording"; } stop() { this.state = "inactive"; queueMicrotask(() => this.onstop()); } }
  const restore = installGlobals({ navigator: { mediaDevices: { getUserMedia: async () => ({ getTracks: () => [{ stop: () => { stopped += 1; } }] }) } }, MediaRecorder: Recorder, window: { setTimeout: () => 1, clearTimeout() {} } });
  try { const recording = await startSpeechRecording(); recording.cancel(); assert.equal(await recording.finished, ""); assert.ok(stopped > 0); }
  finally { restore(); }
});
test("unsupported recording construction releases an already granted microphone", async () => {
  let stopped = 0;
  const restore = installGlobals({ navigator: { mediaDevices: { getUserMedia: async () => ({ getTracks: () => [{ stop: () => { stopped += 1; } }] }) } }, MediaRecorder: class { constructor() { throw new Error("unsupported format"); } } });
  try { await assert.rejects(startSpeechRecording(), /unsupported format/); assert.equal(stopped, 1); }
  finally { restore(); }
});
