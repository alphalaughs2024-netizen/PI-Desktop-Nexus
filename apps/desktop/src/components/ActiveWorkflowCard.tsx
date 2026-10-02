import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { Activity, ChevronDown, Compass, GripVertical, RotateCcw, Settings, SquareCode, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { WorkflowSessionStatus } from "@pi-desktop/shared";
import { api } from "../lib/api";
import { useAppStore } from "../stores/app-store";
import {
  DEFAULT_WORKFLOW_POSITION, readWorkflowWidgetPosition, rememberWorkflowWidgetPosition,
  workflowWidgetBounds, workflowWidgetPoint, workflowWidgetPosition,
  type WorkflowWidgetBounds, type WorkflowWidgetPosition,
} from "../lib/workflow-widget-position";

export function ActiveWorkflowCard({ sessionId }: { sessionId?: string | null }) {
  const { t } = useTranslation();
  const panelId = useId();
  const bodyId = useId();
  const [status, setStatus] = useState<WorkflowSessionStatus | null>(null);
  const [loadedSession, setLoadedSession] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [body, setBody] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [position, setPosition] = useState(readWorkflowWidgetPosition);
  const [bounds, setBounds] = useState<WorkflowWidgetBounds | null>(null);
  const [dragging, setDragging] = useState(false);
  const cardRef = useRef<HTMLElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const pinnedRef = useRef(false);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const positionRef = useRef(position);
  const statusRequestRef = useRef(0);
  positionRef.current = position;
  const dragRef = useRef<{
    pointerId: number; x: number; y: number; left: number; top: number;
    original: WorkflowWidgetPosition; bounds: WorkflowWidgetBounds;
  } | null>(null);
  const primary = loadedSession === sessionId ? status?.primary : undefined;
  const selectionKey = `${sessionId ?? ""}:${primary?.id ?? ""}`;
  const selectionKeyRef = useRef(selectionKey);
  selectionKeyRef.current = selectionKey;

  const clearHover = () => {
    if (hoverTimer.current !== null) clearTimeout(hoverTimer.current);
    hoverTimer.current = null;
  };
  const close = () => {
    clearHover();
    pinnedRef.current = false;
    setOpen(false);
  };

  useEffect(() => {
    setBody(null);
    setExpanded(false);
    setBusy(false);
    setError(false);
    close();
    dragRef.current = null;
    setDragging(false);
  }, [selectionKey]);

  useEffect(() => () => clearHover(), []);

  useEffect(() => {
    if (!sessionId) return;
    let current = true;
    const load = async () => {
      const ticket = ++statusRequestRef.current;
      const result = await api.workflowStatus(sessionId).catch(() => null);
      if (current && ticket === statusRequestRef.current) {
        setStatus(result);
        setLoadedSession(sessionId);
      }
    };
    void load();
    const unsubscribe = api.onWorkflowChanged((event) => {
      if (!event.sessionId || event.sessionId === sessionId) void load();
    });
    return () => { current = false; unsubscribe(); };
  }, [sessionId]);

  useLayoutEffect(() => {
    const card = cardRef.current;
    const container = card?.parentElement;
    if (!card || !container) return;
    const measure = () => {
      const toolbar = parseFloat(getComputedStyle(container).getPropertyValue("--ds-toolbar-height")) || 46;
      const next = workflowWidgetBounds(container.clientWidth, container.clientHeight, card.offsetWidth, card.offsetHeight, toolbar);
      setBounds((previous) => previous && Object.keys(next).every(
        (key) => previous[key as keyof WorkflowWidgetBounds] === next[key as keyof WorkflowWidgetBounds],
      ) ? previous : next);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    observer.observe(card);
    return () => observer.disconnect();
  }, [selectionKey]);

  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!cardRef.current?.contains(event.target as Node)) close();
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      close();
      triggerRef.current?.focus();
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  if (!sessionId || !primary) return null;
  const point = bounds ? workflowWidgetPoint(position, bounds) : null;
  const reason = primary.reasonCategory.replaceAll("_", " ");
  const label = primary.id === "nexus/guidance/agent-operations" ? t("workflow.agentName") : primary.name;
  const dismiss = async () => {
    const requestedKey = selectionKey;
    setBusy(true);
    setError(false);
    try {
      const result = await api.dismissSessionWorkflow(sessionId, primary.id);
      if (selectionKeyRef.current === requestedKey) { ++statusRequestRef.current; setStatus(result); close(); }
    } catch {
      if (selectionKeyRef.current === requestedKey) setError(true);
    } finally {
      if (selectionKeyRef.current === requestedKey) setBusy(false);
    }
  };
  const inspect = async () => {
    const next = !expanded;
    pinnedRef.current = true;
    setExpanded(next);
    if (next && body === null) {
      const requestedKey = selectionKey;
      const result = await api.readWorkflow(primary.id, sessionId).catch(() => null);
      if (selectionKeyRef.current === requestedKey) {
        setBody(result?.body ?? t("workflow.guidanceUnavailable"));
      }
    }
  };
  const resetPosition = () => {
    setPosition(DEFAULT_WORKFLOW_POSITION);
    rememberWorkflowWidgetPosition(DEFAULT_WORKFLOW_POSITION);
  };
  return (
    <aside
      ref={cardRef} className="active-workflow-card" data-open={open} data-dragging={dragging}
      aria-label={t("workflow.activeLabel")}
      style={point ? { left: point.left, top: point.top, right: "auto" } : undefined}
      onPointerEnter={(event) => {
        clearHover();
        if (event.pointerType === "mouse" && !dragRef.current) hoverTimer.current = setTimeout(() => setOpen(true), 180);
      }}
      onPointerLeave={() => {
        clearHover();
        if (!pinnedRef.current && !cardRef.current?.querySelector(".active-workflow-panel")?.contains(document.activeElement)) hoverTimer.current = setTimeout(close, 180);
      }}
      onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node)) close(); }}
    >
      <div className="active-workflow-heading">
        <button type="button" className="active-workflow-grip" title={t("workflow.move")} aria-label={t("workflow.move")}
          onPointerDown={(event) => {
            if (event.button !== 0 || !bounds) return;
            event.preventDefault();
            close();
            const card = cardRef.current!;
            const container = card.parentElement!;
            const toolbar = parseFloat(getComputedStyle(container).getPropertyValue("--ds-toolbar-height")) || 46;
            const headerHeight = event.currentTarget.parentElement!.offsetHeight + card.offsetHeight - card.clientHeight;
            const dragBounds = workflowWidgetBounds(container.clientWidth, container.clientHeight, card.offsetWidth, headerHeight, toolbar);
            const start = workflowWidgetPoint(positionRef.current, bounds);
            dragRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, ...start, original: positionRef.current, bounds: dragBounds };
            setPosition(workflowWidgetPosition(start.left, start.top, dragBounds));
            setBounds(dragBounds);
            setDragging(true);
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={(event) => {
            const drag = dragRef.current;
            if (!drag || drag.pointerId !== event.pointerId) return;
            const next = workflowWidgetPosition(drag.left + event.clientX - drag.x, drag.top + event.clientY - drag.y, drag.bounds);
            positionRef.current = next;
            setPosition(next);
          }}
          onPointerUp={(event) => {
            if (dragRef.current?.pointerId !== event.pointerId) return;
            rememberWorkflowWidgetPosition(positionRef.current);
            dragRef.current = null;
            setDragging(false);
            event.currentTarget.releasePointerCapture(event.pointerId);
          }}
          onPointerCancel={() => {
            if (dragRef.current) setPosition(dragRef.current.original);
            dragRef.current = null;
            setDragging(false);
          }}
          onKeyDown={(event) => {
            if (event.key === "Home") { event.preventDefault(); resetPosition(); return; }
            const directions: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
            const direction = directions[event.key];
            if (!direction || !bounds || !point) return;
            event.preventDefault();
            const step = event.shiftKey ? 48 : 16;
            const next = workflowWidgetPosition(point.left + direction[0] * step, point.top + direction[1] * step, bounds);
            setPosition(next);
            rememberWorkflowWidgetPosition(next);
          }}
        ><GripVertical size={14} aria-hidden /></button>
        <button ref={triggerRef} type="button" className="active-workflow-trigger" aria-expanded={open} aria-controls={panelId} title={primary.name}
          onClick={() => {
            clearHover();
            if (open && pinnedRef.current) close();
            else { pinnedRef.current = true; setOpen(true); }
          }}
        >
          <span className="active-workflow-dot" aria-hidden />
          <span className="active-workflow-label">{label}</span>
          <span className="active-workflow-summary" aria-hidden>· {reason}</span>
          <ChevronDown className="active-workflow-chevron" size={14} aria-hidden />
        </button>
      </div>
      <div className="active-workflow-disclosure" data-open={open}>
        <div id={panelId} className="active-workflow-panel" inert={!open} aria-hidden={!open}>
          <dl className="active-workflow-copy">
            <div><Activity size={14} aria-hidden /><dt>{t("workflow.stage")}</dt><dd>{primary.stage.replaceAll("_", " ")}</dd></div>
            <div><Compass size={14} aria-hidden /><dt>{t("workflow.activated")}</dt><dd>{reason}</dd></div>
          </dl>
          {primary.nextAction ? <p className="active-workflow-next">{primary.nextAction}</p> : null}
          <div className="active-workflow-actions">
            <button type="button" aria-expanded={expanded} aria-controls={bodyId} onClick={() => void inspect()}>
              <SquareCode size={14} aria-hidden />{expanded ? t("workflow.hide") : t("workflow.inspect")}
            </button>
            <button type="button" disabled={busy} onClick={() => void dismiss()}><X size={14} aria-hidden />{t("workflow.dismiss")}</button>
            <button type="button" onClick={() => {
              close();
              const store = useAppStore.getState();
              store.setSettingsTab("workflows");
              store.setPage("settings");
            }}><Settings size={14} aria-hidden />{t("workflow.settings")}</button>
            <button type="button" className="active-workflow-reset" onClick={resetPosition} title={t("workflow.resetPosition")} aria-label={t("workflow.resetPosition")}><RotateCcw size={14} aria-hidden /></button>
          </div>
          {error ? <p className="active-workflow-error" role="alert">{t("workflow.dismissFailed")}</p> : null}
          {expanded ? (
            <div className="active-workflow-body-wrap" id={bodyId}>
              <pre className="active-workflow-body">{body ?? t("workflow.loadingGuidance")}</pre>
            </div>
          ) : null}
        </div>
      </div>
    </aside>
  );
}
