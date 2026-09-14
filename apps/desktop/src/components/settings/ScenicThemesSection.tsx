import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { BUILT_IN_THEMES, resolveScenicBackdropBlur, type AppSettings, type ScenicThemeId, type ThemePreference } from "@pi-desktop/shared";
import { IconCheck } from "../icons";
import { useAppStore } from "../../stores/app-store";

const SCENIC = BUILT_IN_THEMES.filter((theme) => "scenic" in theme && theme.scenic).map((theme) => theme.id) as ScenicThemeId[];
const ASSETS: Record<ScenicThemeId, string> = { "twilight-mountains": "twilight-mountains.png", "alpine-light": "alpine-light.png", "obsidian-horizon": "obsidian-horizon.png" };
const clamp = (value: number) => Math.max(0, Math.min(20, Math.round(value)));

export function ScenicThemesSection({ settings, saveSettings }: { settings: AppSettings; saveSettings: (patch: Partial<AppSettings>) => Promise<void> }) {
  const { t } = useTranslation();
  const showToast = useAppStore((state) => state.showToast);
  const activeTheme = SCENIC.includes(settings.theme as ScenicThemeId) ? settings.theme as ScenicThemeId : "twilight-mountains";
  const [draftValue, setDraftValue] = useState(() => resolveScenicBackdropBlur(settings, activeTheme));
  const confirmedRef = useRef(draftValue);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const generationRef = useRef(0);
  const frameRef = useRef<number | null>(null);
  const applyVisual = (value: number) => { if (frameRef.current !== null) cancelAnimationFrame(frameRef.current); frameRef.current = requestAnimationFrame(() => { document.documentElement.style.setProperty("--scenic-backdrop-blur", `${clamp(value)}px`); document.documentElement.dataset.scenicBackdropBlur = String(clamp(value)); frameRef.current = null; }); };
  useEffect(() => { const value = resolveScenicBackdropBlur(settings, activeTheme); confirmedRef.current = value; setDraftValue(value); applyVisual(value); return () => { if (frameRef.current !== null) cancelAnimationFrame(frameRef.current); }; }, [activeTheme, settings.scenicBackdropBlur, settings.scenicBackdropBlurByTheme]);
  const persist = (value: number) => { const generation = ++generationRef.current; if (timerRef.current) clearTimeout(timerRef.current); timerRef.current = setTimeout(() => { void saveSettings({ scenicBackdropBlurByTheme: { ...settings.scenicBackdropBlurByTheme, [activeTheme]: value } }).then(() => { if (generation === generationRef.current) confirmedRef.current = value; }).catch((error) => { if (generation !== generationRef.current) return; setDraftValue(confirmedRef.current); applyVisual(confirmedRef.current); showToast(error instanceof Error ? error.message : String(error), { variant: "error" }); }); }, 180); };
  const updateBlur = (raw: number) => { const value = clamp(raw); setDraftValue(value); applyVisual(value); persist(value); };
  const choose = (theme: ThemePreference) => void saveSettings({ theme }).catch((error) => showToast(error instanceof Error ? error.message : String(error), { variant: "error" }));
  return <div className="scenic-themes-page"><p className="settings-section-description">{t("settings.scenicThemesDesc")}</p><div className="scenic-theme-cards" role="listbox" aria-label={t("settings.scenicThemes")}>{SCENIC.map((id) => { const key = id === "twilight-mountains" ? "TwilightMountains" : id === "alpine-light" ? "AlpineLight" : "ObsidianHorizon"; return <button key={id} type="button" role="option" aria-selected={settings.theme === id} className={`scenic-theme-card${settings.theme === id ? " is-selected" : ""}`} style={{ backgroundImage: `url("../../resources/themes/${ASSETS[id]}")` }} onClick={() => choose(id)}><span className="scenic-theme-card-copy"><strong>{t(`settings.theme${key}`)}</strong><span>{t(`settings.theme${key}Desc`)}</span></span>{settings.theme === id ? <IconCheck size={18} aria-hidden /> : null}</button>; })}</div><div className="settings-card-block scenic-effects"><h2>{t("settings.scenicEffects")}</h2><div className="settings-row"><div className="settings-row-copy"><div className="settings-row-title">{t("settings.scenicBackdropBlur")}</div><div className="settings-row-desc">{t("settings.scenicBackdropBlurDesc")}</div></div><label className="scenic-blur-slider"><input type="range" min={0} max={20} step={1} value={draftValue} onChange={(event) => updateBlur(Number(event.target.value))} aria-label={t("settings.scenicBackdropBlur")} /><output>{draftValue}px</output></label></div></div></div>;
}
