# ADR 0228: Tier 2 Checkpoint 1 Session Reliability and Workflow Surface

- **Status:** Accepted
- **Date:** 2026-09-13
- **Decision:** D228

## Context

Nexus keeps a durable per-session queue and a model-context compaction record.
The desktop can receive a terminal agent event before the persistence request
that closes the turn has settled. A queued prompt must not race that write, but
it also must not remain asleep after the write completes. Compaction recovery
also needs to retain bounded user context and any real carried summary when the
provider cannot produce a new summary. Finally, active workflow guidance is a
first-class Nexus surface and must remain readable in the scenic theme.

## Decision

After a turn finalization promise settles, Electron Main removes the temporary
finalization busy guard and kicks the Agent Host queue. The bridge continues to
report both active turns and in-flight finalizations as busy, so dispatch cannot
occur before durable settlement.

Automatic compaction fallback persists a bounded retained user tail. When a
fallback is compacted again, Nexus strips only its recovery marker and keeps
the carried summary. This behavior is model-agnostic and does not change tool,
permission, or confirmation authority.

The active workflow card uses an explicit full-width inspection surface and
outlined controls. Twilight scopes its material to the raised/safety tiers;
normal themes retain their semantic-token behavior. No workflow body can add
authority or alter session lifecycle.

The pinned `@earendil-works/pi-ai@0.85.1` dependency remains in place. Its
existing workspace patch stops consuming a Responses stream after a terminal
event; upgrading the dependency is deferred until an upstream release carries
the same behavior.

## Consequences

- FIFO queued prompts resume once, only after `session.endTurn` settles.
- Failed compaction remains recoverable after a restart or model switch.
- Workflow inspection is localized, keyboard-visible, and no longer paints as
  an unexplained black rectangle in Twilight.
- The patch remains isolated to Nexus and does not change upstream Pi Desktop.
