# ADR 0266: Explicit Browser selection and passive surface geometry

- Status: Accepted
- Date: 2026-10-02
- Related: [ADR 0242](0242-browser-tab-lifecycle-and-command-order.md), [ADR 0265](0265-built-in-browser-capabilities.md)

## Context

New tab after a loaded website caused 94 selection changes in two seconds in
the real Nexus window. Creation announced the prior selection, the renderer
echoed that notification as another activation, and stale surface measurements
could activate the old website again.

## Decision

Main owns retained tab selection. Explicit user/agent selections may change it;
tab notifications are observations and never issue activation commands.
Creation/activation publish completed state atomically. Every chat's tab
snapshot carries a monotonic in-process revision; renderer subscriptions ignore
older or duplicate snapshots, including delayed initial reads.
While explicit selection is pending, earlier host work cannot roll it back;
superseded activation replies are ignored. Failed activation restores the
latest observed host selection and reports the error.

Surface measurements cannot change selection. Visible and hidden reports from
another selected tab or chat are ignored. A surface belongs to the measured
chat/tab; the host does not reuse it to keep a different selected page visible.
Main updates presentation on native/agent selection
so the renderer can read it without reactivating the tab.

## Consequences

Existing page contents, navigation history, design and browser permissions are
preserved. Revisions are transient ordering metadata, not persisted history or
an engine session identifier. Reload takes a fresh snapshot from the current
host. Closed-tab geometry never recreates the tab.

## Validation

Forty focused ownership, capabilities, geometry, reopen and selection checks
passed. The native main-window regression probe verified one New tab selection,
twelve rapid explicit switches, rejected stale snapshots/geometry, retained
input, duplicate/close lifecycle and native popup selection, with no renderer
exceptions. It also verified main-window guest attachment, positive bounds and
nonblank native guest pixels. Duplicate/close-other menu actions were dispatched
programmatically; native menu positioning is not covered by this probe.

Desktop typecheck against the request's shared sources and Electron main,
preload and renderer builds passed. The broader selected checks also encountered
an existing source-only test expecting the old `Focus address bar` label; it
fails identically on unchanged main, whose New tab control says `Open URL`.
Local E2E suites and packaged Windows verification were not run. User retest
remains separate from these checks.
