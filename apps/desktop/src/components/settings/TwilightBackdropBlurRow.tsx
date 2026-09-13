import { useTranslation } from "react-i18next";
import {
  DEFAULT_SCENIC_BACKDROP_BLUR,
  normalizeScenicBackdropBlur,
  type AppSettings,
  type ScenicBackdropBlur,
} from "@pi-desktop/shared";
import { cx } from "../ui";
import { useAppStore } from "../../stores/app-store";
import { supportsScenicBackdropBlur } from "@pi-desktop/shared";

const OPTIONS: Array<{ value: ScenicBackdropBlur; label: string }> = [
  { value: "low", label: "settings.twilightBackdropBlurLow" },
  { value: "medium", label: "settings.twilightBackdropBlurMedium" },
  { value: "high", label: "settings.twilightBackdropBlurHigh" },
];

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
  const current = normalizeScenicBackdropBlur(
    settings.scenicBackdropBlur ?? settings.twilightBackdropBlur ?? DEFAULT_SCENIC_BACKDROP_BLUR,
  );
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
        <div
          className={cx("settings-segment", !enabled && "is-disabled")}
          role="radiogroup"
          aria-label={t("settings.scenicBackdropBlur")}
          aria-disabled={!enabled}
        >
          {OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={current === option.value}
              aria-disabled={!enabled}
              disabled={!enabled}
              className={cx(
                "settings-segment-item",
                current === option.value && "active",
              )}
              onClick={() => choose(option.value)}
            >
              {t(option.label)}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
