import { useTranslation } from "react-i18next";
import { BUILT_IN_THEMES, migrateScenicBackdropBlur, type AppSettings, type ThemePreference, type ScenicThemeId } from "@pi-desktop/shared";
import { IconCheck } from "../icons";

const SCENIC = BUILT_IN_THEMES.filter((theme) => "scenic" in theme && theme.scenic).map((theme) => theme.id);
const asset: Record<string, string> = {
  "twilight-mountains": "twilight-mountains.png",
  "alpine-light": "alpine-light.png",
  "obsidian-horizon": "obsidian-horizon.png",
};

export function ScenicThemesSection({ settings, saveSettings }: { settings: AppSettings; saveSettings: (patch: Partial<AppSettings>) => Promise<void> }) {
  const { t } = useTranslation();
  const blurFor = (theme: ScenicThemeId) => settings.scenicBackdropBlurByTheme?.[theme] ?? migrateScenicBackdropBlur(settings.scenicBackdropBlur ?? settings.twilightBackdropBlur, theme);
  const choose = (theme: ThemePreference) => void saveSettings({ theme });
  return <div className="scenic-themes-page">
    <p className="settings-section-description">{t("settings.scenicThemesDesc")}</p>
    <div className="scenic-theme-cards" role="listbox" aria-label={t("settings.scenicThemes")}>
      {SCENIC.map((id) => {
        const title = t(`settings.theme${id === "twilight-mountains" ? "TwilightMountains" : id === "alpine-light" ? "AlpineLight" : "ObsidianHorizon"}`);
        const description = t(`settings.theme${id === "twilight-mountains" ? "TwilightMountains" : id === "alpine-light" ? "AlpineLight" : "ObsidianHorizon"}Desc`);
        return <button key={id} type="button" role="option" aria-selected={settings.theme === id} className={`scenic-theme-card${settings.theme === id ? " is-selected" : ""}`} style={{ backgroundImage: `url("../../resources/themes/${asset[id]}")` }} onClick={() => choose(id)}>
          <span className="scenic-theme-card-copy"><strong>{title}</strong><span>{description}</span></span>{settings.theme === id ? <IconCheck size={18} aria-hidden /> : null}
        </button>;
      })}
    </div>
    <div className="settings-card-block scenic-effects"><h2>{t("settings.scenicEffects")}</h2><div className="settings-row"><div className="settings-row-copy"><div className="settings-row-title">{t("settings.scenicBackdropBlur")}</div><div className="settings-row-desc">{t("settings.scenicBackdropBlurDesc")}</div></div><label className="scenic-blur-slider"><input type="range" min={0} max={20} step={1} value={settings.theme === "twilight-mountains" || settings.theme === "alpine-light" || settings.theme === "obsidian-horizon" ? blurFor(settings.theme) : 6} onChange={(e) => { const theme = settings.theme; if (theme === "twilight-mountains" || theme === "alpine-light" || theme === "obsidian-horizon") void saveSettings({ scenicBackdropBlur: Number(e.target.value), scenicBackdropBlurByTheme: { ...settings.scenicBackdropBlurByTheme, [theme]: Number(e.target.value) } }); }} aria-label={t("settings.scenicBackdropBlur")} /><output>{settings.theme === "twilight-mountains" || settings.theme === "alpine-light" || settings.theme === "obsidian-horizon" ? blurFor(settings.theme) : 6}px</output></label></div></div>
  </div>;
}
