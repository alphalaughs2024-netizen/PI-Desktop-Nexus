import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { SpeechTranscriptionProgress } from "@pi-desktop/shared";
import { startSpeechTranscription, speechProgressText, type SpeechTranscription } from "../lib/speech-transcription";
import { startSpeechRecording, type SpeechRecording } from "../lib/speech-capture";
import { useAppStore } from "../stores/app-store";
import { IconMic, IconVoice, IconX } from "./icons";
import { TooltipButton } from "./ui";
import { useVoiceMode } from "./VoiceConversation";

type DictationState = "starting" | "recording" | "transcribing" | "empty" | "error";

export function SpeechControl({
  disabled,
  canVoice,
  onDictation,
}: {
  disabled: boolean;
  canVoice: boolean;
  onDictation: (text: string, sessionId: string | undefined) => void;
}) {
  const { t } = useTranslation();
  const voice = useVoiceMode();
  const [state, setState] = useState<DictationState | null>(null);
  const recording = useRef<SpeechRecording | null>(null);
  const cycle = useRef(0);
  const transcription = useRef<SpeechTranscription | null>(null);
  const [progress, setProgress] = useState<SpeechTranscriptionProgress | null>(null);
  const sourceSession = useRef<string | undefined>(undefined);
  const activeSessionId = useAppStore((s) => s.activeSessionId);
  const showToast = useAppStore((s) => s.showToast);

  const cancel = () => {
    cycle.current += 1;
    recording.current?.cancel();
    recording.current = null;
    transcription.current?.cancel();
    transcription.current = null;
    setProgress(null);
    setState(null);
  };

  useEffect(() => () => {
    cycle.current += 1;
    recording.current?.cancel();
    transcription.current?.cancel();
  }, []);

  useEffect(() => {
    if (state && sourceSession.current !== activeSessionId) cancel();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSessionId]);

  const start = async () => {
    const token = ++cycle.current;
    sourceSession.current = activeSessionId;
    setState("starting");
    setProgress(null);
    try {
      const next = await startSpeechRecording();
      if (cycle.current !== token) {
        next.cancel();
        return;
      }
      recording.current = next;
      setState("recording");
      void next.finished.then(wav => transcribe(wav, token), error => {
        if (cycle.current !== token) return;
        recording.current = null;
        setState("error");
        showToast(error instanceof Error ? error.message : String(error), { variant: "error" });
      });
    } catch (error) {
      if (cycle.current !== token) return;
      cancel();
      showToast(error instanceof Error ? error.message : String(error), { variant: "error" });
    }
  };

  const transcribe = async (wav: string, token: number) => {
    if (cycle.current !== token || !wav) return;
    recording.current = null;
    setState("transcribing");
    try {
      const task = startSpeechTranscription(wav, setProgress);
      transcription.current = task;
      const text = await task.result;
      if (cycle.current !== token || sourceSession.current !== useAppStore.getState().activeSessionId) return;
      transcription.current = null;
      if (!text) { setState("empty"); return; }
      onDictation(text, sourceSession.current);
      cancel();
    } catch (error) {
      if (cycle.current !== token) return;
      transcription.current = null;
      setState("error");
      showToast(error instanceof Error ? error.message : String(error), { variant: "error" });
    }
  };
  const finish = () => {
    if (!recording.current || state !== "recording") return;
    setState("transcribing");
    void recording.current.stop().catch(() => undefined);
  };

  return (
    <div className="composer-speech-control">
      <TooltipButton type="button" className={`icon-btn${state ? " active" : ""}`} tooltip={t("chat.dictate")} ariaLabel={t("chat.dictate")} disabled={disabled || voice.active} onClick={() => state ? cancel() : void start()}>
        <IconMic size={15} aria-hidden="true" />
      </TooltipButton>
      <TooltipButton type="button" className={`icon-btn${voice.active ? " active" : ""}`} tooltip={t("chat.voiceMode")} ariaLabel={t("chat.voiceMode")} disabled={disabled || Boolean(state) || (!canVoice && !voice.active)} onClick={() => voice.active ? voice.stop() : voice.start()}>
        <IconVoice size={15} aria-hidden="true" />
      </TooltipButton>
      {state && (
        <div className="composer-dictation-status" role="status">
          <span className={`speech-indicator${state === "recording" ? " recording" : ""}`} />
          <span>{state === "transcribing" ? speechProgressText(progress, t) : t(state === "starting" ? "chat.requestingMicrophone" : state === "recording" ? "chat.listening" : state === "error" ? "chat.speechFailed" : "chat.noSpeech")}</span>
          <TooltipButton type="button" className="icon-btn" tooltip={t("chat.cancelSpeech")} ariaLabel={t("chat.cancelSpeech")} onClick={cancel}><IconX size={14} /></TooltipButton>
          {state === "recording" && <button type="button" className="speech-done" onClick={() => void finish()}>{t("chat.done")}</button>}
          {(state === "empty" || state === "error") && <button type="button" className="speech-done" onClick={() => void start()}>{t("chat.speechRetry")}</button>}
        </div>
      )}
    </div>
  );
}
