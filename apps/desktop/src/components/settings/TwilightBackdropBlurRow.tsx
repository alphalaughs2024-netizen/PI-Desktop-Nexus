import { useTranslation } from "react-i18next";
import {
  normalizeScenicBackdropBlur,
  type AppSettings,
  type ScenicBackdropBlur,
} from "@pi-desktop/shared";
import { useAppStore } from "../../stores/app-store";
import { supportsScenicBackdropBlur } from "@pi-desktop/shared";


/** Controls only the active scenic backdrop image; glass surfaces are theme-specific. */
export function ScenicBackdropBlurRow({
  settings,
  saveSettings,
}: {
  settings: AppSettings;
  saveSettings: (patch: Partial<AppSettings>) => Promise<void>;
}) {
  const { t } = useTranslation();
  const showToast = useAppStore((state) => state.showToast);
  const current = normalizeScenicBackdropBlur(settings.scenicBackdropBlur);
  const enabled = supportsScenicBackdropBlur(settings.theme);

  const choose = (value: ScenicBackdropBlur) => {
    if (!enabled || value === current) return;
    void saveSettings({ scenicBackdropBlur: value }).catch((error) =>
      showToast(error instanceof Error ? error.message : String(error), {
        variant: "error",
      }),
    );
  };

  return (
    <div className="settings-row">
      <div className="settings-row-copy">
        <div className="settings-row-title">{t("settings.scenicBackdropBlur")}</div>
        <div className="settings-row-desc">{t("settings.scenicBackdropBlurDesc")}</div>
      </div>
      <div className="settings-row-control">
        <label className={`scenic-blur-slider${!enabled ? " is-disabled" : ""}`}>
          <input type="range" min={0} max={20} step={1} value={current} disabled={!enabled}
            aria-label={t("settings.scenicBackdropBlur")} onChange={(event) => choose(Number(event.target.value))} />
          <output>{current}px</output>
        </label>
      </div>
    </div>
  );
}
