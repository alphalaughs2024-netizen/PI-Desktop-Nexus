import type { WorkPanelPresentation } from "../../lib/work-panel-presentation";

export function BrowserToolbar({ presentation, disabled = false }: { presentation: WorkPanelPresentation; disabled?: boolean }) {
  return (
    <div className={`browser-toolbar browser-toolbar--${presentation}`} aria-label="Browser controls" data-browser-toolbar-disabled={disabled || undefined}>
      <div className="browser-toolbar-placeholder" aria-hidden="true" />
    </div>
  );
}
