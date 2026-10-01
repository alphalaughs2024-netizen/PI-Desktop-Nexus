import { Camera, Code2, Monitor, PanelsTopLeft, Smartphone } from "lucide-react";
import { browserViewportMode, type BrowserViewport, type BrowserViewportMode } from "../../lib/browser-viewport";

export function BrowserInspectionToolbar({ viewport, disabled, busy, inspecting, onViewport, onCapture, onInspect }: {
  viewport: BrowserViewport | null;
  disabled: boolean;
  busy: boolean;
  inspecting: boolean;
  onViewport: (mode: BrowserViewportMode) => Promise<void>;
  onCapture: () => Promise<void>;
  onInspect: () => void;
}) {
  const selected = browserViewportMode(viewport);
  return <div className="browser-inspection-toolbar" role="toolbar" aria-label="Page inspection">
    <div className="browser-viewport-options" role="group" aria-label="Page viewport">
      {([
        ["panel", "Panel", "Use panel size", PanelsTopLeft],
        ["desktop", "Desktop", "Desktop viewport, 1440 by 900", Monitor],
        ["mobile", "Mobile", "Mobile viewport, 390 by 844", Smartphone],
      ] as const).map(([mode, label, title, Icon]) => <button key={mode} type="button" aria-label={title} title={title} aria-pressed={selected === mode} disabled={disabled || busy} onClick={() => void onViewport(mode)}><Icon size={14} /><span>{label}</span></button>)}
    </div>
    {selected === "custom" && viewport && !viewport.reset && <span className="browser-viewport-custom" title={`Agent viewport: ${viewport.width} by ${viewport.height}${viewport.mobile ? ", mobile" : ""}`}>{viewport.width} x {viewport.height}</span>}
    <div className="browser-inspection-actions">
      <button type="button" aria-label="Capture screenshot" title="Capture screenshot" disabled={disabled || busy} onClick={() => void onCapture()}><Camera size={14} /><span>Capture</span></button>
      <button type="button" aria-label="Inspect page" title="Inspect page" aria-expanded={inspecting} aria-controls="browser-inspector" onClick={onInspect}><Code2 size={14} /><span>Inspect</span></button>
    </div>
  </div>;
}
