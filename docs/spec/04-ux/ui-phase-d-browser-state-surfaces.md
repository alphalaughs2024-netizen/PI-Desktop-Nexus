# UI Phase D Browser state surfaces

Phase D makes the Browser page region an explicit renderer-owned presentation
surface. Browser chrome retains its fixed header, source row, tab strip,
toolbar, readiness row, operation status, and alert region while exactly one
content surface occupies the reserved viewport.

## State mapping

| Presentation state | Content surface | Native guest |
| --- | --- | --- |
| `no-page` or `about:blank` | New Tab | hidden |
| `starting` | Starting Browser | hidden |
| `loading` | measured Browser guest | visible |
| `ready` | measured Browser guest | visible |
| `unavailable` | Surface unavailable recovery | hidden |
| `policy-blocked` | Policy blocked recovery | hidden |
| `debugger-unavailable` | Debugger unavailable recovery | hidden |
| `closed` | Browser closed recovery | hidden |

`BrowserCoreTab` is the sole mapper from safe `BrowserViewState` to this
presentation model. Child surfaces do not derive lifecycle booleans or inspect
unsafe browser data.

## New Tab and recovery behavior

- New Tab is an opaque Browser-owned surface with the exact `New tab` and
  `Enter a URL to browse` copy plus a secondary Focus address bar action.
- Entering New Tab focuses the Browser address and selects existing draft text.
- Surface unavailable, Policy blocked, Debugger unavailable, and Browser closed
  use distinct safe copy and only the recovery actions appropriate to the
  current state.
- Diagnostics remains hidden by default and exposes only safe display fields.
- Recovery never automatically replays navigation or another Browser operation.

## Layout and accessibility

The content viewport is reserved below fixed Browser chrome. Changing content
surface cannot change toolbar, readiness, operation-status, or guest geometry.
There is one primary readiness row, one stable polite `role="status"`, and one
stable assertive `role="alert"`. Browser semantic tokens supply all surface,
text, border, focus, ready, loading, and error colors; reduced-motion removes
decorative state transitions.
