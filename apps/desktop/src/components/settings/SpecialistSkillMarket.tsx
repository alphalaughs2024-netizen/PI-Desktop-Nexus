import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import type { UserSkillRecord } from "@pi-desktop/shared";
import { ArrowLeft, Check, Code2, FileText, Search, X } from "lucide-react";
import { api } from "../../lib/api";
import { useAppStore } from "../../stores/app-store";
import { SPECIALIST_SKILLS, specialistSkillBody, type SpecialistCategory, type SpecialistSkill } from "./specialist-skills/catalog";
import licenseText from "./specialist-skills/LICENSE.txt?raw";

const CATEGORIES: Array<"All" | SpecialistCategory> = ["All", "Design", "Coding", "Data", "Business", "Infrastructure"];

export function SpecialistSkillMarket({
  installed,
  onInstalled,
  onBack,
}: {
  installed: UserSkillRecord[];
  onInstalled: () => Promise<unknown>;
  onBack: () => void;
}) {
  const { t } = useTranslation();
  const showToast = useAppStore((state) => state.showToast);
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>("All");
  const [query, setQuery] = useState("");
  const [preview, setPreview] = useState<SpecialistSkill | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  useEffect(() => {
    if (!preview) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPreview(null);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [preview]);
  const installedNames = new Set(installed.map((skill) => skill.name.toLocaleLowerCase()));
  const installedIds = new Set(installed.map((skill) => skill.id));
  const isInstalled = (skill: SpecialistSkill) => installedIds.has(skill.id) || installedNames.has(skill.name.toLocaleLowerCase());
  const categoryLabel = (item: SpecialistCategory) => t(`settings.specialistCategory${item}`);

  const visible = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return SPECIALIST_SKILLS.filter((skill) =>
      (category === "All" || skill.category === category)
      && (!needle || [skill.name, skill.description, skill.category, skill.source].some((value) => value.toLocaleLowerCase().includes(needle))),
    );
  }, [category, query]);

  const install = async (skill: SpecialistSkill) => {
    if (busyId || isInstalled(skill)) return;
    setBusyId(skill.id);
    try {
      await api.createUserSkill({
        id: skill.id,
        name: skill.name,
        description: skill.description,
        body: specialistSkillBody(skill.document),
        level: "global",
        enabled: true,
      });
      await onInstalled();
      showToast(t("settings.specialistSkillInstalled", { name: skill.name }), { variant: "success" });
    } catch (error) {
      showToast(error instanceof Error ? error.message : String(error), { variant: "error" });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="specialist-market">
      <div className="specialist-market-top">
        <button className="specialist-market-back" type="button" onClick={onBack}>
          <ArrowLeft size={14} aria-hidden="true" /> {t("settings.mySkills")}
        </button>
        <div className="specialist-market-heading">
          <div>
            <h2>{t("settings.specialistSkillMarket")}</h2>
            <p>{t("settings.specialistMarketSubtitle")}</p>
          </div>
          <label className="specialist-market-search">
            <Search size={16} aria-hidden="true" />
            <span className="sr-only">{t("settings.searchSpecialistSkills")}</span>
            <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("settings.searchSpecialistSkills")} />
          </label>
        </div>
      </div>
      <div className="specialist-market-filters" role="group" aria-label={t("settings.specialistCategory")}>
        {CATEGORIES.map((item) => (
          <button key={item} type="button" className={category === item ? "active" : ""} aria-pressed={category === item} onClick={() => setCategory(item)}>
            {item === "All" ? t("settings.capabilityFilterAll") : categoryLabel(item)}
          </button>
        ))}
      </div>
      {visible.length ? (
        <div className="specialist-market-grid">
          {visible.map((skill) => (
            <article className="specialist-market-card" key={skill.id}>
              <div className="specialist-market-card-icon" aria-hidden="true">
                {skill.category === "Coding" || skill.category === "Infrastructure" ? <Code2 size={19} /> : <FileText size={19} />}
              </div>
              <div className="specialist-market-card-main">
                <button type="button" className="specialist-market-title" onClick={() => setPreview(skill)}>{skill.name}</button>
                <span className="specialist-market-category">{categoryLabel(skill.category)}</span>
                <p>{skill.description}</p>
                <span className="specialist-market-source">{skill.source}</span>
              </div>
              <button
                className="specialist-market-install"
                type="button"
                disabled={isInstalled(skill) || busyId !== null}
                aria-label={t(isInstalled(skill) ? "settings.specialistInstalledName" : "settings.specialistInstallName", { name: skill.name })}
                onClick={() => void install(skill)}
              >
                {isInstalled(skill) ? <><Check size={13} aria-hidden="true" /> {t("settings.specialistInstalled")}</> : busyId === skill.id ? t("settings.specialistInstalling") : t("settings.specialistInstall")}
              </button>
            </article>
          ))}
        </div>
      ) : <div className="specialist-market-empty">{t("settings.capabilityNoMatches")}</div>}
      {preview && typeof document !== "undefined" ? createPortal(
        <div className="overlay ext-sheet-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setPreview(null); }}>
          <div className="dialog ext-sheet specialist-market-preview" role="dialog" aria-modal="true" aria-labelledby="specialist-preview-title">
            <div className="ext-sheet-head">
              <div>
                <h3 id="specialist-preview-title" className="ext-sheet-title">{preview.name}</h3>
                <p className="ext-sheet-sub">{categoryLabel(preview.category)} · {preview.source}</p>
              </div>
              <button type="button" className="ext-sheet-close" aria-label={t("common.close")} autoFocus onClick={() => setPreview(null)}><X size={16} /></button>
            </div>
            <div className="ext-sheet-body">
              <pre className="ext-skill-body">{preview.document}</pre>
              <details className="specialist-market-license">
                <summary>{t("settings.specialistLicense")}</summary>
                <pre>{licenseText}</pre>
              </details>
            </div>
            <div className="ext-sheet-actions">
              <span className="ext-sheet-note">{t("settings.specialistPreviewNote")}</span>
              <div className="ext-sheet-actions-end">
                <button type="button" className="specialist-market-install" disabled={isInstalled(preview) || busyId !== null} onClick={() => void install(preview)}>
                  {isInstalled(preview) ? t("settings.specialistInstalled") : busyId === preview.id ? t("settings.specialistInstalling") : t("settings.specialistInstall")}
                </button>
              </div>
            </div>
          </div>
        </div>, document.body,
      ) : null}
    </div>
  );
}
