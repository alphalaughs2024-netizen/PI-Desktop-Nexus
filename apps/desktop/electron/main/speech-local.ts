import { existsSync } from "node:fs";
import { Worker } from "node:worker_threads";
import { ensureParakeetModel, type ParakeetModel, type SpeechProgress } from "./speech-models.ts";

type WorkerReply = { id: number; text?: string; error?: string; progress?: SpeechProgress };
type Pending = { resolve: (text: string) => void; reject: (error: Error) => void; cleanup: () => void; worker: Worker; progress?: (value: SpeechProgress) => void };

export class LocalSpeechWorker {
  private worker?: Worker;
  private nextId = 0;
  private pending = new Map<number, Pending>();
  private readonly createWorker: () => Worker;
  private readonly timeoutMs: number;
  constructor(createWorker: () => Worker = () => {
    const built = new URL("./speech-local-worker.js", import.meta.url);
    return new Worker(existsSync(built) ? built : new URL("./speech-local-worker.ts", import.meta.url));
  }, timeoutMs = 90_000) { this.createWorker = createWorker; this.timeoutMs = timeoutMs; }

  private fail(current: Worker, error: Error): void {
    if (this.worker === current) this.worker = undefined;
    for (const [id, request] of this.pending) {
      if (request.worker !== current) continue;
      this.pending.delete(id); request.cleanup(); request.reject(error);
    }
  }
  private connect(): Worker {
    if (this.worker) return this.worker;
    const current = this.createWorker();
    this.worker = current;
    current.on("message", ({ id, text, error, progress }: WorkerReply) => {
      const request = this.pending.get(id);
      if (!request || request.worker !== current) return;
      if (progress) { request.progress?.(progress); return; }
      this.pending.delete(id); request.cleanup();
      if (error) request.reject(new Error(error)); else request.resolve(text ?? "");
    });
    current.on("error", error => this.fail(current, error));
    current.on("exit", code => this.fail(current, new Error("Local speech worker exited (" + code + ")")));
    return current;
  }
  transcribe(samples: Float32Array, model: ParakeetModel, modelDir: string, signal?: AbortSignal, progress?: (value: SpeechProgress) => void): Promise<string> {
    signal?.throwIfAborted();
    const current = this.connect();
    return new Promise((resolve, reject) => {
      const id = ++this.nextId;
      const abort = () => {
        this.fail(current, new Error("Speech transcription canceled"));
        void current.terminate();
      };
      const timer = setTimeout(() => {
        this.fail(current, new Error("Local speech transcription timed out. Please retry"));
        void current.terminate();
      }, this.timeoutMs);
      this.pending.set(id, { resolve, reject, worker: current, progress, cleanup: () => {
        clearTimeout(timer); signal?.removeEventListener("abort", abort);
      } });
      signal?.addEventListener("abort", abort, { once: true });
      try {
        // Transfer a private copy: no caller's samples remain detached or mutable.
        const copy = samples.slice();
        current.postMessage({ id, samples: copy, model, modelDir }, [copy.buffer]);
      } catch (error) {
        this.fail(current, error instanceof Error ? error : new Error(String(error)));
        void current.terminate();
      }
    });
  }
  close(): void {
    const current = this.worker;
    if (!current) return;
    this.fail(current, new Error("Speech service closed"));
    void current.terminate();
  }
}
const localWorker = new LocalSpeechWorker();
export function closeLocalSpeech(): void { localWorker.close(); }
export async function transcribeLocalParakeet(samples: Float32Array, model: ParakeetModel, cacheDir: string, options: {
  signal?: AbortSignal; onProgress?: (progress: SpeechProgress) => void;
} = {}): Promise<string> {
  const modelDir = await ensureParakeetModel(cacheDir, model, options);
  options.signal?.throwIfAborted();
  options.onProgress?.({ stage: "loading" });
  return localWorker.transcribe(samples, model, modelDir, options.signal, options.onProgress);
}
