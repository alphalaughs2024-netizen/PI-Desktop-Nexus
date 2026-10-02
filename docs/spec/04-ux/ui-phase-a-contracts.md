# UI Phase A component contracts

## Shell

- App shell owns three-zone composition and shared shell tokens.
- Sidebar owns navigation hierarchy, project/session rows, and Sidebar focus.
- Main titlebar owns session title and top-level actions.
- Chat surface owns transcript spacing and readable content surfaces.
- Agent operation card owns the floating glass workflow strip, its disclosure,
  bounded draggable position preference, and active-workflow title/stage/actions.
  Its fluid energy core observes session-specific runtime activity; separate
  light-spill and bounded glass surfaces preserve bloom without clipping it
  or reserving composer/transcript space.
- Composer owns prompt input, permission/model controls, send/stop, and focus.
- Work Panel frame owns dock/maximize/close, outer surface, and frame focus.

## Browser

- `BrowserCoreTab` composes Browser state and child surfaces.
- `BrowserTabStrip` owns tab chrome and tab keyboard behavior.
- `BrowserToolbar` owns navigation controls, address, actions, and overflow.
- `BrowserReadinessStrip` owns one compact status line.
- `BrowserGuestSurface` owns only the measured native guest rectangle.
- `BrowserOperationStatus` owns one stable `role="status"` region.
- `BrowserErrorNotice` owns one stable `role="alert"` region.
- `BrowserEmptyState` owns New Tab/no-page presentation.
- `BrowserDiagnosticsDrawer` is hidden by default and owns safe diagnostics.

No component may add a second Browser title row, duplicate readiness live region,
raw native identifiers, raw page data, or fallback page markup over the guest.
