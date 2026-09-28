import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { api } from "../lib/api";
import { startSpeechRecording, type SpeechRecording } from "../lib/speech-capture";
import { useAppStore } from "../stores/app-store";
import { IconMic, IconStop, IconX } from "./icons";

type VoiceState = "idle" | "recording" | "transcribing" | "waiting" | "speaking";
type VoiceMode = { active: boolean; start: () => void; stop: () => void };
const VoiceModeContext = createContext<VoiceMode | null>(null);

export function useVoiceMode(): VoiceMode {
  const context = useContext(VoiceModeContext);
  if (!context) throw new Error("Voice mode requires ChatSurface");
  return context;
}

export function VoiceModeProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const [active, setActive] = useState(false);
  const [state, setState] = useState<VoiceState>("idle");
  const [transcript, setTranscript] = useState("");
  const [replyText, setReplyText] = useState("");
  const recording = useRef<SpeechRecording | null>(null);
  const cycle = useRef(0);
  const sourceSession = useRef<string | undefined>(undefined);
  const sendingVoice = useRef(false);
  const replyBaseline = useRef<string | undefined>(undefined);
  const sendPrompt = useAppStore((s) => s.sendPrompt);
  const activeSessionId = useAppStore((s) => s.activeSessionId);
  const messages = useAppStore((s) => s.messages);
  const isRunning = useAppStore((s) =>
    s.activeSessionId ? s.runningSessions[s.activeSessionId] ?? false : false,
  );
  const voiceUri = useAppStore((s) => s.settings?.speech?.voiceUri);
  const voiceRepliesEnabled = useAppStore((s) => s.settings?.speech?.voiceRepliesEnabled !== false);
  const showToast = useAppStore((s) => s.showToast);

  const stop = () => {
    cycle.current += 1;
    sendingVoice.current = false;
    recording.current?.cancel();
    recording.current = null;
    window.speechSynthesis?.cancel();
    setActive(false);
    setState("idle");
    setTranscript("");
    setReplyText("");
  };

  useEffect(() => () => {
    cycle.current += 1;
    recording.current?.cancel();
    window.speechSynthesis?.cancel();
  }, []);

  useEffect(() => {
    if (!active || sourceSession.current === activeSessionId) return;
    if (sourceSession.current === undefined && (sendingVoice.current || state === "waiting")) {
      sourceSession.current = activeSessionId;
      return;
    }
    stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSessionId, state]);

  useEffect(() => {
    if (!active) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") stop();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  useEffect(() => {
    if (!active || state !== "speaking" || voiceRepliesEnabled) return;
    cycle.current += 1;
    window.speechSynthesis?.cancel();
    void start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, state, voiceRepliesEnabled]);

  const start = async () => {
    recording.current?.cancel();
    recording.current = null;
    window.speechSynthesis?.cancel();
    const token = ++cycle.current;
    sourceSession.current = useAppStore.getState().activeSessionId;
    setActive(true);
    setState("idle");
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
      stop();
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
      setTranscript(text);
      setReplyText("");
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
    if (!active || state !== "waiting" || isRunning) return;
    const baselineIndex = messages.findIndex((message) => message.id === replyBaseline.current);
    const reply = messages.slice(baselineIndex + 1).findLast(
      (message) => message.role === "assistant" && message.status === "complete" && message.content.trim(),
    );
    if (!reply) return;
    setReplyText(reply.content);
    if (!voiceRepliesEnabled) {
      void start();
      return;
    }
    if (!window.speechSynthesis || typeof SpeechSynthesisUtterance === "undefined") {
      setState("idle");
      return;
    }
    const utterance = new SpeechSynthesisUtterance(reply.content.slice(0, 3_000));
    const voice = window.speechSynthesis.getVoices().find((item) => item.voiceURI === voiceUri);
    if (voice) utterance.voice = voice;
    const token = cycle.current;
    utterance.onend = () => { if (cycle.current === token) void start(); };
    utterance.onerror = () => { if (cycle.current === token) setState("idle"); };
    setState("speaking");
    window.speechSynthesis.speak(utterance);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, state, isRunning, messages, voiceUri, voiceRepliesEnabled]);

  return (
    <VoiceModeContext.Provider value={{ active, start: () => void start(), stop }}>
      {children}
      {active && createPortal(
        <div className="speech-overlay" role="presentation">
          <section className="speech-dialog" role="region" aria-label={t("chat.voiceMode")}>
            <button type="button" className="speech-close" aria-label={t("chat.endVoiceMode")} title={t("chat.endVoiceMode")} onClick={stop}><IconX size={18} /></button>
            <div className={`speech-orbit ${state}`} aria-hidden="true"><IconMic size={22} /></div>
            <div className="speech-heading"><h2>{t("chat.voiceMode")}</h2><span className={`speech-live-dot ${state}`} /></div>
            <p className="speech-state" role="status">{t(state === "recording" ? "chat.listening" : state === "transcribing" ? "chat.transcribing" : state === "waiting" ? "chat.waitingReply" : state === "speaking" ? "chat.speaking" : "chat.readyToSpeak")}</p>
            {transcript && <p className="speech-transcript"><span>{t("chat.voiceYou")}</span>{transcript}</p>}
            {replyText && <p className="speech-transcript speech-reply"><span>{t("chat.voiceNexus")}</span>{replyText}</p>}
            <div className="speech-actions">
              {state === "recording" && <button type="button" className="speech-primary" onClick={() => void finish()}><IconStop size={14} />{t("chat.done")}</button>}
              {state === "idle" && <button type="button" className="speech-primary" onClick={() => void start()}><IconMic size={15} />{t("chat.speakAgain")}</button>}
              {state === "speaking" && <button type="button" className="speech-secondary" onClick={() => { cycle.current += 1; window.speechSynthesis.cancel(); setState("idle"); }}>{t("chat.stopSpeaking")}</button>}
              <button type="button" className="speech-secondary" onClick={stop}>{t("chat.endVoiceMode")}</button>
            </div>
          </section>
        </div>,
        document.body,
      )}
    </VoiceModeContext.Provider>
  );
}
