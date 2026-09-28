import { mkdir } from "node:fs/promises";
import type { SpeechSettings } from "@pi-desktop/shared";
import { transcribeLocalParakeet } from "./speech-local.ts";

const SAMPLE_RATE = 16_000;
const MAX_AUDIO_BYTES = SAMPLE_RATE * 2 * 60 + 44;
const WHISPER_MODEL = "Xenova/whisper-tiny";

type Transcriber = (audio: Float32Array, options: Record<string, unknown>) => Promise<unknown>;
let localTranscriber: Promise<Transcriber> | null = null;

export function decodeSpeechWav(base64: string): Float32Array {
  if (typeof base64 !== "string" || base64.length > Math.ceil(MAX_AUDIO_BYTES / 3) * 4 + 4) {
    throw new Error("Recording exceeds the 60-second limit");
  }
  const wav = Buffer.from(base64, "base64");
  if (wav.length < 44 || wav.length > MAX_AUDIO_BYTES || wav.toString("ascii", 0, 4) !== "RIFF" || wav.toString("ascii", 8, 12) !== "WAVE") {
    throw new Error("Invalid speech recording");
  }
  let format = 0;
  let channels = 0;
  let sampleRate = 0;
  let bitsPerSample = 0;
  let pcm: Buffer | null = null;
  for (let offset = 12; offset + 8 <= wav.length;) {
    const size = wav.readUInt32LE(offset + 4);
    const end = offset + 8 + size;
    if (end > wav.length) throw new Error("Invalid speech recording");
    const tag = wav.toString("ascii", offset, offset + 4);
    if (tag === "fmt " && size >= 16) {
      format = wav.readUInt16LE(offset + 8);
      channels = wav.readUInt16LE(offset + 10);
      sampleRate = wav.readUInt32LE(offset + 12);
      bitsPerSample = wav.readUInt16LE(offset + 22);
    } else if (tag === "data") {
      pcm = wav.subarray(offset + 8, end);
    }
    offset = end + (size & 1);
  }
  if (format !== 1 || channels !== 1 || sampleRate !== SAMPLE_RATE || bitsPerSample !== 16 || !pcm || pcm.length % 2 !== 0) {
    throw new Error("Speech recording must be 16 kHz mono PCM");
  }
  const samples = new Float32Array(pcm.length / 2);
  for (let i = 0; i < samples.length; i += 1) samples[i] = pcm.readInt16LE(i * 2) / 32768;
  return samples;
}

async function getLocalTranscriber(cacheDir: string): Promise<Transcriber> {
  if (!localTranscriber) {
    localTranscriber = (async () => {
      await mkdir(cacheDir, { recursive: true });
      const transformers = await import("@huggingface/transformers");
      transformers.env.cacheDir = cacheDir;
      transformers.env.allowRemoteModels = true;
      return await transformers.pipeline("automatic-speech-recognition", WHISPER_MODEL, {
        device: "cpu",
        dtype: "q8",
      }) as unknown as Transcriber;
    })().catch((error: unknown) => {
      localTranscriber = null;
      throw error;
    });
  }
  return localTranscriber;
}

function hostedEndpoint(settings: SpeechSettings): URL {
  const url = new URL(settings.endpoint ?? "");
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (url.protocol !== "https:" && !(loopback && url.protocol === "http:")) {
    throw new Error("Speech endpoint must use HTTPS or local HTTP");
  }
  if (url.username || url.password) throw new Error("Speech endpoint cannot contain credentials");
  return url;
}

export async function transcribeSpeech(
  audioBase64: string,
  settings: SpeechSettings | undefined,
  cacheDir: string,
): Promise<string> {
  const samples = decodeSpeechWav(audioBase64);
  if (samples.length === 0) return "";
  let peak = 0;
  for (const sample of samples) peak = Math.max(peak, Math.abs(sample));
  if (peak < 300 / 32768) return "";
  if (settings?.transcription !== "hosted") {
    if (settings?.localModel !== "whisper-tiny") {
      return transcribeLocalParakeet(samples, settings?.localModel ?? "parakeet-tdt-0.6b-v2-int8", cacheDir);
    }
    const transcriber = await getLocalTranscriber(cacheDir);
    const result = await transcriber(samples, { chunk_length_s: 30 });
    return typeof result === "object" && result !== null && "text" in result
      ? String(result.text).trim()
      : "";
  }

  const endpoint = hostedEndpoint(settings);
  const keyName = settings.apiKeyEnv?.trim();
  if (keyName && !/^[A-Z_][A-Z0-9_]*$/.test(keyName)) throw new Error("Invalid speech API key environment variable");
  const key = keyName ? process.env[keyName] : undefined;
  if (keyName && !key) throw new Error(`Speech API key environment variable ${keyName} is unavailable`);
  const wav = Buffer.from(audioBase64, "base64");
  const form = new FormData();
  form.set("file", new Blob([new Uint8Array(wav)], { type: "audio/wav" }), "speech.wav");
  form.set("model", settings.model?.trim() || "whisper-1");
  const response = await fetch(endpoint, {
    method: "POST",
    headers: key ? { Authorization: `Bearer ${key}` } : undefined,
    body: form,
    signal: AbortSignal.timeout(90_000),
  });
  if (!response.ok) throw new Error(`Speech provider returned HTTP ${response.status}`);
  const data: unknown = await response.json();
  if (!data || typeof data !== "object" || !("text" in data) || typeof data.text !== "string") {
    throw new Error("Speech provider returned no transcript");
  }
  return data.text.trim();
}
