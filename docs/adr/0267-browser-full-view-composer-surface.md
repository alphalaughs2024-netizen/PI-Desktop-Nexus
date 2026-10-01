# ADR 0267: Browser Full View and Native Composer Surface

- Date: 2026-10-02
- Status: User-approved direction; manual acceptance pending
- Scope: Built-in Browser presentation, trusted renderer input surface

## Decision

Browser has one tab band with Enter/Exit full view and a Chat return control.
Full view occupies the application content, retaining the existing browser
resource, chat identity, native guest, page state and execution. Ctrl/Command+
Shift+F toggles this presentation from chrome, page or floating composer.
Nexus themes, materials, fonts and existing icons remain authoritative.

The user selected a floating composer over the webpage. A native
WebContentsView renders the existing Composer because an HTML overlay in the
main renderer would be obscured by the native browser. Electron owns its
creation, bounds, visibility, child order and shutdown. The composer view is
sandboxed, isolated, uses the trusted app preload and denies navigation/popups.
It never bootstraps a second app controller or agent session.

Main React retains the sole authoritative chat store. It publishes selected
composer state with immediate ownership updates and bounded 80ms streaming
batches. Recent reply data are limited to eight messages; tool bodies
and reasoning are excluded and assistant text is bounded. Context totals are
computed from the complete main transcript and transferred with tool usage
metadata only, so bounding reply data does not change the inspector's totals.
An explicit action
allowlist relays commands to the main store with request IDs and results.
Slash commands and draft session materialization also execute in that main controller.
The host validates actual sender IDs, visibility, session and generation.
Stale commands fail; commands are not replayed after timeout or failure.

Only one composer is editable. The docked Composer unmounts in Full view;
its existing in-memory draft cache transfers text and attachment references
to the native Composer. Live native draft updates return to that cache;
returning to Chat restores it. Generations protect session switches and
repeated enters/exits. Drafts retain the existing memory-only persistence
contract; application restart does not promise draft recovery.

The native input surface remains above the guest after tab changes. Its
rectangle expands for input menus, then shrinks on dismissal. Search hides
the native composer; pending tool permission prompts return to Chat so the
approval cannot be obscured. UI-owned Plan/Ask controls remain available.
Speech transcription, progress and microphone checks recognize this trusted
renderer by its native identity; webpages are never granted these app privileges.
Switching presentation stops an active voice cycle so a hidden input surface
cannot continue recording. Voice can be started again in the visible composer.

Browser tab and overflow menus use viewport-positioned body portals to avoid
transformed-panel containing blocks. Existing New tab controls remain available;
final visual redesign is deferred to user review after functionality. External browser profiles,
agent permissions and browser capability contracts are unchanged.

## Material Chrome Acceptance

The user selected Material chrome from the separate browser study. The
presentation uses separated tabs and visible viewport, Capture and Inspect
controls with Nexus semantic theme tokens. At wider widths the existing guest's
measured rectangle excludes the inspector; narrow inspectors hide it. There is
still one guest and one chat controller. Global overlays and browser controls
independently block the native input surface, so closing one cannot uncover
another. Viewport selection remains owned by the existing Electron browser
service and is shared between the toolbar and drawer.

## Validation

Targeted lifecycle, sender, stale-action, draft handoff and compositor checks
must accompany desktop typecheck and production renderer/main/preload builds.
Real Electron probes verify page and composer pixels separately because
main-renderer screenshots do not include native child imagery on this host.
Local E2E suites and packaged Windows validation remain separate gates.
