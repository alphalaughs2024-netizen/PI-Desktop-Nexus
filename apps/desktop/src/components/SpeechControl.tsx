import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { api } from "../lib/api";
import { startSpeechRecording, type SpeechRecording } from "../lib/speech-capture";
import { useAppStore } from "../stores/app-store";
import { IconMic, IconStop, IconX } from "./icons";
import { TooltipButton } from "./ui";

type SpeechState = "idle" | "recording" | "transcribing" | "waiting" | "speaking";

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
  const [mode, setMode] = useState<"dictation" | "voice" | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [state, setState] = useState<SpeechState>("idle");
  const [transcript, setTranscript] = useState("");
  const recording = useRef<SpeechRecording | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const sendingVoice = useRef(false);
  const cycle = useRef(0);
  const sourceSession = useRef<string | undefined>(undefined);
  const replyBaseline = useRef<string | undefined>(undefined);
  const sendPrompt = useAppStore((s) => s.sendPrompt);
  const activeSessionId = useAppStore((s) => s.activeSessionId);
  const messages = useAppStore((s) => s.messages);
  const isRunning = useAppStore((s) =>
    s.activeSessionId ? s.runningSessions[s.activeSessionId] ?? false : false,
  );
  const voiceUri = useAppStore((s) => s.settings?.speech?.voiceUri);
  const showToast = useAppStore((s) => s.showToast);

  const end = () => {
    cycle.current += 1;
    sendingVoice.current = false;
    recording.current?.cancel();
    recording.current = null;
    window.speechSynthesis?.cancel();
    setMode(null);
    setMenuOpen(false);
    setState("idle");
  };

  useEffect(() => () => {
    cycle.current += 1;
    recording.current?.cancel();
    window.speechSynthesis?.cancel();
  }, []);

  useEffect(() => {
    if (!mode || sourceSession.current === activeSessionId) return;
    if (mode === "voice" && sendingVoice.current && sourceSession.current === undefined) {
      sourceSession.current = activeSessionId;
      return;
    }
    end();
    // Session changes invalidate captured speech; do not send it to another chat.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSessionId]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (mode) end();
      else setMenuOpen(false);
    };
    const onPointer = (event: PointerEvent) => {
      if (menuOpen && root.current && !root.current.contains(event.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, menuOpen]);

  const start = async (nextMode: "dictation" | "voice") => {
    const token = ++cycle.current;
    sourceSession.current = activeSessionId;
    setMenuOpen(false);
    setMode(nextMode);
    setState("idle");
    setTranscript("");
    try {
      const next = await startSpeechRecording();
      if (cycle.current !== token) {
        next.cancel();
        return;
      }
      recording.current = next;
      setState("recording");
    } catch (error) {
      if (cycle.current !== token) return;
      end();
      showToast(error instanceof Error ? error.message : String(error), { variant: "error" });
    }
  };

  const finish = async () => {
    const current = recording.current;
    if (!current || state !== "recording") return;
    recording.current = null;
    const token = cycle.current;
    setState("transcribing");
    try {
      const wav = await current.stop();
      if (cycle.current !== token || !wav) return;
      const { text } = await api.transcribeSpeech(wav);
      if (cycle.current !== token || sourceSession.current !== useAppStore.getState().activeSessionId) return;
      if (!text) {
        setState("idle");
        return;
      }
      if (mode === "dictation") {
        onDictation(text, sourceSession.current);
        end();
        return;
      }
      setTranscript(text);
      replyBaseline.current = useAppStore.getState().messages.at(-1)?.id;
      sendingVoice.current = true;
      const accepted = await sendPrompt(text);
      sendingVoice.current = false;
      if (cycle.current !== token) return;
      setState(accepted ? "waiting" : "idle");
    } catch (error) {
      if (cycle.current !== token) return;
      sendingVoice.current = false;
      setState("idle");
      showToast(error instanceof Error ? error.message : String(error), { variant: "error" });
    }
  };

  useEffect(() => {
    if (mode !== "voice" || state !== "waiting" || isRunning) return;
    const baselineIndex = messages.findIndex((message) => message.id === replyBaseline.current);
    const reply = messages.slice(baselineIndex + 1).findLast(
      (message) => message.role === "assistant" && message.status === "complete" && message.content.trim(),
    );
    if (!reply) return;
    if (!window.speechSynthesis || typeof SpeechSynthesisUtterance === "undefined") {
      setState("idle");
      return;
    }
    const utterance = new SpeechSynthesisUtterance(reply.content.slice(0, 3_000));
    const voice = window.speechSynthesis.getVoices().find((item) => item.voiceURI === voiceUri);
    if (voice) utterance.voice = voice;
    const token = cycle.current;
    utterance.onend = () => { if (cycle.current === token) void start("voice"); };
    utterance.onerror = () => { if (cycle.current === token) setState("idle"); };
    setState("speaking");
    window.speechSynthesis.speak(utterance);
  }, [mode, state, isRunning, messages, voiceUri]);

  return (
    <div className="composer-speech-control" ref={root}>
      <TooltipButton
        type="button"
        className={`icon-btn${mode || menuOpen ? " active" : ""}`}
        tooltip={t("chat.speech")}
        ariaLabel={t("chat.speech")}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        disabled={disabled}
        onClick={() => mode ? end() : setMenuOpen((open) => !open)}
      >
        <IconMic size={15} aria-hidden="true" />
      </TooltipButton>
      {menuOpen && (
        <div className="composer-speech-menu" role="menu">
          <button type="button" role="menuitem" onClick={() => void start("dictation")}>{t("chat.dictate")}</button>
          <button type="button" role="menuitem" disabled={!canVoice} onClick={() => void start("voice")}>{t("chat.voiceMode")}</button>
        </div>
      )}
      {mode === "dictation" && (
        <div className="composer-dictation-status" role="status">
          <span className={`speech-indicator${state === "recording" ? " recording" : ""}`} />
          <span>{t(state === "recording" ? "chat.listening" : state === "transcribing" ? "chat.transcribing" : "chat.noSpeech")}</span>
          <TooltipButton type="button" className="icon-btn" tooltip={t("chat.cancelSpeech")} ariaLabel={t("chat.cancelSpeech")} onClick={end}><IconX size={14} /></TooltipButton>
          {state === "recording" && <button type="button" className="speech-done" onClick={() => void finish()}>{t("chat.done")}</button>}
          {state === "idle" && <button type="button" className="speech-done" onClick={() => void start("dictation")}>{t("chat.speechRetry")}</button>}
        </div>
      )}
      {mode === "voice" && createPortal(
        <div className="speech-overlay" role="presentation">
          <section className="speech-dialog" role="dialog" aria-modal="true" aria-label={t("chat.voiceMode")}>
            <button type="button" className="speech-close" aria-label={t("chat.endVoiceMode")} title={t("chat.endVoiceMode")} onClick={end}><IconX size={18} /></button>
            <div className={`speech-orbit ${state}`} aria-hidden="true"><IconMic size={28} /></div>
            <h2>{t("chat.voiceMode")}</h2>
            <p className="speech-state" role="status">{t(state === "recording" ? "chat.listening" : state === "transcribing" ? "chat.transcribing" : state === "waiting" ? "chat.waitingReply" : state === "speaking" ? "chat.speaking" : "chat.readyToSpeak")}</p>
            {transcript && <p className="speech-transcript">{transcript}</p>}
            <div className="speech-actions">
              {state === "recording" && <button type="button" className="speech-primary" onClick={() => void finish()}><IconStop size={14} />{t("chat.done")}</button>}
              {state === "idle" && <button type="button" className="speech-primary" onClick={() => void start("voice")}><IconMic size={15} />{t("chat.speakAgain")}</button>}
              {state === "speaking" && <button type="button" className="speech-secondary" onClick={() => { cycle.current += 1; window.speechSynthesis.cancel(); setState("idle"); }}>{t("chat.stopSpeaking")}</button>}
              <button type="button" className="speech-secondary" onClick={end}>{t("chat.endVoiceMode")}</button>
            </div>
          </section>
        </div>,
        document.body,
      )}
    </div>
  );
}
