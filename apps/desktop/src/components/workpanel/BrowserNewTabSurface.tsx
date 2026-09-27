/** Renderer-owned page surface for all intentional no-page/about:blank states. */
export function BrowserNewTabSurface({ onFocusAddress }: { onFocusAddress: () => void }) {
  return (
    <section className="browser-new-tab-state browser-state-surface" data-browser-surface="new-tab" aria-label="New tab">
      <div className="browser-new-tab-icon" aria-hidden>◉</div>
      <strong>New tab</strong>
      <span>Enter a URL to browse</span>
      <button type="button" onClick={onFocusAddress}>Focus address bar</button>
    </section>
  );
}
