import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type AnimationEventHandler as ReactAnimationEventHandler,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { Fragment } from "react";
import { TooltipButton, cx } from "./ui";

// --- Time-based session grouping ---
type TimeGroup = "today" | "yesterday" | "thisWeek" | "older14d" | "archived";

function getTimeGroup(dateStr?: string): TimeGroup {
  if (!dateStr) return "older14d";
  const ts = Date.parse(dateStr);
  if (!Number.isFinite(ts)) return "older14d";
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfYesterday = startOfToday - 86400000;
  const startOfWeek = startOfToday - 6 * 86400000; // last 7 days
  const startOf14d = startOfToday - 13 * 86400000;
  if (ts >= startOfToday) return "today";
  if (ts >= startOfYesterday) return "yesterday";
  if (ts >= startOfWeek) return "thisWeek";
  if (ts >= startOf14d) return "older14d";
  return "archived"; // older than 14 days
}

const TIME_GROUP_ORDER: TimeGroup[] = ["today", "yesterday", "thisWeek", "older14d", "archived"];
/** Default number of most-recent sessions shown per project group before the rest fold. */
const MAX_VISIBLE_SESSIONS = 10;
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { api } from "../lib/api";
import { isDefaultSessionTitle, useAppStore } from "../stores/app-store";
import { normalizeProjectPath } from "../lib/sidebar-session-groups";
import {
  projectCollectionDragShouldArm,
  projectCollectionInsertAfter,
} from "../lib/sidebar-project-collection-drag";
import {
  sidebarSessionStatus,
  type SidebarSessionStatus,
} from "../lib/sidebar-session-status";
import type {
  Mode,
  PermissionMode,
  ProjectWorkspace,
  SessionSummary,
} from "@pi-desktop/shared";
import type {
  ProjectMeta,
  SessionMeta,
  SessionSort,
} from "../lib/sidebar-preferences";
import {
  clampSidebarWidth,
  SIDEBAR_WIDTH_MAX,
  SIDEBAR_WIDTH_MIN,
} from "../lib/sidebar-preferences";
import { BrandLogo } from "./BrandLogo";
import { NotificationCenter } from "./NotificationCenter";
import { ProjectRenameDialog, SessionRenameDialog } from "./SessionRenameDialog";
import { ProjectGroupCreateDialog } from "./ProjectGroupCreateDialog";
import { ProjectCollectionPicker } from "./ProjectCollectionPicker";
import { useUpdateState } from "../hooks/use-update-state";
import {
  IconArchive,
  IconArchiveRestore,
  IconArrowUpDown,
  IconArrowUp,
  IconArrowDown,
  IconPlug,
  IconBranch,
  IconCheck,
  IconChevronDown,
  IconClock,
  IconCopy,
  IconCircleAlert,
  IconNewSession,
  IconFolder,
  IconMore,
  IconNewProject,
  IconPin,
  IconPencil,
  IconPlus,
  IconSidebar,
  IconSettings,
  IconStar,
  IconX,
  IconTrash,
} from "./icons";

type ProjectEntry = {
  path: string;
  key: string;
  name: string;
  sessions: SessionSummary[];
  open: boolean;
  active: boolean;
  meta: ProjectMeta;
  /** Best-effort git branch from the project workspace, if known. */
  branch?: string;
};

type SessionHoverCard = {
  id: string;
  top: number;
  left: number;
  title: string;
  mode: Mode;
  permissionMode: PermissionMode;
  space: string;
  branch?: string;
  updatedAt: string;
  temporary: boolean;
};

const VIEWPORT_PADDING = 8;
const SIDEBAR_RESIZE_STEP = 16;

type SidebarResizeState = {
  pointerId: number;
  startX: number;
  startWidth: number;
  currentWidth: number;
  frame: number;
  handle: HTMLDivElement;
};

function clearSidebarResizeStyles(): void {
  document.documentElement.removeAttribute("data-sidebar-resizing");
}

function projectName(path: string, fallback?: string) {
  if (fallback?.trim()) return fallback.trim();
  const clean = path.replace(/[\\/]+$/, "");
  const parts = clean.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] || path;
}

function timestamp(value?: string) {
  const parsed = value ? Date.parse(value) : 0;
  return Number.isFinite(parsed) ? parsed : 0;
}

