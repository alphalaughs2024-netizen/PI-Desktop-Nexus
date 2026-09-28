import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { api } from "../lib/api";
import { startSpeechRecording, type SpeechRecording } from "../lib/speech-capture";
import { useAppStore } from "../stores/app-store";
import { IconChevronDown, IconMic, IconStop, IconX } from "./icons";

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
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const recording = useRef<SpeechRecording | null>(null);
  const overlay = useRef<HTMLDivElement | null>(null);
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
  const transcriptToggleLabel = detailsOpen ? t("chat.hideVoiceTranscript") : t("chat.showVoiceTranscript");

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
    setDetailsOpen(false);
    setRecordingSeconds(0);
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

  useEffect(() => {
    if (state !== "recording") return;
    const startedAt = Date.now();
    setRecordingSeconds(0);
    const timer = window.setInterval(() => setRecordingSeconds(Math.floor((Date.now() - startedAt) / 1000)), 500);
    return () => window.clearInterval(timer);
  }, [state]);

  useEffect(() => {
    if (!active) return;
    const surface = overlay.current?.closest<HTMLElement>(".chat-surface");
    const element = overlay.current;
    if (!surface || !element) return;
    const update = () => surface.style.setProperty("--speech-bar-height", `${element.offsetHeight + 16}px`);
    const observer = new ResizeObserver(update);
    observer.observe(element);
    update();
    return () => {
      observer.disconnect();
      surface.style.removeProperty("--speech-bar-height");
    };
  }, [active]);

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
        <div className="speech-overlay" ref={overlay}>
          <section className={`speech-dialog is-${state}`} role="region" aria-label={t("chat.voiceMode")}>
            <div className="speech-main-row">
              <div className={`speech-orbit ${state}`} aria-hidden="true"><IconMic size={20} /></div>
              <div className="speech-identity">
                <div className="speech-heading"><h2>{t("chat.voiceMode")}</h2><span className={`speech-live-dot ${state}`} /></div>
                <p className="speech-state" role="status">{t(state === "recording" ? "chat.listening" : state === "transcribing" ? "chat.transcribing" : state === "waiting" ? "chat.waitingReply" : state === "speaking" ? "chat.speaking" : "chat.readyToSpeak")}</p>
              </div>
              <div className={`speech-waveform ${state}`} aria-hidden="true">
                {Array.from({ length: 43 }, (_, index) => <i key={index} style={{ animationDelay: `${(index % 11) * -0.12}s`, height: `${4 + (index * 7 % 13)}px` }} />)}
              </div>
              <span className="speech-timer" aria-hidden="true">{String(Math.floor(recordingSeconds / 60)).padStart(2, "0")}:{String(recordingSeconds % 60).padStart(2, "0")}</span>
              <div className="speech-actions">
                {state === "recording" && <button type="button" className="speech-primary" aria-label={t("chat.done")} title={t("chat.done")} onClick={() => void finish()}><IconStop size={15} /></button>}
                {state === "idle" && <button type="button" className="speech-primary" aria-label={t("chat.speakAgain")} title={t("chat.speakAgain")} onClick={() => void start()}><IconMic size={17} /></button>}
                {state === "speaking" && <button type="button" className="speech-primary" aria-label={t("chat.stopSpeaking")} title={t("chat.stopSpeaking")} onClick={() => { cycle.current += 1; window.speechSynthesis.cancel(); setState("idle"); }}><IconStop size={15} /></button>}
                <button type="button" className="speech-close" aria-label={t("chat.endVoiceMode")} title={t("chat.endVoiceMode")} onClick={stop}><IconX size={17} /></button>
              </div>
            </div>
            {detailsOpen && (transcript || replyText) && <div className="speech-details">
              {transcript && <p className="speech-transcript"><span>{t("chat.voiceYou")}</span>{transcript}</p>}
              {replyText && <p className="speech-transcript speech-reply"><span>{t("chat.voiceNexus")}</span>{replyText}</p>}
            </div>}
          </section>
          <button type="button" className="speech-expand" aria-label={transcriptToggleLabel} title={transcriptToggleLabel} aria-expanded={detailsOpen} disabled={!transcript && !replyText} onClick={() => setDetailsOpen((open) => !open)}><IconChevronDown size={18} /></button>
        </div>,
        document.querySelector(".chat-surface") ?? document.body,
      )}
    </VoiceModeContext.Provider>
  );
}
