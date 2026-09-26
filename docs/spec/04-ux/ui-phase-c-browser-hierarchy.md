# UI Phase C Browser hierarchy contract

Phase C refines the Browser-only card established by Phase B. The Browser
resource owns its chrome while the Work Panel frame retains only quiet context
and dock/maximize/close controls.

## Ownership

- `BrowserHeader` is the single meaningful Browser identity and owns a
  dedicated keyboard-accessible options menu.
- `BrowserSourceRow` owns safe source attribution and the external-open action;
  source attribution is not part of readiness text.
- `BrowserTabStrip` owns visible tab chrome, roving focus, close/new controls,
  and Ctrl/Cmd+Tab cycling.
- `BrowserToolbar` owns fixed navigation/address slots and its secondary action
  overflow. Header and toolbar menus remain separate.
- `BrowserReadinessStrip`, `BrowserOperationStatus`, and `BrowserErrorNotice`
  provide one primary readiness row, one stable `role="status"`, and one stable
  `role="alert"` respectively.

## Interaction contract

- Header menu uses `role="menu"`, arrow/Home/End navigation, Escape dismissal,
  and focus restoration to its trigger.
- Tabs use roving `tabIndex`; Arrow Left/Right, Home, End, Enter, and Space are
  keyboard equivalents of tab selection.
- Ctrl/Cmd+T creates a tab, Ctrl/Cmd+W closes the active tab, and
  Ctrl/Cmd+Tab / Ctrl/Cmd+Shift+Tab cycles tabs without creating a second
  Browser resource.
- The toolbar keeps fixed Back, Forward, Reload/Stop, address, and overflow
  slots. Secondary actions do not alter toolbar geometry between docked and
  maximized presentations.

## State and safety contract

New Tab and Browser-owned recovery/error surfaces are opaque renderer surfaces;
the native guest is mounted only for usable page states. Safe source/location
projections contain no raw session, WebContents, CDP, credentials, or page DOM
data. Browser semantic tokens provide all Browser chrome focus, state, border,
text, and surface colors across the four scenic themes.
