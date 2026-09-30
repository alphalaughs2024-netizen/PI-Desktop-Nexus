import { IPC, type SpeechTranscriptionProgress } from "@pi-desktop/shared";
import { api } from "./api";
export type SpeechTranscription = { result: Promise<string>; cancel: () => void };
export function startSpeechTranscription(audio: string, progress: (value: SpeechTranscriptionProgress) => void): SpeechTranscription {
  const requestId = crypto.randomUUID();
  const unsubscribe = window.piDesktop?.on(IPC.event.speechProgress, value => {
    const update = value as SpeechTranscriptionProgress;
    if (update.requestId === requestId) progress(update);
  });
  let canceled = false;
  const result = api.transcribeSpeech(audio, requestId).then(value => canceled ? "" : value.text).finally(() => unsubscribe?.());
  return { result, cancel: () => {
    canceled = true; unsubscribe?.();
    void api.cancelSpeech(requestId).catch(() => undefined);
  } };
}
export function speechProgressText(value: SpeechTranscriptionProgress | null, t: (key: string, options?: Record<string, unknown>) => string): string {
  if (value?.stage === "loading") return t("chat.loadingSpeechModel");
  if (value?.stage === "downloading") {
    const percent = value.totalBytes ? Math.min(100, Math.floor(100 * (value.downloadedBytes ?? 0) / value.totalBytes)) + "%" : "";
    return t("chat.downloadingSpeechModel", { progress: percent }).trim();
  }
  return t("chat.transcribing");
}
