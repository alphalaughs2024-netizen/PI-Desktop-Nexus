import { useEffect, useRef, useState, type DragEvent, type KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import type { QueuedPrompt } from "../lib/queued-prompts";
import { TooltipButton } from "./ui";
import {
  IconCornerDownLeft,
  IconGrip,
  IconMore,
  IconPencil,
  IconPlus,
  IconTrash,
} from "./icons";

type Props = {
  item: QueuedPrompt;
  label: string;
  index: number;
  count: number;
  isRunning: boolean;
  approvalPending: boolean;
  queueingEnabled: boolean;
  draggedId: string | null;
  onDragChange: (id: string | null) => void;
  onMove: (id: string, direction: "up" | "down") => void;
  onMoveTo: (id: string, targetId: string) => void;
  onSteer: (item: QueuedPrompt) => void;
  onSendNow: (id: string) => void;
  onDelete: (id: string) => void;
  onEdit: (id: string) => void;
  onQueueingChange: (enabled: boolean) => void;
};

export function QueuedPromptRow({
  item, label, index, count, isRunning, approvalPending, queueingEnabled,
  draggedId, onDragChange, onMove, onMoveTo, onSteer, onSendNow, onDelete,
  onEdit, onQueueingChange,
}: Props) {
  const { t } = useTranslation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuItemsRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const pending = item.id.startsWith("pending:");
  const promoted = item.priority !== undefined;
  const locked = pending || promoted;
  const dropTarget = draggedId !== null && draggedId !== item.id && !locked;

  useEffect(() => {
    if (!draggedId) setDragOver(false);
  }, [draggedId]);

  useEffect(() => {
    if (!menuOpen) return;
    menuItemsRef.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
    const dismiss = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    const escape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setMenuOpen(false);
      triggerRef.current?.focus();
    };
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", dismiss);
      document.removeEventListener("keydown", escape);
    };
  }, [menuOpen]);

  const onMenuKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    const items = Array.from(menuItemsRef.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? []);
    if (items.length === 0) return;
    event.preventDefault();
    const current = items.indexOf(document.activeElement as HTMLButtonElement);
    const next = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1
      : event.key === "ArrowDown" ? (current + 1) % items.length
      : (current - 1 + items.length) % items.length;
    items[next]?.focus();
  };

  const onHandleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (locked) return;
    const direction = event.key === "ArrowUp" ? "up" : event.key === "ArrowDown" ? "down" : null;
    if (!direction || (direction === "up" && index === 0) || (direction === "down" && index === count - 1)) return;
    event.preventDefault();
    onMove(item.id, direction);
  };

  const onDragStart = (event: DragEvent<HTMLButtonElement>) => {
    if (locked) { event.preventDefault(); return; }
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", item.id);
    onDragChange(item.id);
  };

  return (
    <div
      className={`composer-queued-prompt${draggedId === item.id ? " is-dragging" : ""}${dropTarget && dragOver ? " is-drop-target" : ""}${menuOpen ? " has-open-menu" : ""}`}
      role="listitem"
      data-testid="queued-prompt"
      onDragOver={(event) => {
        if (!dropTarget) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        setDragOver(true);
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragOver(false);
      }}
      onDrop={(event) => {
        if (!dropTarget || !draggedId) return;
        event.preventDefault();
        setDragOver(false);
        onMoveTo(draggedId, item.id);
        onDragChange(null);
      }}
    >
      <TooltipButton
        type="button"
        className="composer-queued-prompt-handle"
        tooltip={t("chat.reorderQueuedPrompt")}
        ariaLabel={t("chat.reorderQueuedPrompt")}
        disabled={locked}
        draggable={!locked}
        onDragStart={onDragStart}
        onDragEnd={() => onDragChange(null)}
        onKeyDown={onHandleKeyDown}
      >
        <IconGrip size={14} aria-hidden />
      </TooltipButton>
      <span className="composer-queued-prompt-text" title={label}>{label}</span>
      <TooltipButton
        type="button"
        className="composer-queued-prompt-action"
        tooltip={isRunning ? t("chat.steerQueuedPrompt") : t("chat.sendNow")}
        ariaLabel={isRunning ? t("chat.steerQueuedPrompt") : t("chat.sendNow")}
        disabled={approvalPending || pending || (!isRunning && promoted)}
        onClick={() => isRunning ? onSteer(item) : onSendNow(item.id)}
      >
        <IconCornerDownLeft size={14} aria-hidden />
      </TooltipButton>
      <TooltipButton
        type="button"
        className="composer-queued-prompt-action"
        tooltip={t("chat.removeQueuedPrompt")}
        ariaLabel={t("chat.removeQueuedPrompt")}
        onClick={() => onDelete(item.id)}
      >
        <IconTrash size={14} aria-hidden />
      </TooltipButton>
      <div className="composer-queued-prompt-menu-wrap" ref={menuRef}>
        <TooltipButton
          type="button"
          className="composer-queued-prompt-action"
          tooltip={t("chat.queuedPromptActions")}
          ariaLabel={t("chat.queuedPromptActions")}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          ref={triggerRef}
          onClick={() => setMenuOpen((open) => !open)}
        >
          <IconMore size={15} aria-hidden />
        </TooltipButton>
        {menuOpen && (
          <div className="composer-queued-prompt-menu" ref={menuItemsRef} role="menu" aria-label={t("chat.queuedPromptActions")} onKeyDown={onMenuKeyDown}>
            <button type="button" role="menuitem" disabled={locked} onClick={() => { setMenuOpen(false); onEdit(item.id); }}>
              <IconPencil size={14} aria-hidden />{t("chat.editQueuedPrompt")}
            </button>
            <button type="button" role="menuitem" disabled title={t("chat.sideChatComingLater")}>
              <IconPlus size={14} aria-hidden />{t("chat.openInSideChat")}
            </button>
            <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); onQueueingChange(!queueingEnabled); }}>
              <IconCornerDownLeft size={14} aria-hidden />
              {queueingEnabled ? t("chat.turnOffQueueing") : t("chat.turnOnQueueing")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
