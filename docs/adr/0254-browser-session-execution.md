# ADR 0254: Execute Browser tools against retained session tabs

- Status: Accepted by user on 2026-10-01; implementation awaits manual acceptance
- Date: 2026-09-30
- Related: [ADR 0241](0241-browser-tab-guests.md),
  [ADR 0242](0242-browser-tab-lifecycle-and-command-order.md),
  [ADR 0243](0243-browser-agent-interaction-and-result-contract.md)

## Context

A blank Browser open could report success with a null result: the policy
accepted `about:blank` while the native pane rejected it without creating a
guest. Inspection then reported that the guest was unavailable, including when
the panel had already opened. Background navigation also returned the visible
chat's state without navigating, and CDP/ref ownership followed global GUI
selection. A detached native view can load and expose an accessibility tree
without a compositor capable of screenshots or mouse hit testing.

## Decision

- Resolve every command to the originating session and its selected retained
  tab, or an explicit tab in that session. Create the default tab lazily for an
  implicit first request. Unknown explicit tab IDs fail.
- Capture the tab incarnation when admitting a command. Closing and reopening
  a tab must not redirect an outstanding command to the replacement guest.
- Execute without depending on the Browser panel mounting, painting, or being
  selected. Panel activation remains a presentation event after the operation and
  preserves the selected retained page's actual URL;
  background execution does not switch the user's selected page.
- Retain one CDP client per native guest. Scope snapshots and command ordering
  by session and tab. Stop bypasses the queue. An uncertain operation remains
  ordered until it settles; it is never replayed automatically.
- Use the exact safe blank destination plus the existing HTTP(S)/workspace
  policy. Native navigation returns a real guest state or a failure. A load
  deadline rejects and stops the load; it does not become a successful null
  result.
- Main owns one lazy hidden render host for operations on detached guests that
  need native rendering. It temporarily reparents the existing view; it never
  creates a second page or changes the visible selection. A temporary viewport
  supplies a native surface, while explicit desktop/mobile emulation survives
  until reset. Mouse input waits for a compositor frame. Renderer geometry and
  attachment remain authoritative for the visible page.
- Release the hidden host after disposing guests, and clean up temporary
  attachment on success, failure, timeout, closure, or GUI reattachment.
- The address field follows committed navigation when merely auto-focused.
  A user-edited draft remains intact until submission, Escape, or leaving the
  field; inspection cannot substitute a blank location for a loaded page.
- Typed tab listing returns only tabs owned by the requesting session.
  Compatibility GUI listing can still enumerate retained tabs.

## Consequences

AI and GUI commands address the same retained page and history. Browser tools
work before and after the panel opens, without a user mounting workaround.
Failures remain explicit and session/tab refs do not leak across conversations.
The hidden render host adds one native window only when needed; it is never
shown and has no taskbar entry. Its memory overhead has not been measured.
Browser themes, layout, and controls are unchanged.

## Validation

Targeted behavior tests cover ownership, implicit selection, closed/replaced
tabs, null navigation, load errors, waits, policy gates, per-tab invalidation,
and cross-session snapshot refs. An isolated real Electron fixture additionally
covers blank startup, background click/fill, desktop/mobile screenshots,
navigation waits, failed/stalled loads, and visible/hidden panel transitions.
A real Nexus/Codex fixture verifies structured screenshot input reaches the
model. Windows native window capture and input confirm that the GUI displays
the page and that a user click changes it. The full local E2E suites and a
packaged application remain separate validation gates.
