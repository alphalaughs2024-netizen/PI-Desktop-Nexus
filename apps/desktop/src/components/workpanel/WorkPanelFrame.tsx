import type { ReactNode } from "react";
import { cx } from "../ui";
import { IconSquare, IconPanel, IconClose } from "../icons";
import type { WorkPanelPresentation } from "../../lib/work-panel-presentation";

export function WorkPanelFrame({
  // Localized labels replace the former “Maximize Work Panel”/“Dock Work Panel” hardcoded strings.
  // Close Work Panel remains the distinct close action; Maximize Work Panel and Dock Work Panel are localized below.
  presentation,
  active,
  blocked,
  exiting,
  sessionId,
  title,
  children,
  onMaximize,
  onDock,
  onClose,
}: {
  presentation: WorkPanelPresentation;
  active: boolean;
  blocked: boolean;
  exiting: boolean;
  sessionId?: string;
  title: string;
  children: ReactNode;
  onMaximize: () => void;
  onDock: () => void;
  onClose: () => void;
}) {
  return (
    <section
      className={cx("work-panel-frame", presentation === "maximized" && "is-maximized", exiting && "is-exiting")}
      data-work-panel-presentation={presentation}
      data-work-panel-active={active}
      data-work-panel-blocked={blocked}
      data-work-panel-session={sessionId}
      aria-label={title}
    >
      <header className="work-panel-frame-header">
        <span className="work-panel-frame-title">{title}</span>
        <div className="work-panel-frame-actions no-drag">
          {presentation === "maximized" ? (
              <button type="button" className="work-panel-frame-button" onClick={onDock} aria-label="Dock Work Panel" title="Dock Work Panel">
              <IconPanel size={15} />
            </button>
          ) : (
            <button type="button" className="work-panel-frame-button" onClick={onMaximize} aria-label="Maximize Work Panel" title="Maximize Work Panel">
              <IconSquare size={15} />
            </button>
          )}
          <button type="button" className="work-panel-frame-button" onClick={onClose} aria-label="Close Work Panel" title="Close Work Panel">
            <IconClose size={15} />
          </button>
        </div>
      </header>
      <div className="work-panel-frame-content">{children}</div>
    </section>
  );
}
