# ADR 0269: Native Browser Menu Surface

- Date: 2026-10-02
- Status: User-approved direction; manual acceptance pending
- Scope: Browser chrome menus and additive desktop IPC

## Decision

Tab and overflow menus use one retained, trusted, sandboxed WebContentsView.
This keeps the live webpage visible beneath menus. Electron owns bounds, child
order, lifecycle and dismissal. The surface denies navigation/popups and does
not initialize an app controller, agent or browser service.

The main renderer publishes a revisioned snapshot containing session identity,
anchor, labelled/icon menu items and Nexus theme tokens. Only its actual sender
may publish or close snapshots. The menu renderer may request readiness,
dismissal, or selection of an enabled item in its current snapshot. Foreign
senders, stale revisions, mismatched sessions and unknown/disabled items fail.
Selection retires the snapshot before forwarding the item ID exactly once.
Execution stays with existing main-renderer callbacks; no executable arguments
or arbitrary browser actions enter the menu bridge.

The host clamps bounds, raises the menu after guest updates, and closes it on
resize, window blur, main navigation, renderer failure or shutdown. A dismissed
loading menu cannot reopen. Failed loads release the view for a later attempt.
Keyboard selection and Escape restore focus; outside input/focus dismisses it.
The floating composer remains blocked independently of other overlays.

Desktop IPC adds browserMenu invoke/event channels. Rust storage and agent
protocols are unchanged. Workspace aliases ensure main, preload and renderer
compile the same shared contracts from the current checkout even when worktrees
reuse dependency installations.

## Validation

Targeted mocked-Electron checks cover sender/session/revision validation,
one-shot dispatch, disabled items, geometry/child order, loading races, failure
recovery and destruction. Native probes check actual menu input and live-page
continuity. Local E2E suites remain a separately requested gate.

The 2026-10-02 targeted validation passed 40 checks, desktop typecheck and
production main/preload/renderer builds. The isolated native probe passed
live-menu input, floating history expansion/keyboard sizing/outside clicks,
Brain model-menu bounds, intermediate presentation widths, retained page input,
four themes, reduced motion, 244px tools, rapid tab switching and popup/close
lifecycle, with no renderer exceptions or native error dialogs. Manual visual
approval and pointer resizing remain user acceptance checks.
