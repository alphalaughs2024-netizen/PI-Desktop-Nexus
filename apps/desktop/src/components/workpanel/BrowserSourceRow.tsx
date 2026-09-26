import { IconExternal } from "../icons";

export type BrowserSource = "user" | "agent" | "workspace-preview" | "background" | "unknown";

const labels: Record<BrowserSource, string> = {
  user: "Opened by you",
  agent: "Opened by agent",
  "workspace-preview": "Workspace preview",
  background: "Background session",
  unknown: "",
};

export function BrowserSourceRow({ source, onOpenExternal, disabled = false }: { source?: BrowserSource; onOpenExternal?: () => void; disabled?: boolean }) {
  const label = labels[source ?? "unknown"];
  return (
    <div className="browser-source-row" data-browser-source={source ?? "unknown"}>
      <span className="browser-source-label">{label || "Browser session"}</span>
      {onOpenExternal && <button type="button" className="browser-source-external" aria-label="Open in default browser" title="Open in default browser" disabled={disabled || !label} onClick={onOpenExternal}><IconExternal size={13} /></button>}
    </div>
  );
}
