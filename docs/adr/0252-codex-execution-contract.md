# ADR 0252: Opt-in Codex execution contract

Date: 2026-09-30
Status: Phase 2 implementation; manual acceptance pending
Supersedes: pi-only execution for the opt-in prototype, not the production default
Related: [ADR 0251](0251-isolated-agent-foundation-evaluation.md)

## Decision

The user accepted the Phase 1 recommendation and selected real Codex app-server
as Nexus's future execution engine. Nexus remains the graphical application.
Its visual design is preserved. A developer opt-in uses pinned Codex 0.157.1;
the existing runtime remains the default until the rebuild is accepted.

The new adapter owns start, native events, interrupt, read-only recovery and
shutdown. Shared types distinguish a session, one accepted user turn, and
assistant/reasoning/tool/approval/artifact items. The native model/tool cycles
remain inside one Nexus turn. AgentStatus carries engine identity, original
acceptance time, phase, sequence and terminal state for the next rendering phase.
An additive executionSnapshot IPC exposes complete current state.

## Ownership

| Owner | Responsibility |
|---|---|
| Rust host-core | Nexus sessions, user messages, durable application transcript, turn IDs, provider configuration, secret-store persistence |
| Electron main | Trusted session/workspace/provider binding, attachments, existing transcript/outbox/checkpoint delivery, permission routing |
| Codex adapter | Per-session engine process, protocol compatibility, current execution snapshot, native recovery handle, approval timeout |
| Codex engine | Model requests, native tools, command sessions, native thread history and sandbox enforcement |
| Renderer | Existing transcript and permission UI; no inference or native process ownership |

Application data and engine execution state are separate. Recovery snapshots
live under the explicit test profile's codex-sessions directory, addressed by a
hash of the application session ID. Native history lives in that session's
private CODEX_HOME. Credentials are transient child-environment values, excluded
from native command environments, never argv or generated model metadata.
Workspace files and native history may contain task content; these are private
local execution records, not redacted diagnostic exports.

Each session has an explicit workspace: its project root or Temporary-chat
scratch directory. The same root reaches native tools. No existing chat is
migrated or reseeded. A changed provider/model/workspace binding requires a new
chat in this prototype. The launcher requires a separate profile and refuses
the production profile. Electron userData/sessionData use that profile too,
isolating Chromium localStorage/cookies. A per-profile single-instance lock
prevents two opt-in processes from sharing the same engine/application stores.

## Lifecycle and compatibility

A fresh run ID fences each accepted turn. Native thread/turn IDs and transport
generation fence late events. Monotonic sequence numbers reject repeats and
out-of-order reductions. Completed items cannot become running again. Final
partial items are emitted and recovery metadata is flushed before one terminal
signal. A missing tool completion closes as failed, never fabricated success.

Unexpected process loss keeps partial items and reports failure. Reconnection
uses thread/resume and thread/read; it does not invoke turn/start or replay a
mutation. A recovered unresolved turn is interrupted unless native history
proves completion/failure. The next request is an explicit new user turn, not
an exact continuation. Snapshot-write failures are surfaced rather than
silently claiming recoverability. ENOSPC/EDQUOT report
CODEX_RECOVERY_STORAGE_FULL; other write errors report
CODEX_RECOVERY_WRITE_FAILED with a bounded filesystem code. Visible output does
not establish that host transcript persistence or engine recovery succeeded.
Each failed save removes only its own partial temporary file, best effort,
preserves the previous snapshot, and does not poison later queued saves.

Codex's experimentalApi/experimentalRawEvents are explicitly enabled for the
pinned version. Raw apply_patch/write_stdin results close validation failures
that can lack typed items. These are not a stable API promise. A different
installed engine version fails preflight; upgrades require protocol fixtures
and real Windows checks. Unknown request methods fail visibly without approval.

## Permissions and processes

Ask uses read-only sandbox with on-request escalation; accept-edits uses
workspace-write with on-request escalation; Auto uses workspace-write and
never grants an escalation request. Full access is session-only and maps to danger-full-access/never when explicitly
selected in the existing composer. It does not become an inherited global default.
These mappings
are the actual engine policy, not claims that Nexus's old shell tool policy
continues to govern native tools. Windows uses Codex's unelevated backend.

Native command/file escalation requests appear in existing permission cards.
Only Allow once and Deny are supported. Allow session stays visible but disabled
for these requests. A 120-second timeout denies, and interruption/shutdown
settles waiters. Native user questions use the existing non-expiring Ask card; secret input
and permission-profile requests are unsupported and fail explicitly.

Native command sessions belong to the session's Codex process. Cancellation
interrupts the native turn and closes that owned process tree. App shutdown
requests adapter shutdown before forcibly closing the sidecar tree. Session-owned
preview services and browser tools are Phase 4 work; they are not claimed as
native capabilities of this adapter.

## Scope and acceptance

Agent mode and forward new turns are supported. Legacy Plan/Goal, history
regenerate, plugins/extensions, compaction UI and graceful boundary
stop are not silently routed to pi. Their integration is deferred. No OAuth
sign-in, paid fallback, universal endpoint compatibility, packaging or runtime
retirement is implied. The selected API-key endpoint must support Responses.
Model reasoning is displayed only when emitted by the native engine. Selected
thinking effort is forwarded per turn through the endpoint metadata mapping;
it is not discarded in favor of provider defaults. Responses support does not
imply custom-tool compatibility; see the recorded provider limitations in
scripts/agent-evaluation/PHASE2.md.

Phase 2 acceptance requires deterministic lifecycle/approval/recovery checks,
a real Windows native-tool/image trial, and a working opt-in pnpm dev prototype.
Text steering during sampling uses turn/interrupt, waits for the native terminal,
then starts a corrected native segment on the same thread. Native 0.157.1 queues
turn/steer input until sampling finishes, which cannot satisfy immediate text
steering. During an active tool or approval, retain turn/steer with the native
expectedTurnId guard so already-running work reaches its boundary.

A Nexus turn may therefore contain several native segments. EngineTurn records
retired native IDs/outcomes while preserving the original host ID, run ID,
start time, accumulated partial items and one host terminal outcome. The selected
effort is preserved. New corrections serialize; duplicate IDs share their first
outcome. Interruption must be acknowledged and observed before starting corrected
input. Unknown interrupt/start outcomes are reported without retry or tool replay.
Cancellation, native failure and late original start acknowledgements cannot
resurrect a retired segment or strand the host turn as busy.

Accepted instructions retain the original host turn identity and persist once;
failed or uncertain requests are not replayed. Renderer queue cleanup is a
separate operation; its failure cannot retract already-admitted steering.
Electron owns persistence of accepted steering message events through the
existing durable message outbox; the native engine retains its own history.
Completion drains pending steering acknowledgements before releasing the host
turn; cancellation closes pending transport requests and remains interruptible.
Steering attachments are
explicitly unavailable until shared attachment preparation is implemented.
The persistent whole-response status/timer UI is Phase 3. Full coding environment
capability parity and packaged Windows verification remain later gates.

A periodic save failure for the active run stops its owned execution before
reporting failure; a late failed save from an older/terminal run cannot stop
the new run. Its original filesystem code remains explicit even if the final
snapshot write subsequently succeeds.
