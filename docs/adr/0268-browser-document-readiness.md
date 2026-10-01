# ADR 0268: Browser Navigation Returns at Document Readiness

- Date: 2026-10-02
- Status: User-approved direction; manual acceptance pending
- Scope: Built-in browser navigation completion and surface verification

## Decision

Navigation completes when Electron reports the main document's DOM ready, or
when its full load finishes first. Slow subresources no longer prevent agents
from inspecting a usable document. Returned browser state retains `isLoading`;
the GUI continues showing loading and explicit page-load waits still await full
load. Navigation that never becomes ready retains the 15-second deadline and
the existing uncertain-mutation response without automatic replay.

Native surface verification may begin at DOM readiness. It still requires real
bounds, attachment and nonempty captured pixels. Readiness listeners and timers
are retired on every navigation outcome. Later load failures remain lifecycle
events and are not converted into successful full-load claims.

## Evidence and Validation

The user's `browser test` recorded a YouTube navigation timing out after
dispatch at the prior full-load boundary. This establishes the wait behavior,
not the underlying reason for that website's slow load. The user approved
returning at main-document readiness.

Focused tests cover DOM readiness with resources still loading, refused and
never-ready navigation, listener cleanup and native surface verification.
A native Electron probe uses a delayed image to verify the early result still
reports loading. Live YouTube and packaged builds remain separate acceptance
checks.
