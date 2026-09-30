import type { SpeechSettings, SpeechTranscriptionProgress } from "@pi-desktop/shared";
import { transcribeSpeech } from "./speech.ts";
import { closeLocalSpeech } from "./speech-local.ts";

type Request = { controller: AbortController; done: Promise<string> };
export class SpeechService {
  private requests = new Map<string, Request>();
  private readonly cacheDir: string;
  private readonly settings: () => Promise<SpeechSettings | undefined>;
  private readonly progress: (value: SpeechTranscriptionProgress) => void;
  private readonly transcribe: typeof transcribeSpeech;
  constructor(cacheDir: string, settings: () => Promise<SpeechSettings | undefined>,
    progress: (value: SpeechTranscriptionProgress) => void, transcribe = transcribeSpeech) {
    this.cacheDir = cacheDir; this.settings = settings; this.progress = progress; this.transcribe = transcribe;
  }
  start(id: string, audio: string): Promise<string> {
    if (!/^[a-zA-Z0-9-]{1,80}$/.test(id)) return Promise.reject(new Error("Invalid speech request ID"));
    if (this.requests.has(id)) return Promise.reject(new Error("Speech request already exists"));
    if (this.requests.size > 0) return Promise.reject(new Error("Another speech transcription is active"));
    const controller = new AbortController();
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(16 * 60_000)]);
    // Install ownership before awaiting settings so an immediate Cancel is effective.
    const request: Request = { controller, done: Promise.resolve("") };
    this.requests.set(id, request);
    let onAbort: () => void;
    const canceled = new Promise<never>((_resolve, reject) => {
      onAbort = () => reject(new Error("Speech transcription canceled or timed out"));
      signal.addEventListener("abort", onAbort, { once: true });
    });
    const work = (async () => {
      const settings = await this.settings();
      signal.throwIfAborted();
      return this.transcribe(audio, settings, this.cacheDir, { signal, onProgress: value => {
        if (!signal.aborted && this.requests.get(id) === request) this.progress({ requestId: id, ...value });
      } });
    })();
    request.done = Promise.race([work, canceled]).finally(() => {
      signal.removeEventListener("abort", onAbort);
      if (this.requests.get(id) === request) this.requests.delete(id);
    });
    return request.done;
  }
  cancel(id: string): void { this.requests.get(id)?.controller.abort(); }
  close(): void {
    for (const request of this.requests.values()) request.controller.abort();
    closeLocalSpeech();
  }
}
