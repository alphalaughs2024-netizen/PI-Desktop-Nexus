import { useEffect, useRef, type KeyboardEvent, type Ref } from "react";
import { BookOpen, Ellipsis, Globe, ScanText } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { WorkPanelTab } from "../../stores/app-store";
import { TooltipButton } from "../ui";

export function WorkPanelDock({
  activeKind,
  menuOpen,
  moreRef,
  onBrowser,
  onContextVault,
  onPromptInspector,
  onMore,
  onMoreKeyDown,
}: {
  activeKind?: WorkPanelTab["kind"];
  menuOpen: boolean;
  moreRef: Ref<HTMLButtonElement>;
  onBrowser: () => void;
  onContextVault: () => void;
  onPromptInspector: () => void;
  onMore: () => void;
  onMoreKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => void;
}) {
  const { t } = useTranslation();
  const dockRef = useRef<HTMLDivElement>(null);
  const frame = useRef<number | null>(null);
  const pointerX = useRef<number | null>(null);
  const scheduleMotion = (clientX: number | null) => {
    pointerX.current = clientX;
    if (frame.current !== null) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = null;
      const buttons = dockRef.current?.querySelectorAll<HTMLButtonElement>("button");
      buttons?.forEach((button) => {
        const rect = button.getBoundingClientRect();
        const proximity = pointerX.current === null ? 0
          : Math.max(0, 1 - Math.abs(pointerX.current - rect.left - rect.width / 2) / 112);
        const influence = proximity * proximity;
        button.style.setProperty("--dock-scale", String(1 + 0.36 * influence));
        button.style.setProperty("--dock-lift", `${-8 * influence}px`);
      });
    });
  };
  useEffect(() => () => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
  }, []);

  const items = [
    { kind: "browser", label: t("panel.tabs.browser"), Icon: Globe, onClick: onBrowser },
    { kind: "contextVault", label: t("panel.tabs.contextVault"), Icon: BookOpen, onClick: onContextVault },
    { kind: "promptInspector", label: t("panel.tabs.promptInspector"), Icon: ScanText, onClick: onPromptInspector },
    { kind: "more", label: t("panel.tools"), Icon: Ellipsis, onClick: onMore },
  ];

  return (
    <footer className="work-panel-dock-footer no-drag">
      <div
        className="work-panel-dock"
        role="group"
        aria-label={t("panel.tools")}
        ref={dockRef}
        onPointerMove={(event) => {
          if (event.pointerType === "mouse") scheduleMotion(event.clientX);
        }}
        onPointerLeave={() => scheduleMotion(null)}
      >
        {items.map(({ kind, label, Icon, onClick }) => (
          <TooltipButton
            key={kind}
            type="button"
            className="work-panel-dock-button"
            tooltip={label}
            ref={kind === "more" ? moreRef : undefined}
            data-work-panel-dock-item={kind}
            aria-pressed={kind === "more" ? undefined : activeKind === kind}
            aria-haspopup={kind === "more" ? "menu" : undefined}
            aria-expanded={kind === "more" ? menuOpen : undefined}
            aria-controls={kind === "more" ? "work-panel-context-menu" : undefined}
            onKeyDown={kind === "more" ? onMoreKeyDown : undefined}
            onClick={onClick}
          >
            <span className="work-panel-dock-circle" aria-hidden="true"><Icon size={20} /></span>
            {activeKind === kind && <span className="work-panel-dock-active" aria-hidden="true" />}
          </TooltipButton>
        ))}
      </div>
    </footer>
  );
}
