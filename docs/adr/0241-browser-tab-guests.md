# ADR 0241: Retain a native guest per Browser tab

- Status: Accepted
- Date: 2026-09-28
- Deciders: PI-Desktop core
- Related: [ADR 0234](0234-browser-built-in-capability-contract.md),
  [ADR 0240](0240-work-panel-resource-ownership.md)

## Context

The Browser chrome offered New, Duplicate, Close, and tab selection while Main
kept one `WebContentsView`. Selecting a tab navigated that one guest to the
tab's saved URL, so page state and navigation history were shared or lost.
Renderer tab labels were not independent Browser pages.

## Decision

Core Browser retains one Main-owned, sandboxed `WebContentsView` per Browser tab
within each conversation. A tab ID and session ID identify the guest; only the
selected tab's guest is attached and visible. Switching tabs preserves each
guest's document, scroll position, and navigation history without navigation.
Closing a tab disposes its guest. The renderer retains the ordered tab strip
and active tab ID in the conversation's in-memory context.

The core surface bridge carries tab identity. Activation and close use typed
Main IPC; navigation and actions carry the target tab ID so delayed operations
cannot land on a different selected page. Main continues to own URL policy,
permissions, CDP, and guest geometry. The existing Browser Work Panel resource
remains a singleton per conversation; its inner Browser tabs are distinct.

This supersedes the singleton guest clause in ADR 0170 and the corresponding
Phase 1/2 wording in ADR 0235. The shared persistent partition remains common
to Browser tabs so site login and storage behavior matches a normal browser.

## Consequences

- Each open page consumes a separate renderer process and memory until closed.
- Browser tools continue to use the selected guest by default; explicit tab IDs
  identify retained guests, and missing IDs fail instead of retargeting a page.
- Relaunch discards the in-memory tab set and guests under the existing Browser
  resource lifecycle.
