import { deEntries } from "./changelog-de.js";
import { esEntries } from "./changelog-es.js";
import { frEntries } from "./changelog-fr.js";
import { koEntries } from "./changelog-ko.js";
import { trEntries } from "./changelog-tr.js";

export type ChangelogLocale = "en" | "zh-CN" | "zh-TW" | "tr" | "de" | "es" | "fr" | "ko";

export type ChangelogEntry = {
  version: string;
  date?: string;
  highlights: string[];
};

const enEntries: ChangelogEntry[] = [{
  version: "0.0.2",
  date: "2026-09-18",
  highlights: ["Keeps update failures readable with concise in-app feedback while preserving diagnostic details in local logs."],
}, {
  version: "0.0.1",
  date: "2026-09-17",
  highlights: ["Establish PI Desktop Nexus as an independent local-first AI coding workspace with managed workspaces, workflow packages, Context Vault, and scenic themes."],
}];

const zhCNEntries: ChangelogEntry[] = [{
  version: "0.0.2",
  date: "2026-09-18",
  highlights: ["更新失败时显示简洁易懂的应用内提示，同时将诊断细节保留在本地日志中。"],
}, {
  version: "0.0.1",
  date: "2026-09-17",
  highlights: ["将 PI Desktop Nexus 确立为独立的本地优先 AI 编程工作区，提供受管工作区、工作流包、Context Vault 和风景主题。"],
}];

const zhTWEntries: ChangelogEntry[] = [{
  version: "0.0.2",
  date: "2026-09-18",
  highlights: ["更新失敗時顯示簡潔易懂的應用程式內提示，同時將診斷細節保留在本機記錄中。"],
}, {
  version: "0.0.1",
  date: "2026-09-17",
  highlights: ["將 PI Desktop Nexus 確立為獨立的本機優先 AI 程式設計工作區，提供受管理工作區、工作流程套件、Context Vault 與風景主題。"],
}];

/** Locale → newest-first product notes. */
export const CHANGELOG: Record<ChangelogLocale, readonly ChangelogEntry[]> = {
  en: enEntries,
  "zh-CN": zhCNEntries,
  "zh-TW": zhTWEntries,
  tr: trEntries,
  de: deEntries,
  es: esEntries,
  fr: frEntries,
  ko: koEntries,
};

/** Normalize `v0.2.7` / whitespace to the catalog key form. */
export function normalizeChangelogVersion(
  version: string | null | undefined,
): string {
  return String(version ?? "")
    .trim()
    .replace(/^v/i, "");
}

export function resolveChangelogLocale(
  input?: string | null,
): ChangelogLocale {
  const value = (input || "").replaceAll("_", "-").toLowerCase();
  if (
    value === "zh-tw" ||
    value.startsWith("zh-tw-") ||
    value === "zh-hant" ||
    value.startsWith("zh-hant-") ||
    value === "zh-hk" ||
    value.startsWith("zh-hk-") ||
    value === "zh-mo" ||
    value.startsWith("zh-mo-")
  ) {
    return "zh-TW";
  }
  if (value.startsWith("zh")) return "zh-CN";
  if (value === "tr" || value.startsWith("tr-")) return "tr";
  if (value === "de" || value.startsWith("de-")) return "de";
  if (value === "es" || value.startsWith("es-")) return "es";
  if (value === "fr" || value.startsWith("fr-")) return "fr";
  if (value === "ko" || value.startsWith("ko-")) return "ko";
  return "en";
}

export function getChangelogEntry(
  version: string | null | undefined,
  locale: ChangelogLocale = "en",
): ChangelogEntry | undefined {
  const key = normalizeChangelogVersion(version);
  if (!key) return undefined;
  const catalog = CHANGELOG[locale] ?? CHANGELOG.en;
  return catalog.find((entry) => entry.version === key);
}

/**
 * Format highlights as plain multi-line text for UpdateState / compact UI.
 * Returns undefined when the version has no catalog entry or empty highlights.
 */
export function formatChangelogNotes(
  version: string | null | undefined,
  localeInput?: string | null,
): string | undefined {
  const locale = resolveChangelogLocale(localeInput);
  const entry =
    getChangelogEntry(version, locale) ??
    (locale === "en" ? undefined : getChangelogEntry(version, "en"));
  if (!entry?.highlights.length) return undefined;
  return entry.highlights.map((line) => `• ${line}`).join("\n");
}