function optionalTimestamp(value?: string): number | null {
  const parsed = value ? Date.parse(value) : NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

function sessionArchived(
  session: SessionSummary,
  meta: SessionMeta | undefined,
): boolean {
  return Boolean(meta?.archived || (session as SessionSummary & { archived?: boolean }).archived);
}

function sessionPinned(
  session: SessionSummary,
  meta: SessionMeta | undefined,
): boolean {
  return Boolean(meta?.pinned || (session as SessionSummary & { pinned?: boolean }).pinned);
}

function projectMetaFor(
  path: string,
  projectMeta: Record<string, ProjectMeta>,
): ProjectMeta {
  return projectMeta[normalizeProjectPath(path) || path] ?? projectMeta[path] ?? {};
}

function projectDomId(path: string): string {
  let hash = 2166136261;
  for (let index = 0; index < path.length; index += 1) {
    hash ^= path.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `sidebar-project-${(hash >>> 0).toString(36)}`;
}

function firstSessionDate(
  sessions: SessionSummary[],
  field: "createdAt" | "updatedAt",
): number | null {
  const values = sessions
    .map((session) => timestamp(session[field]))
    .filter((value) => value > 0);
  return values.length ? Math.min(...values) : null;
}

function lastSessionDate(
  sessions: SessionSummary[],
  field: "createdAt" | "updatedAt",
): number | null {
  const values = sessions
    .map((session) => timestamp(session[field]))
    .filter((value) => value > 0);
  return values.length ? Math.max(...values) : null;
}

function compareOptionalDate(
  a: number | null,
  b: number | null,
  descending: boolean,
): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return descending ? b - a : a - b;
}

export function Sidebar({
  onToggleSidebar,
  sidebarToggleShortcut,
  sidebarWidth,
  onWidthChange,
  onWidthCommit,
  className,
  onAnimationEnd,
}: {
  onToggleSidebar: () => void;
  sidebarToggleShortcut: string;
  sidebarWidth: number;
  onWidthChange: (width: number) => void;
  onWidthCommit: (width: number) => void;
  className?: string;
  onAnimationEnd?: ReactAnimationEventHandler<HTMLElement>;
}) {
  const { t, i18n } = useTranslation();
  const sessions = useAppStore((s) => s.sessions);
  const activeSessionId = useAppStore((s) => s.activeSessionId);
  const selectingSessionId = useAppStore((s) => s.selectingSessionId);
  const workspace = useAppStore((s) => s.workspace);
  const openProjects = useAppStore((s) => s.openProjects);
  const openProjectPathsState = useAppStore((s) => s.openProjectPaths);
  const activeProjectPathState = useAppStore((s) => s.activeProjectPath);
  const projectMeta = useAppStore((s) => s.projectMeta);
  const projectCollapsed = useAppStore((s) => s.projectCollapsed);
  const sessionMeta = useAppStore((s) => s.sessionMeta);
  const sessionView = useAppStore((s) => s.sessionView);
  const projectSort = useAppStore((s) => s.projectSort);
  const projectCollections = useAppStore((s) => s.projectCollections);
  const projectCollectionMemberships = useAppStore((s) => s.projectCollectionMemberships);
  const runningSessions = useAppStore((s) => s.runningSessions);
  const sessionOutcomes = useAppStore((s) => s.sessionOutcomes);
  const pendingPermissions = useAppStore((s) => s.pendingPermissions);
  const setPage = useAppStore((s) => s.setPage);
  const page = useAppStore((s) => s.page);
  const settings = useAppStore((s) => s.settings);
  const prefetchSession = useAppStore((s) => s.prefetchSession);
  const selectSession = useAppStore((s) => s.selectSession);
  const newSession = useAppStore((s) => s.newSession);
  const forkSessionAction = useAppStore((s) => s.forkSession);
  const openProject = useAppStore((s) => s.openProject);
  const refreshProject = useAppStore((s) => s.refreshProject);
  const clearProject = useAppStore((s) => s.clearProject);
  const activateProject = useAppStore((s) => s.activateProject);
  const closeProjectAction = useAppStore((s) => s.closeProject);
  const renameProject = useAppStore((s) => s.renameProject);
  const toggleSessionPinned = useAppStore((s) => s.toggleSessionPinned);
  const archiveSessionAction = useAppStore((s) => s.archiveSession);
  const restoreSession = useAppStore((s) => s.restoreSession);
  const renameSession = useAppStore((s) => s.renameSession);
  const deleteSessionAction = useAppStore((s) => s.deleteSession);
  const setSessionSort = useAppStore((s) => s.setSessionSort);
  const setSessionArchiveVisibility = useAppStore((s) => s.setSessionArchiveVisibility);
  const toggleProjectPinned = useAppStore((s) => s.toggleProjectPinned);
  const archiveProjectAction = useAppStore((s) => s.archiveProject);
  const restoreProject = useAppStore((s) => s.restoreProject);
  const setProjectCollapsed = useAppStore((s) => s.setProjectCollapsed);
  const setProjectSort = useAppStore((s) => s.setProjectSort);
  const createProjectGroup = useAppStore((s) => s.createProjectGroup);
  const createCollection = useAppStore((s) => s.createCollection);
  const addProjectToCollection = useAppStore((s) => s.addProjectToCollection);
  const removeProjectFromCollection = useAppStore((s) => s.removeProjectFromCollection);
  const setProjectGroupCollapsed = useAppStore((s) => s.setProjectGroupCollapsed);
  const renameProjectCollection = useAppStore((s) => s.renameProjectCollection);
  const deleteProjectCollection = useAppStore((s) => s.deleteProjectCollection);
  const moveProjectCollection = useAppStore((s) => s.moveProjectCollection);
  const moveProjectWithinCollection = useAppStore((s) => s.moveProjectWithinCollection);
  const moveProjectToCollection = useAppStore((s) => s.moveProjectToCollection);
  const moveSessionToProject = useAppStore((s) => s.moveSessionToProject);
  const showToast = useAppStore((s) => s.showToast);
  const version = useAppStore((s) => s.version);
  const setSettingsTab = useAppStore((s) => s.setSettingsTab);
  const setSettingsAnchor = useAppStore((s) => s.setSettingsAnchor);
  const update = useUpdateState();

  const [sortOpen, setSortOpen] = useState(false);
  const [sessionMenu, setSessionMenu] = useState<string | null>(null);
  const [renameFor, setRenameFor] = useState<SessionSummary | null>(null);
  const [renameProjectFor, setRenameProjectFor] = useState<ProjectEntry | null>(null);
  const [createGroupOpen, setCreateGroupOpen] = useState(false);
  const [collectionPickerFor, setCollectionPickerFor] = useState<ProjectEntry | null>(null);
  const [collectionAssignmentFor, setCollectionAssignmentFor] = useState<string | null>(null);
  const [collectionPickerAnchor, setCollectionPickerAnchor] = useState<HTMLElement | null>(null);
  const collectionPickerReturnFocusRef = useRef<HTMLElement | null>(null);
  const createGroupReturnFocusRef = useRef<HTMLElement | null>(null);
  const [projectMenu, setProjectMenu] = useState<string | null>(null);
  const [collectionMenu, setCollectionMenu] = useState<string | null>(null);
  const [draggedProject, setDraggedProject] = useState<{ path: string; collectionId: string | null } | null>(null);
  const [draggedCollection, setDraggedCollection] = useState<string | null>(null);
  const [draggingSessionId, setDraggingSessionId] = useState<string | null>(null);
  const collectionDragRef = useRef<{ kind: "project" | "collection"; path?: string; collectionId?: string | null; pointerId: number; startX: number; startY: number; armed: boolean } | null>(null);

  const startCollectionDrag = useCallback((event: ReactPointerEvent, payload: { kind: "project" | "collection"; path?: string; collectionId?: string | null }) => {
    if (event.button !== 0) return;
    if ((event.target as HTMLElement).closest("button, a, input, textarea, select")) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    collectionDragRef.current = { ...payload, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, armed: false };
  }, []);

  const moveCollectionDrag = useCallback((event: ReactPointerEvent) => {
    const drag = collectionDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (!drag.armed && !projectCollectionDragShouldArm(event.clientX - drag.startX, event.clientY - drag.startY)) return;
    if (!drag.armed) {
      drag.armed = true;
      if (drag.kind === "project" && drag.path) setDraggedProject({ path: drag.path, collectionId: drag.collectionId ?? null });
      if (drag.kind === "collection" && drag.collectionId) setDraggedCollection(drag.collectionId);
    }
  }, []);

  const endCollectionDrag = useCallback((event: ReactPointerEvent) => {
    if (collectionDragRef.current?.pointerId === event.pointerId) collectionDragRef.current = null;
    setDraggedProject(null);
    setDraggedCollection(null);
  }, []);

  useEffect(() => {
    const cancel = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      collectionDragRef.current = null;
      setDraggedProject(null);
      setDraggedCollection(null);
    };
    window.addEventListener("keydown", cancel);
    return () => window.removeEventListener("keydown", cancel);
  }, []);

  const finishCollectionDrop = useCallback((event: ReactPointerEvent) => {
    const drag = collectionDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const target = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>("[data-sidebar-project-folder], [data-project-collection-row]");
    if (drag.armed && target) {
      const targetFolder = target.closest<HTMLElement>("[data-sidebar-project-folder]");
      const targetCollectionId = targetFolder?.dataset.sidebarProjectFolder;
      const targetProjectPath = target.dataset.projectCollectionRow;
      if (drag.kind === "collection" && drag.collectionId && targetCollectionId && targetCollectionId !== "ungrouped") {
        const index = projectCollections.findIndex((collection) => collection.id === targetCollectionId);
        if (index >= 0 && targetCollectionId !== drag.collectionId) moveProjectCollection(drag.collectionId, index);
      }
      if (drag.kind === "project" && drag.path) {
        if (targetCollectionId === "ungrouped" && drag.collectionId) removeProjectFromCollection(drag.path, drag.collectionId);
        else if (targetCollectionId && targetCollectionId !== "ungrouped") {
          const targetEntries = projectCollectionMemberships.filter((item) => item.collectionId === targetCollectionId).sort((a, b) => a.order - b.order);
          const targetIndex = targetProjectPath ? Math.max(0, targetEntries.findIndex((item) => item.projectPath === targetProjectPath) + (projectCollectionInsertAfter(event.clientY, target.getBoundingClientRect().top, target.getBoundingClientRect().height) ? 1 : 0)) : targetEntries.length;
          moveProjectToCollection(drag.path, drag.collectionId ?? null, targetCollectionId, targetIndex);
        }
      }
    }
    endCollectionDrag(event);
  }, [endCollectionDrag, moveProjectCollection, moveProjectToCollection, projectCollectionMemberships, projectCollections, removeProjectFromCollection]);
  const [sectionMenu, setSectionMenu] = useState<"sessions" | "projects" | null>(null);
  const [menuPosition, setMenuPosition] = useState<{
    top: number;
    left: number;
  } | null>(null);
  const [sessionHoverCard, setSessionHoverCard] = useState<SessionHoverCard | null>(null);
  const [expandedProjectSessions, setExpandedProjectSessions] = useState<Record<string, boolean>>({});
  const [sidebarResizing, setSidebarResizing] = useState(false);
  const menuTriggerRef = useRef<HTMLButtonElement | null>(null);
  const menuFirstItemRef = useRef<HTMLButtonElement | null>(null);
  const sessionPrefetchTimerRef = useRef<number | undefined>(undefined);
  const sessionHoverTimerRef = useRef<number | undefined>(undefined);
  const sessionHoverTargetRef = useRef<HTMLElement | null>(null);
  const sidebarResizeRef = useRef<SidebarResizeState | null>(null);

  const handleSessionDrop = useCallback(async (event: React.DragEvent, projectPath: string) => {
    event.preventDefault();
    const sessionId = event.dataTransfer.getData("application/x-nexus-session") || event.dataTransfer.getData("text/plain");
    if (!sessionId) return;
    const session = sessions.find((candidate) => candidate.id === sessionId);
    if (!session || normalizeProjectPath(session.projectPath ?? "") === normalizeProjectPath(projectPath)) return;
    if (runningSessions[sessionId]) {
      showToast(t("errors.sessionRunningCannotMove", { defaultValue: "Running sessions cannot be moved." }), { variant: "error" });
      return;
    }
    if (session.messageCount > 0 && !event.shiftKey && !window.confirm(t("nav.confirmMoveSession", { defaultValue: "Move this conversation to the selected project?" }))) return;
    try {
      await moveSessionToProject(sessionId, projectPath);
    } catch (error) {
      showToast(error instanceof Error ? error.message : String(error), { variant: "error" });
    } finally {
      setDraggingSessionId(null);
    }
  }, [moveSessionToProject, runningSessions, sessions, showToast, t]);

  const finishSidebarResize = useCallback((cancelled: boolean) => {
    const state = sidebarResizeRef.current;
    if (!state) return;
    if (cancelled) {
      onWidthChange(state.startWidth);
    } else {
      onWidthChange(state.currentWidth);
      onWidthCommit(state.currentWidth);
    }
    sidebarResizeRef.current = null;
    if (state.frame) cancelAnimationFrame(state.frame);
    clearSidebarResizeStyles();
    if (state.handle.hasPointerCapture(state.pointerId)) {
      state.handle.releasePointerCapture(state.pointerId);
    }
    setSidebarResizing(false);
  }, [onWidthChange, onWidthCommit]);

  const startSidebarResize = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || sidebarResizeRef.current) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.focus({ preventScroll: true });
    const startWidth = clampSidebarWidth(sidebarWidth);
    sidebarResizeRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startWidth,
      currentWidth: startWidth,
      frame: 0,
      handle: event.currentTarget,
    };
    setSidebarResizing(true);
    document.documentElement.setAttribute("data-sidebar-resizing", "true");
    event.currentTarget.setPointerCapture(event.pointerId);
  }, [sidebarWidth]);

  const moveSidebarResize = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const state = sidebarResizeRef.current;
    if (!state || state.pointerId !== event.pointerId) return;
    const nextWidth = clampSidebarWidth(state.startWidth + event.clientX - state.startX);
    state.currentWidth = nextWidth;
    if (state.frame) return;
    state.frame = requestAnimationFrame(() => {
      if (sidebarResizeRef.current !== state) return;
      state.frame = 0;
      onWidthChange(state.currentWidth);
    });
  }, [onWidthChange]);

  const endSidebarResize = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (sidebarResizeRef.current?.pointerId !== event.pointerId) return;
    finishSidebarResize(false);
  }, [finishSidebarResize]);

  const cancelSidebarResize = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (sidebarResizeRef.current?.pointerId !== event.pointerId) return;
    finishSidebarResize(true);
  }, [finishSidebarResize]);

  const handleSidebarResizeKeyDown = useCallback((event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    event.stopPropagation();
    const currentWidth = clampSidebarWidth(sidebarWidth);
    const nextWidth = event.key === "Home"
      ? SIDEBAR_WIDTH_MIN
      : event.key === "End"
        ? SIDEBAR_WIDTH_MAX
        : clampSidebarWidth(
            currentWidth + (event.key === "ArrowRight" ? SIDEBAR_RESIZE_STEP : -SIDEBAR_RESIZE_STEP),
          );
    if (nextWidth === currentWidth) return;
    onWidthCommit(nextWidth);
  }, [onWidthCommit, sidebarWidth]);

  useEffect(() => {
    if (!sidebarResizing) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      finishSidebarResize(true);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [finishSidebarResize, sidebarResizing]);

  useEffect(() => {
    return () => {
      const state = sidebarResizeRef.current;
      if (!state) return;
      if (state.frame) cancelAnimationFrame(state.frame);
      onWidthChange(state.startWidth);
      clearSidebarResizeStyles();
      sidebarResizeRef.current = null;
    };
  }, [onWidthChange]);

  const showArchived = sessionView.archived;
  const sessionSort = sessionView.sort;
  const displaySessionSort: Exclude<SessionSort, "manual"> =
    sessionSort === "manual" ? "recent" : sessionSort;
  const displayProjectSort: Exclude<SessionSort, "manual"> =
    projectSort === "manual" ? "recent" : projectSort;
  const activeProjectPath = normalizeProjectPath(activeProjectPathState ?? workspace?.path);
  const selectedSessionId = selectingSessionId ?? activeSessionId;
  const openProjectPaths = useMemo(
    () =>
      openProjectPathsState
        .map((path) => normalizeProjectPath(path))
        .filter((path): path is string => Boolean(path)),
    [openProjectPathsState],
  );

  const closeMenus = useCallback((restoreFocus = true) => {
    const trigger = menuTriggerRef.current;
    setSortOpen(false);
    setSessionMenu(null);
    setProjectMenu(null);
    setCollectionMenu(null);
    setSectionMenu(null);
    setMenuPosition(null);
    if (restoreFocus && trigger) requestAnimationFrame(() => trigger.focus());
  }, []);

  const placeMenu = useCallback((event: ReactMouseEvent<HTMLButtonElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    setMenuPosition({
      top: Math.max(
        VIEWPORT_PADDING,
        Math.min(rect.bottom + 4, window.innerHeight - 220),
      ),
      left: Math.max(VIEWPORT_PADDING, rect.right + 4),
    });
  }, []);

  // Body-level sidebar menus always anchor their left edge to the right side
  // of the trigger or pointer; they never flip to the left at the viewport edge.
  const placeMenuAtPoint = useCallback((x: number, y: number) => {
    setMenuPosition({
      top: Math.max(
        VIEWPORT_PADDING,
        Math.min(y + 4, window.innerHeight - 220),
      ),
      left: Math.max(VIEWPORT_PADDING, x + 4),
    });
  }, []);

  const openSessionRowMenu = useCallback(
    (sessionId: string, trigger: HTMLButtonElement | null) => {
      menuTriggerRef.current = trigger;
      setSortOpen(false);
      setProjectMenu(null);
      setCollectionMenu(null);
      setSectionMenu(null);
      sessionHoverTargetRef.current = null;
      window.clearTimeout(sessionHoverTimerRef.current);
      setSessionHoverCard(null);
      setSessionMenu(sessionId);
    },
    [],
  );

  const openProjectRowMenu = useCallback(
    (projectKey: string, trigger: HTMLButtonElement | null) => {
      menuTriggerRef.current = trigger;
      setSortOpen(false);
      setSessionMenu(null);
      setSectionMenu(null);
      setProjectMenu(projectKey);
      setCollectionMenu(null);
    },
    [],
  );

  const openCollectionRowMenu = useCallback((collectionId: string, trigger: HTMLButtonElement | null) => {
    menuTriggerRef.current = trigger;
    setSortOpen(false);
    setSessionMenu(null);
    setProjectMenu(null);
    setSectionMenu(null);
    setCollectionMenu(collectionId);
  }, []);

  // Match WorkBuddy's hover-card cadence: half a second is long enough for
  // the pointer to settle on the row, but short enough that a deliberate
  // hover does not feel sluggish.
  const PROJECT_PATH_HOVER_DELAY_MS = 500;

  const openSectionMenu = useCallback(
    (section: "sessions" | "projects", x: number, y: number) => {
      menuTriggerRef.current = null;
      setSortOpen(false);
      setSessionMenu(null);
      setProjectMenu(null);
      setCollectionMenu(null);
      placeMenuAtPoint(x, y);
      setSectionMenu(section);
    },
    [placeMenuAtPoint],
  );

  useEffect(() => {
    if (!sortOpen && !sessionMenu && !projectMenu && !collectionMenu && !sectionMenu) return;
    const onPointer = (e: PointerEvent) => {
      // Right-click must not dismiss first; contextmenu handlers reopen create menus.
      if (e.button === 2 || (e.pointerType === "mouse" && e.buttons === 2)) return;
      const target = e.target as Node;
      if ((target as Element)?.closest?.(
        ".sidebar-popover, .sidebar-row-menu, .notification-popover-portaled",
      )) return;
      closeMenus(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      closeMenus();
    };
    const onViewportChange = () => closeMenus(false);
    window.addEventListener("pointerdown", onPointer);
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", onViewportChange);
    return () => {
      window.removeEventListener("pointerdown", onPointer);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onViewportChange);
    };
  }, [sortOpen, sessionMenu, projectMenu, collectionMenu, sectionMenu, closeMenus]);

  useEffect(() => {
    if (!sessionMenu && !projectMenu && !collectionMenu && !sectionMenu && !sortOpen) return;
    requestAnimationFrame(() => menuFirstItemRef.current?.focus());
  }, [sessionMenu, projectMenu, collectionMenu, sectionMenu, sortOpen]);

  useEffect(() => {
    if (!sessionHoverCard) return;
    const hide = () => {
      window.clearTimeout(sessionHoverTimerRef.current);
      setSessionHoverCard(null);
    };
    window.addEventListener("resize", hide);
    return () => window.removeEventListener("resize", hide);
  }, [sessionHoverCard]);

  // Cancel any pending session hover-card reveal when the sidebar scrolls;
  // mirrors the project path tooltip behavior so the cards never anchor to a
  // row that has scrolled out from under the cursor.
  useEffect(() => {
    if (!sessionHoverCard) return;
    let frame = 0;
    const onScroll = () => {
      window.clearTimeout(sessionHoverTimerRef.current);
      if (!sessionHoverCard) return;
      frame = window.requestAnimationFrame(() => setSessionHoverCard(null));
    };
    window.addEventListener("scroll", onScroll, true);
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.cancelAnimationFrame(frame);
    };
  }, [sessionHoverCard]);

  // Footer utility bar: settings / plugins / notifications + build chip.

  // An update only earns the accent dot once it is actionable — a pending
  // check or a failed one keeps the chip quiet.
  const updateReady =
    update?.status === "available" || update?.status === "downloaded";
  const appVersion = update?.currentVersion || version?.version || "";
  const buildLabel = updateReady
    ? `v${update?.availableVersion ?? appVersion}`
    : update?.status === "checking"
      ? t("updates.checking")
      : appVersion
        ? `v${appVersion}`
        : t("nav.buildUnknown");
  const buildTitle = updateReady
    ? t("updates.available", { version: update?.availableVersion ?? "" })
    : t("nav.checkForUpdates");

  const onMenuKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      closeMenus();
      return;
    }
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    const items = Array.from(
      event.currentTarget.querySelectorAll<HTMLButtonElement>(
        '[role="menuitem"]:not(:disabled), [role="menuitemradio"]:not(:disabled), [role="menuitemcheckbox"]:not(:disabled)',
      ),
    );
    if (!items.length) return;
    event.preventDefault();
    const current = items.indexOf(document.activeElement as HTMLButtonElement);
    const next =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? items.length - 1
          : (current + (event.key === "ArrowDown" ? 1 : -1) + items.length) %
            items.length;
    items[next]?.focus();
  };

  const taskTitle = useCallback((title?: string | null) => {
    const value = (title || "").trim();
    return isDefaultSessionTitle(value) ? t("chat.untitledTask") : value;
  }, [t]);

  const filtered = useMemo(() => {
    const candidates = showArchived
      ? sessions
      : sessions.filter(
          (session) => !sessionArchived(session, sessionMeta[session.id]),
        );
    // Empty sessions are durable sidebar rows now. Their message count, not
    // their title, controls New Task reuse, so a manual rename never changes
    // the empty-slot behavior.
    return candidates;
  }, [sessions, showArchived, sessionMeta]);

  const compareSessions = useCallback((a: SessionSummary, b: SessionSummary) => {
    const aMeta = sessionMeta[a.id] ?? {};
    const bMeta = sessionMeta[b.id] ?? {};
    const archiveOrder = Number(sessionArchived(a, aMeta)) - Number(sessionArchived(b, bMeta));
    if (archiveOrder !== 0) return archiveOrder;
    const pinOrder = Number(sessionPinned(b, bMeta)) - Number(sessionPinned(a, aMeta));
    if (pinOrder !== 0) return pinOrder;
    if (displaySessionSort === "name") {
      const byName = taskTitle(a.title).localeCompare(taskTitle(b.title), undefined, {
        sensitivity: "base",
      });
      if (byName !== 0) return byName;
    } else if (displaySessionSort === "oldest") {
      const byCreated = compareOptionalDate(
        optionalTimestamp(a.createdAt),
        optionalTimestamp(b.createdAt),
        false,
      );
      if (byCreated !== 0) return byCreated;
    } else if (displaySessionSort === "created") {
      const byCreated = compareOptionalDate(
        optionalTimestamp(a.createdAt),
        optionalTimestamp(b.createdAt),
        true,
      );
      if (byCreated !== 0) return byCreated;
    } else {
      const byRecent = compareOptionalDate(
        optionalTimestamp(a.updatedAt),
        optionalTimestamp(b.updatedAt),
        true,
      );
      if (byRecent !== 0) return byRecent;
    }
    return a.id.localeCompare(b.id);
  }, [displaySessionSort, sessionMeta, taskTitle]);

  const projectEntries = useMemo(() => {
    const byPath = new Map<string, ProjectEntry>();
    const add = (rawPath: string, name?: string, branch?: string, open = false) => {
      const normalized = normalizeProjectPath(rawPath);
      if (!normalized) return;
      const existing = byPath.get(normalized);
      if (existing) {
        existing.open ||= open;
        if (name && existing.name === projectName(existing.path)) existing.name = name;
        if (branch && !existing.branch) existing.branch = branch;
        return;
      }
      const meta = projectMetaFor(rawPath, projectMeta);
      byPath.set(normalized, {
        path: rawPath,
        key: normalized,
        name: projectName(rawPath, meta.name ?? name),
        sessions: [],
        open,
        active: normalized === activeProjectPath,
        meta,
        branch,
      });
    };
    for (const path of openProjectPaths) {
      const record = openProjects.find(
        (project) => normalizeProjectPath(project.path) === path,
      );
      add(path, record?.name, record?.branch, true);
    }
    if (workspace?.path) add(workspace.path, workspace.name, workspace.branch, true);
    for (const session of filtered) {
      const sessionPath = normalizeProjectPath(session.projectPath);
      if (!sessionPath) continue;
      // Historical sessions keep their project visible even when that project
      // is not currently open. This is what makes the sidebar a complete
      // project -> sessions hierarchy instead of silently flattening them.
      add(sessionPath, undefined, undefined, false);
      const entry = byPath.get(sessionPath);
      if (entry) entry.sessions.push(session);
    }
    const result = [...byPath.values()].filter(
      (entry) => showArchived || !entry.meta.archived,
    );
    for (const entry of result) entry.sessions.sort(compareSessions);
    result.sort((a, b) => {
      const archiveOrder = Number(!!a.meta.archived) - Number(!!b.meta.archived);
      if (archiveOrder !== 0) return archiveOrder;
      const pinOrder = Number(!!b.meta.pinned) - Number(!!a.meta.pinned);
      if (pinOrder !== 0) return pinOrder;
      if (displayProjectSort === "name") {
        const byName = a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
        if (byName !== 0) return byName;
      } else if (
        displayProjectSort === "oldest" ||
        displayProjectSort === "created"
      ) {
        const dateForProject =
          displayProjectSort === "oldest" ? firstSessionDate : lastSessionDate;
        const aCreated = dateForProject(a.sessions, "createdAt");
        const bCreated = dateForProject(b.sessions, "createdAt");
        const byCreated = compareOptionalDate(
          aCreated,
          bCreated,
          displayProjectSort === "created",
        );
        if (byCreated !== 0) return byCreated;
      } else {
        const aRecent = lastSessionDate(a.sessions, "updatedAt");
        const bRecent = lastSessionDate(b.sessions, "updatedAt");
        const byRecent = compareOptionalDate(aRecent, bRecent, true);
        if (byRecent !== 0) return byRecent;
      }
      return a.key.localeCompare(b.key);
    });
    return result;
  }, [
    filtered,
    openProjectPaths,
    openProjects,
    workspace,
    activeProjectPath,
    projectMeta,
    showArchived,
    displayProjectSort,
    sessionMeta,
    compareSessions,
  ]);

  // Look up project entries by normalized path so session rows can fetch the
  // workspace name (and any other project metadata) for the hover card.
  const projectEntriesByPath = useMemo(() => {
    const map = new Map<string, ProjectEntry>();
    for (const entry of projectEntries) map.set(entry.key, entry);
    return map;
  }, [projectEntries]);

  // Locale-aware absolute timestamp matching the WorkBuddy card shape:
  // "2026-09-04 14:11:53" in zh-CN, "Sep 4, 2026, 2:11 PM" in en-US.
  const formatHoverCardTimestamp = useCallback(
    (value: string | undefined): string => {
      if (!value) return "—";
      const parsed = new Date(value);
      if (Number.isNaN(parsed.getTime())) return value;
      try {
        const locale = i18n.language || undefined;
        const usesAbsoluteDateTime =
          (locale || "").toLowerCase().startsWith("zh");
        const fmt = new Intl.DateTimeFormat(locale, {
          year: "numeric",
          month: usesAbsoluteDateTime ? "2-digit" : "short",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: !usesAbsoluteDateTime,
        });
        return fmt.format(parsed);
      } catch {
        return parsed.toLocaleString();
      }
    },
    [i18n],
  );

  const hideSessionHoverCard = useCallback(() => {
    sessionHoverTargetRef.current = null;
    window.clearTimeout(sessionHoverTimerRef.current);
    setSessionHoverCard(null);
  }, []);

  const showSessionHoverCard = useCallback(
    (
      session: SessionSummary,
      target: HTMLElement,
      temporary: boolean,
    ) => {
      // Clear any pending timer so back-to-back hovers don't flash the card.
      sessionHoverTargetRef.current = target;
      window.clearTimeout(sessionHoverTimerRef.current);
      sessionHoverTimerRef.current = window.setTimeout(async () => {
        // Skip if the row was torn down while we were waiting (project
        // closed, list filtered, etc.) — nothing meaningful to point at.
        if (!target.isConnected || sessionHoverTargetRef.current !== target) return;
        const projectPath = session.projectPath ?? "";
        let refreshedWorkspace: ProjectWorkspace | null = null;
        if (!temporary) {
          try {
            refreshedWorkspace = await refreshProject(projectPath);
          } catch {
            // Hover metadata is best effort; keep the last cached branch when
            // the host is unavailable or the project is no longer active.
          }
        }
        if (!target.isConnected || sessionHoverTargetRef.current !== target) return;
        const rect = target.getBoundingClientRect();
        const cardWidth = Math.min(320, window.innerWidth - 16);
        const cardHeight = 168; // estimated; used for flip-below detection
        const wantBelow = rect.bottom + cardHeight <= window.innerHeight;
        const normalizedProjectPath = normalizeProjectPath(projectPath);
        const spaceEntry = temporary
          ? null
          : projectEntriesByPath.get(normalizedProjectPath ?? "");
        const spaceName = temporary
          ? t("nav.hoverCardTemporarySpace")
          : (refreshedWorkspace?.name ?? spaceEntry?.name ?? projectName(projectPath));
        setSessionHoverCard({
          id: `session-hover-${session.id}`,
          top: wantBelow ? rect.bottom + 6 : Math.max(8, rect.top - cardHeight - 6),
          left: Math.max(
            8,
            Math.min(rect.left, window.innerWidth - cardWidth - 8),
          ),
          title: taskTitle(session.title),
          mode: session.mode,
          permissionMode: session.permissionMode,
          space: spaceName,
          branch: refreshedWorkspace ? refreshedWorkspace.branch : spaceEntry?.branch,
          updatedAt: formatHoverCardTimestamp(session.updatedAt),
          temporary,
        });
      }, PROJECT_PATH_HOVER_DELAY_MS);
    },
    [projectEntriesByPath, refreshProject, t, taskTitle, formatHoverCardTimestamp],
  );

  const temporarySessions = useMemo(
    () => filtered
      .filter((session) => !normalizeProjectPath(session.projectPath))
      .sort(compareSessions),
    [filtered, compareSessions],
  );
  const renderSessionStatus = (status: SidebarSessionStatus) => {
    const labelKey =
      status === "running"
        ? "nav.sessionRunning"
        : status === "selected"
          ? "nav.sessionSelected"
          : status === "completed"
            ? "nav.sessionCompleted"
            : status === "failed"
              ? "nav.sessionFailed"
              : "nav.sessionPermission";
    const fallback =
      status === "running"
        ? "In progress"
        : status === "selected"
          ? "Selected"
          : status === "completed"
            ? "Completed"
            : status === "failed"
              ? "Failed"
              : "Permission required";
    const label = t(labelKey, { defaultValue: fallback });
    return (
      <span className={`thread-item-status ${status}`} aria-label={label} title={label}>
        {status === "completed" ? <IconCheck size={10} aria-hidden /> : null}
        {status === "failed" ? <IconCircleAlert size={11} aria-hidden /> : null}
      </span>
    );
  };

  const reportError = useCallback(
    (error: unknown) => {
      showToast(error instanceof Error ? error.message : String(error), {
        variant: "error",
      });
    },
    [showToast],
  );

  const focusComposer = useCallback(() => {
    requestAnimationFrame(() => {
      document.querySelector<HTMLTextAreaElement>(".composer-input")?.focus();
    });
  }, []);

  const selectProject = async (path: string): Promise<boolean> => {
    const normalized = normalizeProjectPath(path);
    if (!normalized) return false;
    if (normalized === activeProjectPath) return true;
    try {
      return Boolean(await activateProject(path));
    } catch (error) {
      reportError(error);
      return false;
    }
  };

  const selectProjectSession = async (session: SessionSummary): Promise<boolean> => {
    try {
      await selectSession(session.id);
      focusComposer();
      return true;
    } catch (error) {
      reportError(error);
      return false;
    }
  };

  const selectTemporarySession = async (sessionId: string) => {
    try {
      await selectSession(sessionId);
      focusComposer();
    } catch (error) {
      reportError(error);
    }
  };

  const scheduleSessionPrefetch = (sessionId: string) => {
    window.clearTimeout(sessionPrefetchTimerRef.current);
    sessionPrefetchTimerRef.current = window.setTimeout(() => {
      void prefetchSession(sessionId).catch(() => undefined);
    }, 120);
  };

  const cancelSessionPrefetch = () => {
    window.clearTimeout(sessionPrefetchTimerRef.current);
    sessionPrefetchTimerRef.current = undefined;
  };

  useEffect(() => cancelSessionPrefetch, []);

  const setCollapsed = (path: string, value: boolean) => {
    const normalized = normalizeProjectPath(path) || path;
    setProjectCollapsed(normalized, value);
  };

  const setSort = (next: SessionSort) => {
    setSessionSort(next);
    setProjectSort(next);
    closeMenus();
  };

  const toggleShowArchived = () => {
    const next = !showArchived;
    setSessionArchiveVisibility(next);
    closeMenus();
  };

  const expandProjectSessions = (projectKey: string) => {
    setExpandedProjectSessions((prev) => ({ ...prev, [projectKey]: true }));
  };

  const toggleSessionPin = (session: SessionSummary) => {
    toggleSessionPinned(session.id);
    closeMenus();
  };

  const archiveSession = async (session: SessionSummary) => {
    const archived = sessionArchived(session, sessionMeta[session.id]);
    const wasActive = activeSessionId === session.id;
    const next =
      !archived && wasActive
        ? session.projectPath
          ? projectEntries
              .find((entry) => entry.key === normalizeProjectPath(session.projectPath))
              ?.sessions.find(
                (item) =>
                  item.id !== session.id &&
                  !sessionArchived(item, sessionMeta[item.id]),
              )
          : temporarySessions.find(
              (item) =>
                item.id !== session.id &&
                !sessionArchived(item, sessionMeta[item.id]),
            )
        : undefined;
    try {
      closeMenus();
      if (archived) {
        restoreSession(session.id);
        return;
      }
      if (wasActive && next) {
        if (!(await selectProjectSession(next))) return;
        archiveSessionAction(session.id);
        return;
      }
      if (wasActive) {
        // Archive first so an empty active slot is not reused as its own
        // replacement. Restore it if creating the fallback slot fails.
        archiveSessionAction(session.id);
        try {
          await newSession({ projectPath: session.projectPath ?? null });
        } catch (error) {
          restoreSession(session.id);
          throw error;
        }
        return;
      }
      archiveSessionAction(session.id);
    } catch (error) {
      reportError(error);
    }
  };

  const deleteSession = async (session: SessionSummary) => {
    closeMenus();
    const wasActive = activeSessionId === session.id;
    const sameScope = session.projectPath
      ? projectEntries.find(
          (entry) => entry.key === normalizeProjectPath(session.projectPath),
        )?.sessions ?? []
      : temporarySessions;
    const next = wasActive
      ? sameScope.find(
          (item) =>
            item.id !== session.id &&
            !sessionArchived(item, sessionMeta[item.id]),
        ) ?? projectEntries
          .flatMap((entry) => entry.sessions)
          .find(
            (item) =>
              item.id !== session.id &&
              !sessionArchived(item, sessionMeta[item.id]),
          )
      : undefined;
    try {
      await deleteSessionAction(session.id);
      if (wasActive) {
        if (next) await selectProjectSession(next);
        else await newSession({ projectPath: session.projectPath ?? null });
      }
    } catch (error) {
      reportError(error);
    }
  };

  const openProjectFolder = async (entry: ProjectEntry) => {
    closeMenus(false);
    try {
      await api.openProjectFolder(entry.path);
    } catch (error) {
      reportError(error);
    }
  };

  const renameProjectEntry = async (entry: ProjectEntry, name: string) => {
    renameProject(entry.path, name);
  };

  const forkSession = async (session: SessionSummary) => {
    closeMenus(false);
    try {
      await forkSessionAction(session.id);
      focusComposer();
    } catch (error) {
      reportError(error);
    }
  };

  const copyConversationId = async (session: SessionSummary) => {
    try {
      await navigator.clipboard.writeText(session.id);
      showToast(t("chat.copied"));
    } catch (error) {
      reportError(error);
    }
    closeMenus();
  };

  const openSessionPath = async (session: SessionSummary) => {
    closeMenus(false);
    try {
      await api.openSessionScratchPath(session.id);
    } catch (error) {
      reportError(error);
    }
  };

  const toggleProjectPin = (entry: ProjectEntry) => {
    toggleProjectPinned(entry.path);
    closeMenus();
  };

  const archiveProject = async (entry: ProjectEntry) => {
    const archived = Boolean(entry.meta.archived);
    const wasActive = entry.active;
    const next = !archived
      ? projectEntries.find(
          (candidate) =>
            candidate.key !== entry.key && !candidate.meta.archived,
        )
      : undefined;
    try {
      closeMenus();
      if (archived) {
        restoreProject(entry.path);
        return;
      }
      // Move the visible context before hiding the active project. This
      // prevents an archived, invisible project from remaining active.
      if (wasActive) {
        if (next) {
          if (!(await selectProject(next.path))) return;
        } else {
          await clearProject();
        }
      }
      archiveProjectAction(entry.path);
    } catch (error) {
      reportError(error);
    }
  };

  const closeProject = async (entry: ProjectEntry) => {
    closeMenus();
    try {
      await closeProjectAction(entry.path);
    } catch (error) {
      reportError(error);
    }
  };

  const createSession = async (options?: { projectPath?: string | null }) => {
    try {
      await newSession(options);
      focusComposer();
    } catch (error) {
      reportError(error);
    }
  };

  const createProjectSession = async (path: string) => {
    await createSession({ projectPath: path });
  };

  const openProjectPicker = async () => {
    try {
      await openProject();
    } catch (error) {
      reportError(error);
    }
  };

  const renderSessionRows = (
    items: SessionSummary[],
    options?: { temporary?: boolean; projectPath?: string },
  ) => items.map((session) => {
    const meta = sessionMeta[session.id] ?? {};
    const active = page === "chat" && selectedSessionId === session.id;
    const archived = sessionArchived(session, meta);
    const running = Boolean(runningSessions[session.id]);
    const hasPendingPermission = (pendingPermissions[session.id]?.length ?? 0) > 0;
    const status = sidebarSessionStatus({
      running,
      selected: active,
      outcome: sessionOutcomes[session.id],
      hasPendingPermission,
    });
    return (
      <div
        key={session.id}
        className={`thread-item ${options?.projectPath ? "sidebar-session-project-row project-group" : "sidebar-standalone-session-row"} ${active ? "active" : ""} ${archived ? "archived" : ""}`}
        data-sidebar-session-row={session.id}
        onContextMenu={(event) => {
          event.preventDefault();
          event.stopPropagation();
          placeMenuAtPoint(event.clientX, event.clientY);
          openSessionRowMenu(
            session.id,
            event.currentTarget.querySelector<HTMLButtonElement>(
              '[data-action="session-menu"]',
            ),
          );
        }}
      >
        {status ? renderSessionStatus(status) : null}
        <button
          type="button"
          className="thread-item-main"
          draggable={!running}
          onDragStart={(event) => {
            if (running) { event.preventDefault(); return; }
            event.dataTransfer.effectAllowed = "move";
            event.dataTransfer.setData("application/x-nexus-session", session.id);
            event.dataTransfer.setData("text/plain", session.id);
            setDraggingSessionId(session.id);
          }}
          onDragEnd={() => setDraggingSessionId(null)}
          onPointerEnter={() => scheduleSessionPrefetch(session.id)}
          onPointerLeave={cancelSessionPrefetch}
          onFocus={() => void prefetchSession(session.id).catch(() => undefined)}
          onMouseEnter={(event) =>
            showSessionHoverCard(session, event.currentTarget, options?.temporary ?? false)
          }
          onMouseLeave={hideSessionHoverCard}
          onFocusCapture={(event) =>
            showSessionHoverCard(session, event.currentTarget, options?.temporary ?? false)
          }
          onBlur={hideSessionHoverCard}
          onClick={() => {
            cancelSessionPrefetch();
            hideSessionHoverCard();
            void (options?.temporary
              ? selectTemporarySession(session.id)
              : selectProjectSession(session));
          }}
          aria-current={active ? "page" : undefined}
        >
          {sessionPinned(session, meta) ? (
            <IconPin size={11} className="thread-item-pin" aria-hidden />
          ) : null}
          <span className="thread-item-title">{taskTitle(session.title)}</span>
        </button>
        <div className="sidebar-row-actions">
          <TooltipButton
            type="button"
            className="thread-item-more"
            data-action="session-menu"
            tooltip={t("nav.sessionActions", { defaultValue: "Session actions" })}
            ariaLabel={t("nav.sessionActions", { defaultValue: "Session actions" })}
            aria-haspopup="menu"
            aria-expanded={sessionMenu === session.id}
            onClick={(event) => {
              event.stopPropagation();
              if (sessionMenu === session.id) {
                closeMenus();
                return;
              }
              placeMenu(event);
              openSessionRowMenu(session.id, event.currentTarget);
            }}
          >
            <IconMore size={14} />
          </TooltipButton>
        </div>
      </div>
    );
  });

  const renderProjectGroup = (entry: ProjectEntry) => {
    const collapsedProject = entry.meta.collapsed ?? projectCollapsed[entry.key] ?? false;
    const projectId = projectDomId(entry.key);
    const isMenuOpen = projectMenu === entry.key;

    // Show the most recent MAX_VISIBLE_SESSIONS rows by default; the remaining
    // sessions stay folded behind the same load-more affordance used for the
    // time-grouped overflow and expand on click.
    const sessionsExpanded = expandedProjectSessions[entry.key] ?? false;
    const visibleSessions = sessionsExpanded
      ? entry.sessions
      : entry.sessions.slice(0, MAX_VISIBLE_SESSIONS);
    const hiddenCount = entry.sessions.length - visibleSessions.length;

    const renderTimeGroupedSessions = (sessions: SessionSummary[]) => {
      // Group the visible slice by time, preserving recency order.
      const grouped = new Map<TimeGroup, SessionSummary[]>();
      for (const session of sessions) {
        const group = getTimeGroup(session.updatedAt);
        if (!grouped.has(group)) grouped.set(group, []);
        grouped.get(group)!.push(session);
      }
      const result: React.ReactNode[] = [];
      for (const group of TIME_GROUP_ORDER) {
        const groupSessions = grouped.get(group);
        if (!groupSessions || groupSessions.length === 0) continue;

        // For today, don't show header (as per requirement)
        if (group !== "today") {
          const i18nKey =
            group === "yesterday" ? "nav.timeGroupYesterday" :
            group === "thisWeek" ? "nav.timeGroupThisWeek" :
            group === "older14d" ? "nav.timeGroupOlder14d" :
            "nav.timeGroupArchived";
          result.push(
            <div key={`group-header-${group}`} className="sidebar-time-group-header">
              {t(i18nKey)}
            </div>
          );
        }
        result.push(...renderSessionRows(groupSessions, { projectPath: entry.path }));
      }
      // Add "load more" button if there are hidden sessions
      if (hiddenCount > 0) {
        result.push(
          <button
            key="load-more"
            type="button"
            className="sidebar-load-more"
            onClick={() => expandProjectSessions(entry.key)}
          >
            {t("nav.loadMoreCount", { count: hiddenCount })}
          </button>
        );
      }
      return result;
    };

    return (
      <section
        key={entry.key}
        className={`sidebar-session-group sidebar-project-row project-group ${entry.active ? "active" : ""} ${entry.meta.archived ? "archived" : ""}`}
        data-sidebar-session-project={entry.path}
        onDragOver={(event) => {
          if (event.dataTransfer.types.includes("application/x-nexus-session") || event.dataTransfer.types.includes("text/plain")) {
            event.preventDefault();
            event.dataTransfer.dropEffect = "move";
          }
        }}
        onDrop={(event) => { void handleSessionDrop(event, entry.path); }}
        aria-labelledby={projectId}
        data-sidebar-project-group={entry.key}
      >
        <div
          className="sidebar-session-group-header"
          onContextMenu={(event) => {
            event.preventDefault();
            event.stopPropagation();
            placeMenuAtPoint(event.clientX, event.clientY);
            openProjectRowMenu(
              entry.key,
              event.currentTarget.querySelector<HTMLButtonElement>(
                ".project-more",
              ),
            );
          }}
        >
          <TooltipButton
            type="button"
            id={projectId}
            className="sidebar-session-group-title project-toggle"
            ariaLabel={entry.name}
            aria-describedby={`${projectId}-path-description`}
            aria-expanded={!collapsedProject}
            aria-controls={`${projectId}-sessions`}
            data-action="toggle-project-collapse"
            onClick={() => void (async () => {
              if (!entry.active && !(await selectProject(entry.path))) return;
              setCollapsed(entry.path, !collapsedProject);
            })()}
          >
            <IconChevronDown
              size={13}
              className={`sidebar-disclosure-icon ${collapsedProject ? "collapsed" : ""}`}
            />
            {entry.meta.pinned ? (
              <IconStar
                size={13}
                fill="currentColor"
                className="sidebar-project-pin"
                aria-hidden
              />
            ) : (
              <IconFolder size={13} aria-hidden />
            )}
            <span>{entry.name}</span>
            {entry.active ? <span className="sidebar-project-active-dot" aria-label={t("project.active", { defaultValue: "Active" })} /> : null}
          </TooltipButton>
          <span id={`${projectId}-path-description`} className="sr-only">
            {entry.path}
          </span>
          <div className="sidebar-menu-wrap">
            <TooltipButton
              type="button"
              className="thread-item-more project-more"
              tooltip={t("project.openActions", { name: entry.name })}
              ariaLabel={t("project.openActions", { name: entry.name })}
              aria-haspopup="menu"
              aria-expanded={isMenuOpen}
              onClick={(event) => {
                event.stopPropagation();
                if (isMenuOpen) {
                  closeMenus();
                  return;
                }
                placeMenu(event);
                openProjectRowMenu(entry.key, event.currentTarget);
              }}
            >
              <IconMore size={14} />
            </TooltipButton>
          </div>
          <TooltipButton
            type="button"
            className="sidebar-session-group-add"
            tooltip={entry.active ? t("project.newTask") : t("project.openAndNewTask", { defaultValue: "Open project and create task" })}
            ariaLabel={entry.active ? t("project.newTask") : t("project.openAndNewTask", { defaultValue: "Open project and create task" })}
            onClick={() => void createProjectSession(entry.path)}
          >
            <IconNewSession size={13} />
          </TooltipButton>
        </div>
        <div
          id={`${projectId}-sessions`}
          className={`sidebar-session-group-body project ${collapsedProject ? "collapsed" : ""}`}
          role="region"
          aria-hidden={collapsedProject}
        >
          {entry.sessions.length > 0 ? renderTimeGroupedSessions(visibleSessions) : (
            <div className="sidebar-session-empty">{t("nav.noProjectSessions")}</div>
          )}
        </div>
      </section>
    );
  };

  const renderFloatingMenu = () => {
    if (
      !menuPosition ||
      typeof document === "undefined" ||
      (!sessionMenu && !projectMenu && !collectionMenu && !sectionMenu && !sortOpen)
    ) {
      return null;
    }
    if (sectionMenu) {
      const isSessions = sectionMenu === "sessions";
      const action = isSessions ? "new-standalone-session" : "new-project";
      const label = isSessions
        ? t("nav.newTemporarySession")
        : t("nav.newProject");
      const Icon = isSessions ? IconNewSession : IconNewProject;
      return createPortal(
        <div
          className="sidebar-row-menu sidebar-floating-menu sidebar-section-menu"
          role="menu"
          data-sidebar-section-menu={sectionMenu}
          onKeyDown={onMenuKeyDown}
          style={{
            top: menuPosition.top,
            left: menuPosition.left,
          }}
        >
          <button
            ref={menuFirstItemRef}
            type="button"
            role="menuitem"
            data-action={action}
            onClick={() => {
              closeMenus(false);
              if (isSessions) void createSession({ projectPath: null });
              else void openProjectPicker();
            }}
          >
            <Icon size={14} />
            <span>{label}</span>
          </button>
        </div>,
        document.body,
      );
    }
    if (sortOpen) {
      return createPortal(
        <div
          className="sidebar-popover sidebar-sort-menu sidebar-floating-menu"
          role="menu"
          onKeyDown={onMenuKeyDown}
          style={{
            top: menuPosition.top,
            left: menuPosition.left,
          }}
        >
          <div className="sidebar-popover-title">
            {t("nav.sortSessions", { defaultValue: "Sort sessions" })}
          </div>
          {(["recent", "oldest", "name", "created"] as const).map((value, index) => (
            <button ref={index === 0 ? menuFirstItemRef : undefined} key={value} type="button" role="menuitemradio" aria-checked={displaySessionSort === value} className={displaySessionSort === value ? "selected" : ""} data-sort={value} onClick={() => setSort(value)}>
              <span>{value === "recent" ? t("nav.sortRecent", { defaultValue: "Recently updated" }) : value === "oldest" ? t("nav.sortOldest", { defaultValue: "Oldest first" }) : value === "name" ? t("nav.sortName", { defaultValue: "Name" }) : t("nav.sortCreated", { defaultValue: "Created date" })}</span>
              {displaySessionSort === value ? <span className="sidebar-sort-check">✓</span> : null}
            </button>
          ))}
          <div className="sidebar-popover-divider" />
          <button type="button" role="menuitemcheckbox" aria-checked={showArchived} data-action="toggle-show-archived" onClick={toggleShowArchived}>
            <span>{showArchived ? t("nav.hideArchived", { defaultValue: "Hide archived" }) : t("nav.showArchived", { defaultValue: "Show archived" })}</span>
            <span className={`sidebar-checkbox ${showArchived ? "checked" : ""}`}>{showArchived ? "✓" : ""}</span>
          </button>
        </div>,
        document.body,
      );
    }
    const session = sessionMenu
      ? sessions.find((item) => item.id === sessionMenu)
      : undefined;
    const entry = projectMenu
      ? projectEntries.find((item) => item.key === projectMenu)
      : undefined;
    const collection = collectionMenu ? projectCollections.find((item) => item.id === collectionMenu) : undefined;
    if (!session && !entry && !collection) return null;
    return createPortal(
      <div
        className="sidebar-row-menu sidebar-floating-menu"
        role="menu"
        onKeyDown={onMenuKeyDown}
        style={{
          top: menuPosition.top,
          left: menuPosition.left,
        }}
      >
        {session ? (
          <>
            <button
              ref={menuFirstItemRef}
              type="button"
              role="menuitem"
              data-action="rename-session"
              onClick={(event) => {
                closeMenus(false);
                setRenameFor(session);
              }}
            >
              <IconPencil size={14} />
              {t("nav.renameTask", { defaultValue: "Rename task" })}
            </button>
            <button
              type="button"
              role="menuitem"
              data-action="toggle-session-pin"
              onClick={() => toggleSessionPin(session)}
            >
              <IconPin size={14} />
              {sessionPinned(session, sessionMeta[session.id])
                ? t("nav.unpinTask", { defaultValue: "Unpin" })
                : t("nav.pinTask", { defaultValue: "Pin" })}
            </button>
            <button
              type="button"
              role="menuitem"
              data-action="toggle-session-archive"
              onClick={() => void archiveSession(session)}
            >
              {sessionArchived(session, sessionMeta[session.id]) ? (
                <IconArchiveRestore size={14} />
              ) : (
                <IconArchive size={14} />
              )}
              {sessionArchived(session, sessionMeta[session.id])
                ? t("nav.restoreTask", { defaultValue: "Restore" })
                : t("nav.archiveTask", { defaultValue: "Archive" })}
            </button>
            <button
              type="button"
              role="menuitem"
              data-action="fork-session"
              disabled={Boolean(runningSessions[session.id])}
              onClick={() => void forkSession(session)}
            >
              <IconBranch size={14} />
              {t("nav.createBranch")}
            </button>
            {settings?.developerMode === true ? (
              <>
                <button
                  type="button"
                  role="menuitem"
                  data-action="copy-conversation-id"
                  onClick={() => void copyConversationId(session)}
                >
                  <IconCopy size={14} />
                  {t("nav.copyConversationId")}
                </button>
                <button
                  type="button"
                  role="menuitem"
                  data-action="open-session-path"
                  onClick={() => void openSessionPath(session)}
                >
                  <IconFolder size={14} />
                  {t("nav.openSessionPath")}
                </button>
              </>
            ) : null}
            <button
              type="button"
              role="menuitem"
              className="danger"
              data-action="delete-session"
              onClick={() => void deleteSession(session)}
            >
              <IconX size={14} />
              {t("nav.deleteTask", { defaultValue: "Delete" })}
            </button>
          </>
        ) : null}
        {entry ? (
          <>
            <button type="button" role="menuitem" data-action="clone-project" onClick={() => {
              closeMenus(false);
              const url = window.prompt("Git repository URL");
              if (!url) return;
              const parentPath = window.prompt("Parent folder path");
              if (!parentPath) return;
              void api.cloneProject(url, parentPath).then(() => void refreshProject(parentPath)).catch((error) => reportError(error));
            }}>
              <IconFolder size={14} />
              Clone repository
            </button>
            <button
              ref={menuFirstItemRef}
              type="button"
              role="menuitem"
              onClick={() =>
                void selectProject(entry.path).then((ok) => {
                  if (ok) {
                    closeMenus(false);
                    focusComposer();
                  }
                })
              }
            >
              <IconFolder size={14} />
              {entry.active
                ? t("project.active", { defaultValue: "Active" })
                : t("project.switch", { defaultValue: "Switch" })}
            </button>
            <button
              type="button"
              role="menuitem"
              data-action="open-project-folder"
              onClick={() => void openProjectFolder(entry)}
            >
              <IconFolder size={14} />
              {t("project.openFolder", { defaultValue: "Open folder" })}
            </button>
            <button
              type="button"
              role="menuitem"
              data-action="rename-project"
              onClick={() => {
                closeMenus(false);
                setRenameProjectFor(entry);
              }}
            >
              <IconPencil size={14} />
              {t("project.rename", { defaultValue: "Rename project" })}
            </button>
            <button
              type="button"
              role="menuitem"
              data-action="manage-project-collections"
              onClick={(event) => {
                closeMenus(false);
                collectionPickerReturnFocusRef.current = event.currentTarget;
                setCollectionPickerAnchor(event.currentTarget);
                setCollectionPickerFor(entry);
              }}
            >
              <IconFolder size={14} />
              {t("project.manageCollections", { defaultValue: "Manage collections" })}
            </button>
            {projectCollectionMemberships.filter((item) => item.projectPath === entry.key).map((membership) => {
              const collection = projectCollections.find((item) => item.id === membership.collectionId);
              if (!collection) return null;
              const siblings = projectCollectionMemberships.filter((item) => item.collectionId === membership.collectionId).sort((a, b) => a.order - b.order);
              const index = siblings.findIndex((item) => item.projectPath === entry.key);
              return <Fragment key={membership.collectionId}><button type="button" role="menuitem" data-action="move-project-up" disabled={index <= 0} onClick={() => moveProjectWithinCollection(entry.path, membership.collectionId, index - 1)}><IconArrowUp size={14} />Move up in {collection.name}</button><button type="button" role="menuitem" data-action="move-project-down" disabled={index < 0 || index >= siblings.length - 1} onClick={() => moveProjectWithinCollection(entry.path, membership.collectionId, index + 1)}><IconArrowDown size={14} />Move down in {collection.name}</button><button key={`${membership.collectionId}-remove`} type="button" role="menuitem" data-action="remove-project-from-collection" onClick={() => removeProjectFromCollection(entry.path, membership.collectionId)}><IconX size={14} />Remove from {collection.name}</button></Fragment>;
            })}
            <button
              type="button"
              role="menuitem"
              data-action="toggle-project-pin"
              onClick={() => toggleProjectPin(entry)}
            >
              <IconPin size={14} />
              {entry.meta.pinned ? t("project.unpin") : t("project.pin")}
            </button>
            <button
              type="button"
              role="menuitem"
              data-action="toggle-project-archive"
              onClick={() => void archiveProject(entry)}
            >
              {entry.meta.archived ? (
                <IconArchiveRestore size={14} />
              ) : (
                <IconArchive size={14} />
              )}
              {entry.meta.archived
                ? t("project.restore", { defaultValue: "Restore project" })
                : t("project.archive", { defaultValue: "Archive project" })}
            </button>
            {entry.open ? (
              <button
                type="button"
                role="menuitem"
                onClick={() => void closeProject(entry)}
              >
                <IconX size={14} />
                {t("project.close")}
              </button>
            ) : null}
          </>
        ) : null}
        {collection ? (
          <>
            <button ref={menuFirstItemRef} type="button" role="menuitem" data-action="add-projects-to-collection" onClick={(event) => { closeMenus(false); collectionPickerReturnFocusRef.current = event.currentTarget; setCollectionPickerAnchor(event.currentTarget); setCollectionAssignmentFor(collection.id); }}><IconPlus size={14} />Add projects</button>
            <button type="button" role="menuitem" data-action="rename-collection" onClick={() => { closeMenus(false); const value = window.prompt("Rename project group", collection.name); if (value?.trim()) renameProjectCollection(collection.id, value); }}><IconPencil size={14} />Rename group</button>
            <button type="button" role="menuitem" data-action="move-collection-up" disabled={collection.order <= 0} onClick={() => moveProjectCollection(collection.id, collection.order - 1)}><IconArrowUp size={14} />Move up</button>
            <button type="button" role="menuitem" data-action="move-collection-down" disabled={collection.order >= projectCollections.length - 1} onClick={() => moveProjectCollection(collection.id, collection.order + 1)}><IconArrowDown size={14} />Move down</button>
            <button type="button" role="menuitem" className="danger" data-action="delete-collection" onClick={() => { closeMenus(false); if (window.confirm(`Delete project group ${collection.name}?`)) deleteProjectCollection(collection.id); }}><IconTrash size={14} />Delete group</button>
          </>
        ) : null}
      </div>,
      document.body,
    );
  };

  // Map a session mode to the secondary tag label. We only show one tag in
  // addition to the always-on "Local task" badge so the row stays compact.
  const modeTagLabel = (mode: Mode, permission: PermissionMode): string => {
    if (mode === "plan") return t("chat.modePlan");
    if (mode === "goal") return t("chat.modeGoal");
    if (permission === "auto") return t("chat.permissionAuto");
    if (permission === "accept-edits") return t("chat.permissionAcceptEdits");
    if (permission === "ask") return t("chat.permissionAsk");
    return t("chat.modeAgent");
  };

  const renderSessionHoverCard = () => {
    if (!sessionHoverCard || typeof document === "undefined") return null;
    return createPortal(
      <div
        id={sessionHoverCard.id}
        className="sidebar-session-hover-card"
        role="tooltip"
        style={{ top: sessionHoverCard.top, left: sessionHoverCard.left }}
      >
        <div className="sidebar-session-hover-card-title">
          {sessionHoverCard.title}
        </div>
        <div className="sidebar-session-hover-card-tags">
          <span className="sidebar-session-hover-card-tag">
            <IconBranch size={12} aria-hidden />
            {t("nav.hoverCardLocalTask")}
          </span>
          <span className="sidebar-session-hover-card-tag sidebar-session-hover-card-tag-accent">
            {modeTagLabel(sessionHoverCard.mode, sessionHoverCard.permissionMode)}
          </span>
        </div>
        <div className="sidebar-session-hover-card-meta">
          <div className="sidebar-session-hover-card-meta-row">
            <span className="sidebar-session-hover-card-meta-icon" aria-hidden>
              <IconFolder size={12} />
            </span>
            <span className="sidebar-session-hover-card-meta-label">
              {t("nav.hoverCardSpace")}
            </span>
            <span className="sidebar-session-hover-card-meta-value">
              {sessionHoverCard.space}
            </span>
          </div>
          {sessionHoverCard.branch ? (
            <div className="sidebar-session-hover-card-meta-row">
              <span className="sidebar-session-hover-card-meta-icon" aria-hidden>
                <IconBranch size={12} />
              </span>
              <span
                className="sidebar-session-hover-card-meta-value"
                aria-label={t("nav.hoverCardBranchAria", {
                  name: sessionHoverCard.branch,
                })}
              >
                {sessionHoverCard.branch}
              </span>
            </div>
          ) : null}
          <div className="sidebar-session-hover-card-meta-row">
            <span className="sidebar-session-hover-card-meta-icon" aria-hidden>
              <IconClock size={12} />
            </span>
            <span className="sidebar-session-hover-card-meta-label">
              {t("nav.hoverCardUpdatedAt", {
                when: sessionHoverCard.updatedAt,
              })}
            </span>
          </div>
        </div>
      </div>,
      document.body,
    );
  };

  return (
    <aside
      className={cx("sidebar", className)}
      onAnimationEnd={onAnimationEnd}
    >
      <div className="sidebar-header">
        <TooltipButton
          type="button"
          className="brand no-drag"
          data-nav="home"
          tooltip={t("nav.home")}
          ariaLabel={t("nav.home")}
          onClick={() => setPage("chat")}
        >
          <BrandLogo size={20} />
          <span>{t("app.shellName")}</span>
        </TooltipButton>
        <div className="sidebar-header-actions no-drag">
          <TooltipButton
            type="button"
            className="icon-btn"
            tooltip={
              sidebarToggleShortcut
                ? `${t("nav.collapseSidebar")} (${sidebarToggleShortcut})`
                : t("nav.collapseSidebar")
            }
            ariaLabel={t("nav.collapseSidebar")}
            aria-expanded={true}
            data-nav="toggle-sidebar"
            onClick={onToggleSidebar}
          >
            <IconSidebar size={15} />
          </TooltipButton>
        </div>
      </div>

      <div className="sidebar-body no-drag">

        <section
          className="sidebar-standalone-sessions"
          aria-labelledby="sidebar-standalone-sessions-label"
          data-sidebar-session-section="temporary"
        >
          <div
            className="sidebar-list-toolbar sidebar-list-toolbar-secondary"
            data-sidebar-section="sessions"
            onContextMenu={(event) => {
              event.preventDefault();
              event.stopPropagation();
              openSectionMenu("sessions", event.clientX, event.clientY);
            }}
            onPointerDown={(event) => {
              // Keep native drag/text selection from eating the secondary click path.
              if (event.button === 2) event.preventDefault();
            }}
          >
            <span id="sidebar-standalone-sessions-label" className="sidebar-list-label">
              {t("nav.standaloneSessions", { defaultValue: "Standalone sessions" })}
            </span>
            <div className="sidebar-toolbar-actions">
              <div className="sidebar-menu-wrap">
                <TooltipButton
                  type="button"
                  className={`sidebar-toolbar-button ${sortOpen ? "active" : ""}`}
                  data-action="session-sort"
                  ariaLabel={t("nav.sortSessions", { defaultValue: "Sort sessions" })}
                  tooltip={t("nav.sortSessions", { defaultValue: "Sort sessions" })}
                  aria-haspopup="menu"
                  aria-expanded={sortOpen}
                  onClick={(event) => {
                    if (sortOpen) {
                      closeMenus();
                      return;
                    }
                    placeMenu(event);
                    menuTriggerRef.current = event.currentTarget;
                    setSessionMenu(null);
                    setProjectMenu(null);
                    setSectionMenu(null);
                    setSortOpen(true);
                  }}
                >
                  <IconArrowUpDown size={14} />
                </TooltipButton>
              </div>
              <TooltipButton
                type="button"
                className="sidebar-toolbar-button"
                data-action="new-standalone-session"
                tooltip={t("nav.newTemporarySession")}
                ariaLabel={t("nav.newTemporarySession")}
                onClick={() => void createSession({ projectPath: null })}
              >
                <IconNewSession size={14} />
              </TooltipButton>
            </div>
          </div>
          <div
            className="sidebar-session-group-body standalone"
            onScroll={() => {
              if (sessionMenu || projectMenu || sectionMenu || sortOpen) closeMenus(false);
            }}
            onContextMenu={(event) => {
              if ((event.target as Element).closest?.("[data-sidebar-session-row]")) return;
              event.preventDefault();
              event.stopPropagation();
              openSectionMenu("sessions", event.clientX, event.clientY);
            }}
          >
            {temporarySessions.length > 0 ? renderSessionRows(temporarySessions, { temporary: true }) : (
              <div className="sidebar-session-empty">{t("nav.noTemporarySessions")}</div>
            )}
          </div>
        </section>

        <div
          className="sidebar-list-toolbar"
          data-sidebar-section="projects"
          onContextMenu={(event) => {
            event.preventDefault();
            event.stopPropagation();
            openSectionMenu("projects", event.clientX, event.clientY);
          }}
          onPointerDown={(event) => {
            if (event.button === 2) event.preventDefault();
          }}
        >
          <span className="sidebar-list-label">{t("nav.projects")}</span>
          <div className="sidebar-toolbar-actions">
            <TooltipButton type="button" className="sidebar-toolbar-button" tooltip={t("nav.newProjectGroup", { defaultValue: "New project group" })} ariaLabel={t("nav.newProjectGroup", { defaultValue: "New project group" })} onClick={(event) => { createGroupReturnFocusRef.current = event.currentTarget; setCreateGroupOpen(true); }}><IconPlus size={14} /></TooltipButton>
            <TooltipButton type="button" className="sidebar-toolbar-button" data-action="new-project" tooltip={t("nav.newProject")} ariaLabel={t("nav.newProject")} onClick={() => void openProjectPicker()}><IconNewProject size={14} /></TooltipButton>
          </div>
        </div>

        <div
          className="sidebar-session-groups min-h-0 flex-1 overflow-auto px-0.5"
          onScroll={() => {
            if (sessionMenu || projectMenu || sectionMenu || sortOpen) closeMenus(false);
          }}
          onContextMenu={(event) => {
            if (
              (event.target as Element).closest?.(
                "[data-sidebar-session-row], [data-sidebar-project-group]",
              )
            ) {
              return;
            }
            event.preventDefault();
            event.stopPropagation();
            openSectionMenu("projects", event.clientX, event.clientY);
          }}
        >
          {projectEntries.length > 0 ? (() => {
            // Only canonical collections with at least one live project are
            // rendered; stale empty legacy groups must not reappear.
            const visibleCollections = projectCollections;
            const memberships = projectCollectionMemberships;
            const grouped = new Set(memberships.map((item) => item.projectPath));
            const ungrouped = projectEntries.filter((entry) => !grouped.has(entry.key));
            return <>
              {visibleCollections.map((group) => {
                const entries = projectEntries.filter((entry) => memberships.some((item) => item.collectionId === group.id && item.projectPath === entry.key));
                return <section key={group.id} className="sidebar-project-group-folder" data-sidebar-project-folder={group.id} onPointerMove={moveCollectionDrag} onPointerUp={finishCollectionDrop} onPointerCancel={endCollectionDrag}>
                  <div className="sidebar-project-group-header" data-drop-position={draggedCollection === group.id ? "group" : undefined} onPointerDown={(event) => startCollectionDrag(event, { kind: "collection", collectionId: group.id })}>
                    <button type="button" className="sidebar-session-group-title" aria-expanded={!group.collapsed} onClick={() => setProjectGroupCollapsed(group.id)}><IconChevronDown size={13} className={`sidebar-disclosure-icon ${group.collapsed ? "collapsed" : ""}`} /><IconFolder size={13} /><span>{group.name}</span><span className="sidebar-project-group-count">{entries.length}</span></button>
                    <TooltipButton type="button" className="thread-item-more project-group-more" data-action="collection-menu" tooltip={t("nav.groupActions", { defaultValue: "Project group actions" })} ariaLabel={t("nav.groupActions", { defaultValue: "Project group actions" })} aria-haspopup="menu" aria-expanded={collectionMenu === group.id} onClick={(event) => { event.stopPropagation(); const rect = event.currentTarget.getBoundingClientRect(); openCollectionRowMenu(group.id, event.currentTarget); setMenuPosition({ top: Math.min(window.innerHeight - 220, rect.bottom + 4), left: Math.min(window.innerWidth - 240, rect.right + 4) }); }}><IconMore size={14} /></TooltipButton>
                  </div>
                  {!group.collapsed ? (entries.length ? entries.map((entry) => <div key={entry.key} className="sidebar-project-collection-row" data-project-collection-row={entry.key} data-drop-position={draggedProject?.path === entry.path ? "project" : undefined} onPointerDown={(event) => startCollectionDrag(event, { kind: "project", path: entry.path, collectionId: group.id })}>{renderProjectGroup(entry)}</div>) : <button type="button" className="sidebar-project-group-empty-action" onClick={(event) => { collectionPickerReturnFocusRef.current = event.currentTarget; setCollectionPickerAnchor(event.currentTarget); setCollectionAssignmentFor(group.id); }}>{t("nav.addProjectToGroup", { defaultValue: "Add project" })}</button>) : null}
                </section>;
              })}
              {ungrouped.length ? <section className="sidebar-project-group-folder sidebar-project-group-ungrouped" data-sidebar-project-folder="ungrouped" onPointerMove={moveCollectionDrag} onPointerUp={finishCollectionDrop} onPointerCancel={endCollectionDrag}>
                <div className="sidebar-session-group-title" aria-hidden="true"><IconFolder size={13} /><span>{t("nav.ungroupedProjects", { defaultValue: "Ungrouped" })}</span></div>
                {ungrouped.map(renderProjectGroup)}
              </section> : null}
            </>;
          })() : (
            <section className="sidebar-session-group" aria-labelledby="sidebar-project-group-label">
              <div className="sidebar-session-group-header">
                <button type="button" id="sidebar-project-group-label" className="sidebar-session-group-title" onClick={() => void openProjectPicker()}>
                  <IconFolder size={13} />
                  <span>{t("project.open")}</span>
                </button>
              </div>
            </section>
          )}
        </div>

        <div className="sidebar-footer no-drag">
          <div className="footer-actions">
            <TooltipButton
              type="button"
              className={`footer-action ${page === "settings" ? "active" : ""}`}
              data-nav="settings"
              tooltip={t("nav.settings")}
              ariaLabel={t("nav.settings")}
              onClick={() => setPage("settings")}
            >
              <IconSettings size={14} aria-hidden />
            </TooltipButton>
            <TooltipButton
              type="button"
              className={`footer-action ${page === "plugins" ? "active" : ""}`}
              data-nav="plugins"
              tooltip={t("nav.plugins")}
              ariaLabel={t("nav.plugins")}
              onClick={() => setPage("plugins")}
            >
              <IconPlug size={14} aria-hidden />
            </TooltipButton>
            <NotificationCenter onBeforeOpen={() => closeMenus(false)} />
          </div>

          <TooltipButton
            type="button"
            className={`footer-build ${updateReady ? "has-update" : ""}`}
            data-nav="build"
            tooltip={buildTitle}
            ariaLabel={buildTitle}
            onClick={() => {
              if (updateReady) {
                setSettingsAnchor("updates.title");
                setSettingsTab("about");
                return;
              }
              void (async () => {
                try {
                  await api.updatesCheck();
                } catch { /* ignore */ }
              })();
            }}
          >
            <span className="footer-build-version">{buildLabel}</span>
            {updateReady ? <span className="footer-build-dot" aria-hidden /> : null}
          </TooltipButton>
        </div>
      </div>
      {renderFloatingMenu()}
      {renderSessionHoverCard()}
      {renameFor ? (
        <SessionRenameDialog
          session={renameFor}
          onClose={() => setRenameFor(null)}
          onSave={(title) => renameSession(renameFor.id, title)}
          onError={reportError}
        />
      ) : null}
      {renameProjectFor ? (
        <ProjectRenameDialog
          project={renameProjectFor}
          onClose={() => setRenameProjectFor(null)}
          onSave={(name) => renameProjectEntry(renameProjectFor, name)}
          onError={reportError}
        />
      ) : null}
      {createGroupOpen ? <ProjectGroupCreateDialog returnFocus={createGroupReturnFocusRef.current} onClose={() => setCreateGroupOpen(false)} onSave={createProjectGroup} /> : null}
      {collectionPickerFor || collectionAssignmentFor ? <ProjectCollectionPicker anchor={collectionPickerAnchor} projectPath={collectionPickerFor?.path} collections={projectCollections} selected={collectionAssignmentFor ? projectCollectionMemberships.filter((item) => item.collectionId === collectionAssignmentFor).map((item) => item.projectPath) : projectCollectionMemberships.filter((item) => item.projectPath === collectionPickerFor?.key).map((item) => item.collectionId)} projects={projectEntries.map((entry) => ({ path: entry.key, name: entry.name }))} assignmentCollectionId={collectionAssignmentFor ?? undefined} onClose={() => { setCollectionPickerFor(null); setCollectionAssignmentFor(null); setCollectionPickerAnchor(null); collectionPickerReturnFocusRef.current?.focus(); }} onToggle={(id, checked) => collectionPickerFor ? (checked ? addProjectToCollection(collectionPickerFor.path, id) : removeProjectFromCollection(collectionPickerFor.path, id)) : undefined} onAssign={(path, checked) => collectionAssignmentFor ? (checked ? addProjectToCollection(path, collectionAssignmentFor) : removeProjectFromCollection(path, collectionAssignmentFor)) : undefined} onCreate={(name) => { createCollection(name); }} /> : null}
      <div
        className={cx("sidebar-resize-handle no-drag", sidebarResizing && "is-resizing")}
        role="separator"
        aria-orientation="vertical"
        aria-label={t("nav.resizeSidebar")}
        aria-valuemin={SIDEBAR_WIDTH_MIN}
        aria-valuemax={SIDEBAR_WIDTH_MAX}
        aria-valuenow={clampSidebarWidth(sidebarWidth)}
        aria-valuetext={t("nav.sidebarWidth", { width: clampSidebarWidth(sidebarWidth) })}
        tabIndex={0}
        onPointerDown={startSidebarResize}
        onPointerMove={moveSidebarResize}
        onPointerUp={endSidebarResize}
        onPointerCancel={cancelSidebarResize}
        onLostPointerCapture={cancelSidebarResize}
        onKeyDown={handleSidebarResizeKeyDown}
      />
    </aside>
  );
}
