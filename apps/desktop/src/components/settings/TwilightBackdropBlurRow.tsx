import { useTranslation } from "react-i18next";
import {
  DEFAULT_TWILIGHT_BACKDROP_BLUR,
  normalizeTwilightBackdropBlur,
  type AppSettings,
  type TwilightBackdropBlur,
} from "@pi-desktop/shared";
import { cx } from "../ui";
import { useAppStore } from "../../stores/app-store";

const OPTIONS: Array<{ value: TwilightBackdropBlur; label: string }> = [
  { value: "low", label: "settings.twilightBackdropBlurLow" },
  { value: "medium", label: "settings.twilightBackdropBlurMedium" },
  { value: "high", label: "settings.twilightBackdropBlurHigh" },
];

/** Controls only the scenic chat backdrop image; glass surfaces have separate fixed materials. */
export function TwilightBackdropBlurRow({
  settings,
  saveSettings,
}: {
  settings: AppSettings;
  saveSettings: (patch: Partial<AppSettings>) => Promise<void>;
}) {
  const { t } = useTranslation();
  const showToast = useAppStore((state) => state.showToast);
  const current = normalizeTwilightBackdropBlur(
    settings.twilightBackdropBlur ?? DEFAULT_TWILIGHT_BACKDROP_BLUR,
  );
  const enabled = settings.theme === "twilight-mountains";

  const choose = (value: TwilightBackdropBlur) => {
    if (!enabled || value === current) return;
    void saveSettings({ twilightBackdropBlur: value }).catch((error) =>
      showToast(error instanceof Error ? error.message : String(error), {
        variant: "error",
      }),
    );
  };

  return (
    <div className="settings-row">
      <div className="settings-row-copy">
        <div className="settings-row-title">{t("settings.twilightBackdropBlur")}</div>
        <div className="settings-row-desc">{t("settings.twilightBackdropBlurDesc")}</div>
      </div>
      <div className="settings-row-control">
        <div
          className={cx("settings-segment", !enabled && "is-disabled")}
          role="radiogroup"
          aria-label={t("settings.twilightBackdropBlur")}
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
