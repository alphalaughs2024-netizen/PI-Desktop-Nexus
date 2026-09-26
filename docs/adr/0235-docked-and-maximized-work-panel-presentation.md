# ADR 0235: Docked and Maximized Work Panel Presentation

- Status: Accepted contract; implementation follows the Browser Work Panel UI/UX phases
- Date: 2026-09-26
- Supersedes in part: ADR 0033, ADR 0065, ADR 0081, and older Browser panel ownership language
- Related: ADR 0029, ADR 0032, ADR 0068, ADR 0085, ADR 0234

## Decision

The Work Panel is a renderer-owned secondary workspace with two presentations:

```ts
type WorkPanelPresentation = "docked" | "maximized";
```

Docked is the default. It remains the existing fixed-width, in-flow right-side
column beside MainChat. Maximized is a temporary in-window Nexus workspace
layered above the existing client area. It is not an Electron BrowserWindow,
does not alter native window geometry, and does not create a second
WebContentsView.

The shell owns presentation, geometry, transition state, dock/maximize/close
controls, shell focus, accessibility announcements, resource switcher, frame
surface, and backdrop treatment. Resources receive presentation as layout-only
input:

```ts
type WorkPanelResourceProps = {
  presentation: WorkPanelPresentation;
  sessionId?: string;
  active: boolean;
  blocked: boolean;
};
```

Browser owns Browser-specific toolbar, readiness, source label, diagnostics,
empty/error copy, and the measured content-region guest bounds. Browser does
not own maximize/dock state.

## Identity and lifecycle invariants

- Docked and maximized presentations render the same Work Panel tab/resource.
- Browser always uses the canonical core Browser tab identity.
- Presentation changes never create a second BrowserId, WebContentsView,
  BrowserWindow, BrowserHost, BrowserPane, or BrowserCdp connection.
- Presentation changes do not reset Browser page, scroll, session ownership,
  readiness, pending-operation state, or guest generation.
- Presentation state is transient renderer state and is not persisted across
  relaunch.
- Presentation belongs to the visible Work Panel shell. Background sessions
  cannot maximize, dock, focus, or retarget it.
- Switching sessions preserves presentation for the visible shell, but always
  renders the selected session's retained resource context.
- Closing maximized Browser closes/hides the resource under existing tab rules;
  it does not itself destroy the logical Browser record. Docking never closes.
- Cmd/Ctrl+J remains the Work Panel visibility toggle, not a maximize shortcut.

## Geometry and visual contract

Docked remains an in-flow right column. Maximized is a bounded renderer overlay
inside the existing application window. The maximized frame uses semantic inset,
radius, surface, border, elevation, backdrop, and motion tokens rather than
resource-specific hard-coded geometry.

The underlying Nexus conversation remains mounted and recognizable. The
maximized frame uses a restrained translucent/glass surface with subtle
elevation; it must not read as a new application, a generic modal dialog, a
Chrome clone, or an opaque full-screen takeover.

The Browser guest-hole is measured only from the resource content region below
the shell/resource headers and Browser toolbar. The guest is not animated;
renderer geometry transitions coalesce bounds updates and publish the final
stable content rectangle after the transition.

## Interaction and accessibility

Dock, maximize, close, and reopen are separate actions. Maximize/dock preserve
logical focus where possible; close returns focus to the Work Panel opener where
possible. A context menu closes before a presentation transition.

Required names include Open Browser, Dock Work Panel, Maximize Work Panel, and
Close Work Panel; Browser resource controls retain their own names. One stable
Browser status region, one stable Browser alert region, and only necessary shell
transition announcements are permitted.

Reduced-motion mode replaces decorative expansion/collapse motion with an
immediate or near-immediate geometry change while preserving focus visibility.

## Security boundary

This presentation decision does not change Browser security. React never imports
Electron, accesses WebContents, constructs CDP calls, or bypasses BrowserBroker.
Main owns policy, URL/path validation, request/session binding, BrowserHost,
BrowserPane, BrowserCdp, and the guest. Diagnostics remain privacy-safe.

## Phase 2 implementation status

The renderer now owns transient presentation state and a reusable WorkPanelFrame.
Browser remains the first resource rendered through it. Docked mode retains the
existing in-flow width and session/tab behavior; maximized mode is a bounded
in-window frame with reduced-motion-safe transitions. The guest surface reports
coalesced content bounds and remains Main-owned. Browser toolbar and navigation
chrome remain deferred to later phases.

Phase 3 decomposes Browser resource rendering into explicit toolbar,
readiness, guest-surface, operation-status, error, empty-state, and diagnostics
boundaries. Guest measurement remains the only child allowed to publish core
surface bounds; all children remain renderer-only.

Phase 4 adds the first functional Browser toolbar controls through typed
navigation/action/external APIs and a bounded screenshot contract. Toolbar
state, address drafts, focus, menus, and operation feedback remain renderer
responsibilities; Main retains URL policy, session binding, screenshot caps,
and BrowserHost/Broker routing.

Phase 5 introduces an additive, privacy-safe BrowserViewState event separate
from navigation BrowserState. It drives distinct no-page, loading, unavailable,
blocked, and closed surfaces with source labels and explicit recovery. Retry
never replays the preceding Browser operation.

Phase 6 makes Browser view state session-routed and adds a safe diagnostics
projection/drawer. Background Browser activity cannot overwrite the visible
session; diagnostics expose only bounded state, stable codes, and safe actions.
Copy output is deterministic and excludes all Browser/page/host internals.

## Consequences

Browser is the first resource to implement the shell contract. Files, Terminal,
Sources, Diff, Artifacts, and later resources may use the same shell without
Browser-specific shell branches. The user workflow becomes:

```text
ask → inspect → maximize → act → dock → continue conversation
```

## Rejected alternatives

### New BrowserWindow for maximized Browser

Rejected because it creates a separate-app mental model, new focus/occlusion
failure modes, and a second native surface.

### Browser-owned maximize state

Rejected because Files, Terminal, Sources, Diff, and Artifacts need the same
presentation behavior and Browser cannot become the shell owner.

### Full-screen opaque modal

Rejected because it hides Nexus identity and makes focused Work Panel work feel
disconnected from the conversation.

### Persist maximized state across relaunch

Deferred. Presentation is intentionally transient until user expectations and
resource restoration behavior are validated.
