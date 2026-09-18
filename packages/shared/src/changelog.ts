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
  version: "0.0.4",
  date: "2026-09-18",
  highlights: [
    "Added an explicitly confirmed Full access permission mode for trusted Agent sessions while preserving host security restrictions and permission-card behavior.",
    "Added database schema v16 → v17 migration with a backup, preserving existing sessions, transcripts, and indexes.",
    "Fixed startup compatibility for data created by the Full access experimental build.",
  ],
}, {
  version: "0.0.3",
  date: "2026-09-18",
  highlights: [
    "Reduced sidebar indentation between groups, projects, and sessions while preserving hierarchy, focus states, chevrons, themes, drop indicators, and compact rows.",
    "Added project groups, persistent ordering, many-to-many membership, scoped project memory, empty-group assignment, and anchored project organization panels.",
    "Added safe drag-and-drop project organization with explicit handles, keyboard/menu alternatives, and actions for rename, reorder, membership, and deletion without deleting project data.",
    "Added drag-and-drop session movement between projects with confirmation for non-empty sessions, Shift-drag bypass, immediate empty-session moves, running-session protection, and preserved session identity and transcripts.",
    "Removed persistent project-path tooltips that obstructed the sidebar.",
  ],
}, {
  version: "0.0.2",
  date: "2026-09-18",
  highlights: ["Keeps update failures readable with concise in-app feedback while preserving diagnostic details in local logs."],
}, {
  version: "0.0.1",
  date: "2026-09-17",
  highlights: ["Establish PI Desktop Nexus as an independent local-first AI coding workspace with managed workspaces, workflow packages, Context Vault, and scenic themes."],
}];

const zhCNEntries: ChangelogEntry[] = [{
  version: "0.0.4",
  date: "2026-09-18",
  highlights: [
    "新增需要明确确认的完全访问模式，供可信的 Agent 会话使用，同时保留主机安全限制。",
    "新增带备份的数据架构 v16 → v17 迁移，并保留现有会话、转录和索引。",
    "修复使用实验性完全访问构建生成的数据时的启动兼容性问题。",
  ],
}, {
  version: "0.0.3",
  date: "2026-09-18",
  highlights: [
    "减少侧边栏中分组、项目和会话之间的缩进，同时保留层级、焦点状态、折叠箭头、主题和放置指示器。",
    "新增项目分组、持久排序、多项目归属、项目级记忆、空分组分配以及停靠式项目管理面板。",
    "新增安全的项目拖放整理，并保留明确拖动手柄、键盘/菜单替代操作，以及重命名、排序、成员管理和删除项目关系的操作。",
    "新增项目间会话拖放，非空会话移动需确认，按住 Shift 可跳过确认，空会话立即移动；运行中的会话受到保护，会话身份和转录保持不变。",
    "移除会遮挡侧边栏的持久项目路径提示。",
  ],
}, {
  version: "0.0.2",
  date: "2026-09-18",
  highlights: ["更新失败时显示简洁易懂的应用内提示，同时将诊断细节保留在本地日志中。"],
}, {
  version: "0.0.1",
  date: "2026-09-17",
  highlights: ["将 PI Desktop Nexus 确立为独立的本地优先 AI 编程工作区，提供受管工作区、工作流包、Context Vault 和风景主题。"],
}];

const zhTWEntries: ChangelogEntry[] = [{
  version: "0.0.4",
  date: "2026-09-18",
  highlights: [
    "新增需要明確確認的完整存取模式，供可信任的 Agent 工作階段使用，同時保留主機安全限制。",
    "新增含備份的資料庫結構 v16 → v17 遷移，並保留現有工作階段、轉錄與索引。",
    "修正使用實驗性完整存取建置所產生資料時的啟動相容性問題。",
  ],
}, {
  version: "0.0.3",
  date: "2026-09-18",
  highlights: [
    "減少側邊欄中群組、專案與工作階段之間的縮排，同時保留階層、焦點狀態、摺疊箭頭、主題與放置指示器。",
    "新增專案群組、持久排序、多專案歸屬、專案級記憶、空群組指派與停靠式專案管理面板。",
    "新增安全的專案拖放整理，並保留明確拖曳控制、鍵盤/選單替代操作，以及重新命名、排序、成員管理與關係刪除操作。",
    "新增專案間工作階段拖放；非空工作階段移動需確認，按住 Shift 可略過確認，空工作階段立即移動；執行中的工作階段受到保護，身分與轉錄保持不變。",
    "移除會遮擋側邊欄的持久專案路徑提示。",
  ],
}, {
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
