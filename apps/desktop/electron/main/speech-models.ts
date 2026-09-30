import { mkdir, mkdtemp, rename, rm, stat, statfs } from "node:fs/promises";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";

export type ParakeetModel = "parakeet-tdt-0.6b-v2-int8" | "parakeet-tdt-0.6b-v3-int8";
export type SpeechProgress = { stage: "downloading" | "loading" | "transcribing"; downloadedBytes?: number; totalBytes?: number };
export const PARAKEET_FILES = ["encoder.int8.onnx", "decoder.int8.onnx", "joiner.int8.onnx", "tokens.txt"];
export function parakeetDirectory(cacheDir: string, model: ParakeetModel): string {
  return join(cacheDir, "parakeet", `sherpa-onnx-nemo-${model}`);
}
async function complete(dir: string): Promise<boolean> {
  return (await Promise.all(PARAKEET_FILES.map(async file => {
    try { const info = await stat(join(dir, file)); return info.isFile() && info.size > 0; } catch { return false; }
  }))).every(Boolean);
}

// Extract only catalogued model files. No archive copy is retained on disk.
export async function ensureParakeetModel(cacheDir: string, model: ParakeetModel, options: {
  signal?: AbortSignal; onProgress?: (progress: SpeechProgress) => void;
} = {}): Promise<string> {
  options.signal?.throwIfAborted();
  if (model !== "parakeet-tdt-0.6b-v2-int8" && model !== "parakeet-tdt-0.6b-v3-int8") throw new Error("Unsupported local speech model");
  const target = parakeetDirectory(cacheDir, model);
  if (await complete(target)) return target;
  const root = join(cacheDir, "parakeet");
  await mkdir(root, { recursive: true });
  const space = await statfs(root);
  // Both INT8 models need ~665 MB extracted. Keep room for the app and OS.
  if (space.bavail * space.bsize < 850_000_000) throw new Error("Parakeet needs at least 850 MB of free disk space to prepare its local model");
  const staging = await mkdtemp(join(root, ".prepare-"));
  const signal = AbortSignal.any([options.signal ?? new AbortController().signal, AbortSignal.timeout(15 * 60_000)]);
  const name = `sherpa-onnx-nemo-${model}`;
  try {
    options.onProgress?.({ stage: "downloading", downloadedBytes: 0 });
    const response = await fetch(`https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/${name}.tar.bz2`, { signal });
    if (!response.ok || !response.body) throw new Error(`Parakeet model download failed (HTTP ${response.status})`);
    const totalBytes = Number(response.headers.get("content-length")) || undefined;
    const child = spawn("tar", ["-xjf", "-", "-C", staging, ...PARAKEET_FILES.map(file => `${name}/${file}`)], {
      windowsHide: true, stdio: ["pipe", "ignore", "pipe"], signal,
    });
    let stderr = "";
    child.stderr.on("data", chunk => { stderr = (stderr + chunk.toString()).slice(-2048); });
    const closed = new Promise<void>(resolve => child.once("close", () => resolve()));
    const exited = new Promise<void>((resolve, reject) => {
      child.once("error", reject);
      child.once("close", code => code === 0 ? resolve() : reject(new Error(`Model extraction failed (${code}): ${stderr.trim()}`)));
    });
    // Attach a handler immediately; extraction may fail before piping settles.
    void exited.catch(() => undefined);
    let downloadedBytes = 0;
    let reportedAt = 0;
    const progress = new Transform({ transform(chunk, _encoding, callback) {
      downloadedBytes += chunk.length;
      if (Date.now() - reportedAt > 250) {
        reportedAt = Date.now(); options.onProgress?.({ stage: "downloading", downloadedBytes, totalBytes });
      }
      callback(null, chunk);
    } });
    try {
      await pipeline(Readable.fromWeb(response.body as never), progress, child.stdin, { signal });
      await exited;
    } catch (error) {
      child.kill();
      await closed;
      await exited.catch(() => undefined);
      throw error;
    }
    const extracted = join(staging, name);
    if (!(await complete(extracted))) throw new Error("Downloaded Parakeet model is incomplete");
    // Preserve an existing incomplete cache; only this invocation's staging is cleaned.
    try { await stat(target); } catch { await rename(extracted, target); return target; }
    if (await complete(target)) return target;
    throw new Error("The Parakeet cache is incomplete. Choose a fresh speech cache or repair it before retrying");
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
}
