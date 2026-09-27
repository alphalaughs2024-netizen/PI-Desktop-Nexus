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

After a navigation completes, the native guest remains mounted in `loading`
while the host verifies a nonempty page capture. An attached, visible guest
becomes `ready` only after that verification. A failed or empty capture becomes
`unavailable`; Retry starts a new verification without replaying navigation.
Normal `WebContentsView` guests do not use the offscreen `paint` event as a
readiness signal.
The guest rectangle uses renderer CSS pixels and Electron's local content-view
coordinates directly; display scale is not applied a second time. The main
frame finishing may verify a page even while subresources keep Electron's
loading flag active. A verified guest is ready on that path.
Surface capture has a bounded wait; a capture that does not settle enters
`unavailable` so the user can retry.
The visible Browser surface takes ownership when the active session changes.
Late hide messages from the previous session cannot detach the new session's
guest. The shared guest remains bound to the active Browser session.
The native guest is temporarily detached while Browser menus or Diagnostics
are open, because a `WebContentsView` composites above renderer controls.
Closing the overlay reattaches the existing page without navigating again.

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
The work-panel resource host and active tab pane fill the available panel body
height so New Tab, the measured native guest rectangle, menus, and Diagnostics
remain inside a full-height Browser surface in docked and maximized layouts.
The empty Browser viewport uses the panel background rather than a darker
separate band. Unmounting a guest synchronously publishes hidden geometry so a
native view cannot remain above another panel or menu.
There is one primary readiness row, one stable polite `role="status"`, and one
stable assertive `role="alert"`. Browser semantic tokens supply all surface,
text, border, focus, ready, loading, and error colors; reduced-motion removes
decorative state transitions.
