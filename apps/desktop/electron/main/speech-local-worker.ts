import { createRequire } from "node:module";
import { join } from "node:path";
import { parentPort } from "node:worker_threads";

type Model = "parakeet-tdt-0.6b-v2-int8" | "parakeet-tdt-0.6b-v3-int8";
type Request = { id: number; samples: Float32Array; model: Model; modelDir: string };
type Stream = { acceptWaveform: (audio: { samples: Float32Array; sampleRate: number }) => void; free?: () => void };
type Recognizer = { createStream: () => Stream; decode: (stream: Stream) => void; getResult: (stream: Stream) => { text?: string }; free?: () => void };

const require = createRequire(import.meta.url);
let loaded: { model: Model; modelDir: string; recognizer: Recognizer } | undefined;
let queue = Promise.resolve();

async function recognizerFor(dir: string, model: Model): Promise<Recognizer> {
  if (loaded?.model === model && loaded.modelDir === dir) return loaded.recognizer;
  loaded?.recognizer.free?.();
  loaded = undefined;
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
  loaded = { model, modelDir: dir, recognizer };
  return recognizer;
}

async function transcribe({ id, samples, model, modelDir }: Request): Promise<string> {
  if (model !== "parakeet-tdt-0.6b-v2-int8" && model !== "parakeet-tdt-0.6b-v3-int8") {
    throw new Error("Unsupported local speech model");
  }
  const recognizer = await recognizerFor(modelDir, model);
  parentPort?.postMessage({ id, progress: { stage: "transcribing" } });
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
