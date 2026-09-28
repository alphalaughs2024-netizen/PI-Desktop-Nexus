import { createWriteStream } from "node:fs";
import { mkdir, mkdtemp, rename, rm, stat } from "node:fs/promises";
import { createRequire } from "node:module";
import { basename, join } from "node:path";
import { spawn } from "node:child_process";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { parentPort } from "node:worker_threads";

type Model = "parakeet-tdt-0.6b-v2-int8" | "parakeet-tdt-0.6b-v3-int8";
type Request = { id: number; samples: Float32Array; model: Model; cacheDir: string };
type Stream = { acceptWaveform: (audio: { samples: Float32Array; sampleRate: number }) => void; free?: () => void };
type Recognizer = { createStream: () => Stream; decode: (stream: Stream) => void; getResult: (stream: Stream) => { text?: string }; free?: () => void };

const require = createRequire(import.meta.url);
const MODEL_PREFIX = "sherpa-onnx-nemo-";
const REQUIRED_FILES = ["encoder.int8.onnx", "decoder.int8.onnx", "joiner.int8.onnx", "tokens.txt"];
let loaded: { model: Model; recognizer: Recognizer } | undefined;
let queue = Promise.resolve();

async function complete(dir: string): Promise<boolean> {
  const files = await Promise.all(REQUIRED_FILES.map(async (file) => {
    try { return (await stat(join(dir, file))).size > 0; } catch { return false; }
  }));
  return files.every(Boolean);
}

async function extract(archive: string, destination: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn("tar", ["-xf", archive, "-C", destination], { windowsHide: true });
    child.on("error", reject);
    child.on("exit", (code) => code === 0 ? resolve() : reject(new Error(`Model extraction failed (${code})`)));
  });
}

async function modelDirectory(cacheDir: string, model: Model): Promise<string> {
  const root = join(cacheDir, "parakeet");
  const name = `${MODEL_PREFIX}${model}`;
  const target = join(root, name);
  if (await complete(target)) return target;
  await mkdir(root, { recursive: true });
  const staging = await mkdtemp(join(root, ".download-"));
  try {
    const url = `https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/${name}.tar.bz2`;
    const response = await fetch(url);
    if (!response.ok || !response.body) throw new Error(`Parakeet model download failed (HTTP ${response.status})`);
    const archive = join(staging, basename(new URL(url).pathname));
    await pipeline(Readable.fromWeb(response.body as never), createWriteStream(archive));
    await extract(archive, staging);
    const extracted = join(staging, name);
    if (!(await complete(extracted))) throw new Error("Downloaded Parakeet model is incomplete");
    await rm(target, { recursive: true, force: true });
    await rename(extracted, target);
    return target;
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
}

async function recognizerFor(cacheDir: string, model: Model): Promise<Recognizer> {
  if (loaded?.model === model) return loaded.recognizer;
  const dir = await modelDirectory(cacheDir, model);
  const sherpa = require("sherpa-onnx-node") as { OfflineRecognizer: new (config: unknown) => Recognizer };
  const recognizer = new sherpa.OfflineRecognizer({
    featConfig: { sampleRate: 16_000, featureDim: 80 },
    modelConfig: {
      transducer: {
        encoder: join(dir, "encoder.int8.onnx"),
        decoder: join(dir, "decoder.int8.onnx"),
        joiner: join(dir, "joiner.int8.onnx"),
      },
      tokens: join(dir, "tokens.txt"), modelType: "nemo_transducer", numThreads: 2, provider: "cpu", debug: 0,
    },
    decodingMethod: "greedy_search", maxActivePaths: 4,
  });
  loaded?.recognizer.free?.();
  loaded = { model, recognizer };
  return recognizer;
}

async function transcribe({ samples, model, cacheDir }: Request): Promise<string> {
  if (model !== "parakeet-tdt-0.6b-v2-int8" && model !== "parakeet-tdt-0.6b-v3-int8") {
    throw new Error("Unsupported local speech model");
  }
  const recognizer = await recognizerFor(cacheDir, model);
  const stream = recognizer.createStream();
  try {
    let peak = 0;
    for (const sample of samples) peak = Math.max(peak, Math.abs(sample));
    const gain = peak > 0 && peak < 0.6 ? Math.min(50, 0.6 / peak) : 1;
    if (gain !== 1) samples = samples.map((sample) => sample * gain);
    stream.acceptWaveform({ samples, sampleRate: 16_000 });
    recognizer.decode(stream);
    return recognizer.getResult(stream).text?.trim() ?? "";
  } finally {
    stream.free?.();
  }
}

parentPort?.on("message", (request: Request) => {
  queue = queue.then(async () => {
    try {
      const text = await transcribe(request);
      parentPort?.postMessage({ id: request.id, text });
    } catch (error) {
      parentPort?.postMessage({ id: request.id, error: error instanceof Error ? error.message : String(error) });
    }
  });
});
