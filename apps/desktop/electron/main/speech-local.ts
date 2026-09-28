import { existsSync } from "node:fs";
import { Worker } from "node:worker_threads";
import type { SpeechSettings } from "@pi-desktop/shared";

type ParakeetModel = Exclude<SpeechSettings["localModel"], "whisper-tiny" | undefined>;
type WorkerReply = { id: number; text?: string; error?: string };

let worker: Worker | undefined;
let nextId = 0;
const pending = new Map<number, { resolve: (text: string) => void; reject: (error: Error) => void }>();

function speechWorker(): Worker {
  if (worker) return worker;
  const builtWorker = new URL("./speech-local-worker.js", import.meta.url);
  const current = new Worker(existsSync(builtWorker) ? builtWorker : new URL("./speech-local-worker.ts", import.meta.url));
  worker = current;
  current.on("message", ({ id, text, error }: WorkerReply) => {
    const request = pending.get(id);
    if (!request) return;
    pending.delete(id);
    if (error) request.reject(new Error(error));
    else request.resolve(text ?? "");
  });
  const fail = (error: Error) => {
    if (worker === current) worker = undefined;
    for (const request of pending.values()) request.reject(error);
    pending.clear();
  };
  current.on("error", fail);
  current.on("exit", (code) => fail(new Error(`Local speech worker exited (${code})`)));
  return current;
}

export function transcribeLocalParakeet(samples: Float32Array, model: ParakeetModel, cacheDir: string): Promise<string> {
  if (model !== "parakeet-tdt-0.6b-v2-int8" && model !== "parakeet-tdt-0.6b-v3-int8") {
    return Promise.reject(new Error("Unsupported local speech model"));
  }
  return new Promise((resolve, reject) => {
    const id = ++nextId;
    pending.set(id, { resolve, reject });
    try {
      speechWorker().postMessage({ id, samples, model, cacheDir });
    } catch (error) {
      pending.delete(id);
      reject(error);
    }
  });
}
