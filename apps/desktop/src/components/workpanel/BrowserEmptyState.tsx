export function BrowserEmptyState({ visible }: { visible: boolean }) {
  if (!visible) return null;
  return <div className="browser-empty-state"><strong>Browser ready</strong><span>Open a URL or preview a workspace HTML file.</span></div>;
}
