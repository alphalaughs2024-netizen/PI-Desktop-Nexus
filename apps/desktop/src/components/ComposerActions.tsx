import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import { IconPlus, IconFileText, IconVoice, IconSparkles, IconUndo2 } from "./icons";
import { TooltipButton } from "./ui";
import { useVoiceMode } from "./VoiceConversation";

export function ComposerActions({
  disabled, attachmentDisabled, voiceDisabled, enhancementDisabled, enhancing, canUndo, onAttach, onEnhance, onUndo, onOpen,
}: {
  disabled: boolean;
  attachmentDisabled: boolean;
  voiceDisabled: boolean;
  enhancementDisabled: boolean;
  enhancing: boolean;
  canUndo: boolean;
  onAttach: () => void;
  onEnhance: () => void;
  onUndo: () => void;
  onOpen: () => void;
}) {
  const { t } = useTranslation();
  const voice = useVoiceMode();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const focusLast = useRef(false);
  const close = (restoreFocus = false) => {
    setOpen(false);
    if (restoreFocus) trigger.current?.focus();
  };
  const items = () => Array.from(menu.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? []);

  useEffect(() => { if (disabled) setOpen(false); }, [disabled]);
  useEffect(() => {
    if (!open) return;
    const enabled = items();
    (focusLast.current ? enabled.at(-1) : enabled[0])?.focus();
    if (!enabled.length) menu.current?.focus();
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const blur = () => setOpen(false);
    window.addEventListener("pointerdown", outside);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("pointerdown", outside);
      window.removeEventListener("blur", blur);
    };
  }, [open]);

  const openMenu = (last = false) => {
    focusLast.current = last;
    onOpen();
    setOpen(true);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      close(true);
    } else if (event.key === "Tab") {
      close(true);
    } else if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
      event.preventDefault();
      const enabled = items();
      const index = enabled.indexOf(document.activeElement as HTMLButtonElement);
      const next = event.key === "Home" ? 0 : event.key === "End" ? enabled.length - 1
        : (index + (event.key === "ArrowDown" ? 1 : -1) + enabled.length) % enabled.length;
      enabled[next]?.focus();
    }
  };

  return <div className="composer-actions" ref={root}>
    <TooltipButton ref={trigger} type="button" className={`icon-btn composer-actions-trigger${open ? " active" : ""}`}
      tooltip={enhancing ? t("chat.enhancingPrompt") : t("chat.composerAddMenu")}
      ariaLabel={t("chat.composerAddMenu")} aria-haspopup="menu" aria-expanded={open}
      aria-busy={enhancing} disabled={disabled}
      onClick={() => open ? close() : openMenu()}
      onKeyDown={event => {
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
          event.preventDefault(); openMenu(event.key === "ArrowUp");
        }
      }}>
      {enhancing ? <span className="tool-spinner" aria-hidden="true" /> : <IconPlus size={18} aria-hidden="true" />}
    </TooltipButton>
    {open ? <div ref={menu} className="composer-actions-menu" role="menu" aria-label={t("chat.composerAddMenu")} tabIndex={-1} onKeyDown={onKeyDown}>
      <button type="button" role="menuitem" className="composer-menu-entry" disabled={attachmentDisabled}
        onClick={() => { close(true); onAttach(); }}>
        <IconFileText size={16} aria-hidden="true" /><span>{t("chat.addFiles")}</span>
      </button>
      <button type="button" role="menuitem" className="composer-menu-entry" disabled={voiceDisabled && !voice.active}
        onClick={() => { close(true); voice.active ? voice.stop() : voice.start(); }}>
        <IconVoice size={16} aria-hidden="true" /><span>{t(voice.active ? "chat.stopVoiceMode" : "chat.voiceMode")}</span>
      </button>
      <button type="button" role="menuitem" className="composer-menu-entry composer-enhance-btn" disabled={enhancementDisabled}
        onClick={() => { close(true); onEnhance(); }}>
        <IconSparkles size={16} aria-hidden="true" /><span>{t("chat.enhancePrompt")}</span>
      </button>
      {canUndo ? <button type="button" role="menuitem" className="composer-menu-entry composer-enhance-undo"
        onClick={() => { close(true); onUndo(); }}>
        <IconUndo2 size={16} aria-hidden="true" /><span>{t("chat.undoEnhancement")}</span>
      </button> : null}
    </div> : null}
  </div>;
}
