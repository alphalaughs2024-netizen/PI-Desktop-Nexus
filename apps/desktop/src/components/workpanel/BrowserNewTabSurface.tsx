/** Renderer-owned page surface for all intentional no-page/about:blank states. */
import { IconLink, IconPlus, IconSearch } from "../icons";

export function BrowserNewTabSurface({ onFocusAddress }: { onFocusAddress: () => void }) {
  return (
    <section className="browser-new-tab-state browser-state-surface" data-browser-surface="new-tab" aria-label="New tab">
      <div className="browser-new-tab-content">
        <div className="browser-new-tab-icon" aria-hidden>✦</div>
        <strong>Ready when you are</strong>
        <div className="browser-new-tab-actions">
          <button type="button" className="browser-new-tab-action" onClick={onFocusAddress}>
            <span className="browser-new-tab-action-icon" aria-hidden><IconLink size={18} /></span>
            <span className="browser-new-tab-action-copy"><b>Open URL</b><small>Go to a website</small></span>
          </button>
          <button type="button" className="browser-new-tab-action" onClick={onFocusAddress}>
            <span className="browser-new-tab-action-icon" aria-hidden><IconSearch size={18} /></span>
            <span className="browser-new-tab-action-copy"><b>Search</b><small>Search the web</small></span>
          </button>
          <button type="button" className="browser-new-tab-action" onClick={onFocusAddress}>
            <span className="browser-new-tab-action-icon" aria-hidden><IconPlus size={18} /></span>
            <span className="browser-new-tab-action-copy"><b>New tab</b><small>Open a new tab</small></span>
          </button>
        </div>
      </div>
    </section>
  );
}
