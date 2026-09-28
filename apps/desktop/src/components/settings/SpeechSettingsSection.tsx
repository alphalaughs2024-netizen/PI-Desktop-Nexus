import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { AppSettings, SpeechSettings } from "@pi-desktop/shared";
import { cx } from "../ui";

export function SpeechSettingsSection({
  settings,
  saveSettings,
}: {
  settings: AppSettings;
  saveSettings: (patch: Partial<AppSettings>) => Promise<void>;
}) {
  const { t } = useTranslation();
  const speech = settings.speech ?? { transcription: "local" };
  const [endpoint, setEndpoint] = useState(speech.endpoint ?? "");
  const [model, setModel] = useState(speech.model ?? "");
  const [apiKeyEnv, setApiKeyEnv] = useState(speech.apiKeyEnv ?? "");
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  useEffect(() => {
    setEndpoint(speech.endpoint ?? "");
    setModel(speech.model ?? "");
    setApiKeyEnv(speech.apiKeyEnv ?? "");
  }, [speech.endpoint, speech.model, speech.apiKeyEnv]);
  useEffect(() => {
    const update = () => setVoices(window.speechSynthesis?.getVoices() ?? []);
    update();
    window.speechSynthesis?.addEventListener("voiceschanged", update);
    return () => window.speechSynthesis?.removeEventListener("voiceschanged", update);
  }, []);
  const save = (patch: Partial<SpeechSettings>) =>
    saveSettings({ speech: { ...speech, ...patch } });
  return (
    <section className="settings-card-block">
      <h3 className="settings-card-heading">{t("settings.speechTitle")}</h3>
      <div className="settings-panel">
      <div className="settings-row">
        <div className="settings-row-copy">
          <div className="settings-row-title">{t("settings.transcriptionProvider")}</div>
          <div className="settings-row-desc">{t("settings.transcriptionProviderDesc")}</div>
        </div>
        <div className="settings-row-control">
          <div className="settings-segment" role="group" aria-label={t("settings.transcriptionProvider")}>
            {(["local", "hosted"] as const).map((value) => (
              <button key={value} type="button" className={cx("settings-segment-item", speech.transcription === value && "active")} aria-pressed={speech.transcription === value} onClick={() => void save({ transcription: value })}>
                {t(value === "local" ? "settings.speechLocal" : "settings.speechHosted")}
              </button>
            ))}
          </div>
        </div>
      </div>
      {speech.transcription === "local" && (
        <div className="settings-row">
          <div className="settings-row-copy"><div className="settings-row-title">{t("settings.speechModel")}</div></div>
          <div className="settings-row-control">
            <select className="field-select" value={speech.localModel ?? "parakeet-tdt-0.6b-v2-int8"} onChange={(event) => void save({ localModel: event.target.value as SpeechSettings["localModel"] })}>
              <option value="parakeet-tdt-0.6b-v2-int8">{t("settings.speechParakeetEnglish")}</option>
              <option value="parakeet-tdt-0.6b-v3-int8">{t("settings.speechParakeetMultilingual")}</option>
              <option value="whisper-tiny">{t("settings.speechWhisperTiny")}</option>
            </select>
          </div>
        </div>
      )}
      {speech.transcription === "hosted" && (
        <>
          <div className="settings-row">
            <div className="settings-row-copy"><div className="settings-row-title">{t("settings.speechEndpoint")}</div></div>
            <div className="settings-row-control"><input className="field-input" type="url" value={endpoint} placeholder="https://.../audio/transcriptions" onChange={(event) => setEndpoint(event.target.value)} onBlur={() => { if (endpoint !== (speech.endpoint ?? "")) void save({ endpoint: endpoint.trim() }); }} /></div>
          </div>
          <div className="settings-row">
            <div className="settings-row-copy"><div className="settings-row-title">{t("settings.speechModel")}</div></div>
            <div className="settings-row-control"><input className="field-input" value={model} placeholder="whisper-1" onChange={(event) => setModel(event.target.value)} onBlur={() => { if (model !== (speech.model ?? "")) void save({ model: model.trim() }); }} /></div>
          </div>
          <div className="settings-row">
            <div className="settings-row-copy"><div className="settings-row-title">{t("settings.speechKeyEnv")}</div><div className="settings-row-desc">{t("settings.speechKeyEnvDesc")}</div></div>
            <div className="settings-row-control"><input className="field-input" value={apiKeyEnv} placeholder="SPEECH_API_KEY" spellCheck={false} onChange={(event) => setApiKeyEnv(event.target.value)} onBlur={() => { if (apiKeyEnv !== (speech.apiKeyEnv ?? "")) void save({ apiKeyEnv: apiKeyEnv.trim() }); }} /></div>
          </div>
        </>
      )}
      <div className="settings-row">
        <div className="settings-row-copy">
          <div className="settings-row-title">{t("settings.voiceReplies")}</div>
          <div className="settings-row-desc">{t("settings.voiceRepliesDesc")}</div>
        </div>
        <div className="settings-row-control">
          <button
            type="button"
            className={cx("settings-toggle", speech.voiceRepliesEnabled !== false && "on")}
            role="switch"
            aria-checked={speech.voiceRepliesEnabled !== false}
            aria-label={t("settings.voiceReplies")}
            onClick={() => void save({ voiceRepliesEnabled: speech.voiceRepliesEnabled === false })}
          >
            <span className="settings-toggle-thumb" />
          </button>
        </div>
      </div>
      <div className="settings-row">
        <div className="settings-row-copy"><div className="settings-row-title">{t("settings.speechVoice")}</div></div>
        <div className="settings-row-control">
          <select className="field-select" value={speech.voiceUri ?? ""} disabled={speech.voiceRepliesEnabled === false} onChange={(event) => void save({ voiceUri: event.target.value })}>
            <option value="">{t("settings.speechSystemVoice")}</option>
            {voices.map((voice) => <option key={voice.voiceURI} value={voice.voiceURI}>{voice.name} ({voice.lang})</option>)}
          </select>
        </div>
      </div>
      </div>
    </section>
  );
}
