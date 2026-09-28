import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { decodeSpeechWav, transcribeSpeech } from "../electron/main/speech.ts";

function wavBase64(samples) {
  const buffer = Buffer.alloc(44 + samples.length * 2);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(buffer.length - 8, 4);
  buffer.write("WAVEfmt ", 8);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(16_000, 24);
  buffer.writeUInt32LE(32_000, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(samples.length * 2, 40);
  samples.forEach((sample, index) => buffer.writeInt16LE(sample, 44 + index * 2));
  return buffer.toString("base64");
}

test("speech WAV boundary accepts 16 kHz mono PCM and rejects other rates", () => {
  const audio = wavBase64([0, 16384, -16384]);
  assert.deepEqual([...decodeSpeechWav(audio)], [0, 0.5, -0.5]);
  const invalid = Buffer.from(audio, "base64");
  invalid.writeUInt32LE(48_000, 24);
  assert.throws(() => decodeSpeechWav(invalid.toString("base64")), /16 kHz mono PCM/);
});

test("silence is not sent to a speech provider", async () => {
  assert.equal(await transcribeSpeech(wavBase64([0, 0, 0]), undefined, tmpdir()), "");
});

test("hosted transcription sends audio and reads a named environment key", async () => {
  let auth;
  let body;
  const server = createServer(async (req, res) => {
    auth = req.headers.authorization;
    body = await new Promise((resolve) => {
      const parts = [];
      req.on("data", (chunk) => parts.push(chunk));
      req.on("end", () => resolve(Buffer.concat(parts).toString("utf8")));
    });
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ text: "  hello nexus  " }));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const directory = await mkdtemp(join(tmpdir(), "nexus-speech-test-"));
  process.env.NEXUS_SPEECH_TEST_KEY = "test-only-key";
  try {
    const address = server.address();
    const text = await transcribeSpeech(wavBase64([100, -100]), {
      transcription: "hosted",
      endpoint: `http://127.0.0.1:${address.port}/audio/transcriptions`,
      model: "test-model",
      apiKeyEnv: "NEXUS_SPEECH_TEST_KEY",
    }, directory);
    assert.equal(text, "hello nexus");
    assert.equal(auth, "Bearer test-only-key");
    assert.match(body, /test-model/);
    assert.match(body, /speech\.wav/);
  } finally {
    delete process.env.NEXUS_SPEECH_TEST_KEY;
    server.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test("hosted transcription refuses plaintext non-loopback URLs", async () => {
  await assert.rejects(
    transcribeSpeech(wavBase64([100]), { transcription: "hosted", endpoint: "http://example.com/speech" }, tmpdir()),
    /HTTPS or local HTTP/,
  );
});
