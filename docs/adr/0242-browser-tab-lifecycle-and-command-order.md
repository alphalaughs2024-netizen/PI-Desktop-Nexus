# ADR 0242: Close the Browser resource with its last tab and scope navigation order

- Status: Accepted
- Date: 2026-09-28
- Deciders: PI-Desktop core
- Related: [ADR 0241](0241-browser-tab-guests.md)

## Context

ADR 0241 gave each Browser tab a separate guest, but the renderer kept the
last inner tab open and Main still queued every Browser mutation together.
A slow navigation therefore held up navigation in an unrelated tab. Toolbar
pending state also survived a tab switch.

## Decision

Closing the last inner Browser tab closes its native guest, clears its
in-memory tab context and remembered session URL, and closes the Browser Work
Panel resource. The existing Work Panel close behavior hides the panel when no
other resource remains. A
later explicit Browser open starts with one empty tab and a fresh guest.

Explicit tab navigation and actions are ordered per session and tab. Browser
commands without a tab ID retain the shared compatibility queue. Stop bypasses
the mutation queue so it can interrupt an in-progress load. Toolbar pending
state belongs to the selected tab and is reset when the selection changes.

## Consequences

- A loading page cannot delay navigation in another Browser tab.
- Commands targeting the same tab retain their order, except Stop, which acts
  immediately on that tab's guest.
- Closing the Browser resource from the Work Panel header still follows the
  existing resource lifecycle; the fresh empty tab rule applies when the last
  inner Browser tab is closed.
