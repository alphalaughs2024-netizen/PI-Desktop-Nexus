# Managed processes and preview servers

Status: Phase 4 implementation and focused integration validation complete;
manual acceptance pending.
Related: [ADR 0274](../../adr/0274-session-owned-processes-and-previews.md)
and [ADR 0278](../../adr/0278-phase4-process-inspection-and-native-review.md).

## Process Contract

Rust owns process state independently of responses and reuses the selected shell,
permission gate, runner process groups and Windows Job ownership.

| Tool | Input | Result |
| --- | --- | --- |
| ProcessStart | command, optional contained cwd and previewUrl metadata | Opaque handle and observed state |
| ProcessRead | optional id, cursor and waitMs | Caller-only list or bounded logs and exit status |
| ProcessStop | exact id | Confirmed termination or explicit failure/pending |

Start is high risk under shell policy. Read/stop are low risk and access only
owned work. Plan/Goal permit inspection but deny start/stop regardless of caller
mode claims. Shell identity is checked before permission and again before
launch. Roots come from host session data; cwd is canonicalized inside the root.
Launch proves neither readiness nor successful exit.

Records carry id, sessionId, command, cwd, startedAt, completedAt, exitCode,
error, previewUrl and status: starting/running/stopping followed by
exited/failed/stopped/interrupted. Exit codes require actual observation.
Logs expose cursor, stream, text, nextCursor, outputDropped and logsAvailable
with a 96KB tail. Waits cap at 30 seconds; timeout leaves work running. Stop
succeeds only after observed exit; unsettled termination is PROCESS_STOP_PENDING.

Admission permits eight active processes globally, four per session and 128
records. Rust atomically saves lifecycle metadata in managed-processes.json.
Recovery retains metadata but no live logs, adopts no PID and replays no command.
Unfinished records become interrupted with unknown exit. User Stop, deletion,
project rebinding and shutdown close work; response completion, browser tab
changes and model changes retain it.

## Preview Contract

The Work Panel Processes tool exposes session-owned list/output/status and
explicit stop-one/stop-all actions through Main-window-only IPC. Rust
`process.read`/`process.stop` reuse the registry and require a real session;
foreign ids fail. These user actions never start work or grant agent tools.
Polling is serialized and paused for inactive/hidden panels. Requests are
retired on chat changes. Logs remain bounded and recovered interruptions are
shown without inventing exit codes or replaying work. Opening a preview uses
the existing browser resource and accepts only a recorded loopback HTTP URL.

Main PreviewServer supports start/status/stop/list. Start requires command and
loopback HTTP URL with a port; cwd is optional. Status/stop require an owned id.
List shows the caller's preview records. Status/list are Plan/Goal-safe;
start/stop are Agent-only. Session, turn, shell and delegate permission scope
reach Rust; existing permission cards remain authoritative.

Preflight rejects occupied ports; registry admission prevents concurrent managed
starts at the same authority. localhost becomes 127.0.0.1; IPv6 loopback is
supported. Credentials/fragments/external URLs are rejected and redirects are
not followed. Probes take at most one second and cancel response bodies.
2xx/3xx while the owned process is live reports ready=true: HTTP reachability,
not correct content. Browser inspection must verify the actual page.

Readiness defaults to five seconds and caps at 30. Timeout returns ready=false
with the live handle; later turns inspect that id. Exit reports
PREVIEW_PROCESS_EXITED. Cancellation during startup aborts approval/launch and
stops a returned owned handle. The outer tool deadline is 160 seconds, above
approval plus readiness; native MCP remains 240 seconds.

## Agent Integration

Codex advertises host/Main schemas. managedPreview is true only with the complete
catalog and permitted PreviewServer access in Agent mode. Instructions name the
host dialect and distinguish native foreground exec from managed background work.
Fixer/UI designer receive preview/process tools; test runner receives process
tools; explorer/reviewer receive inspection. Custom lists retain exact grants.
Delegates use the parent chat registry and can leave previews after completion.
TaskStop stops a worker; user Stop stops chat-owned managed work.

## Native Review And Coordination

Native successful `fileChange` items carry bounded message-owned
`details.nativeFileChanges` evidence: path, add/update/delete, optional previous
path and reported diff. The Review resource opens for the originating chat and
renders these alongside host snapshots. Failed/declined/stale events are excluded.
Native evidence has no host before-image or rollback control. Parent instructions
require waiting for a writing delegate before native edits/shell; scheduling
metadata is not a transactional lock. Independent managed worktrees in separate
chats remain the supported concurrent mutation boundary.

Task MCP calls await their matching native timeline item for at most five
seconds. Matching includes the tool name and canonical arguments; claims are
single-use and retire on cancellation or changed execution. This accommodates
independent HTTP/notification delivery without launching an unattributed worker.
Native rename destinations become the displayed path with the original path
retained. Git inspection is bounded to 15 seconds and 4 MiB per command;
launch, access, status and diff failures surface as errors, never a clean tree.

## Validation And Acceptance

A controlled local Responses fixture exercises real Codex multi-file patching,
foreground tests, real Rust preview startup, later inspection, stale-patch
refusal, user stop, and confirmed Git create/commit/merge/cleanup. A separate
real parent/child fixture verifies model pins, tool grants, attribution and
parent convergence. Component inspection covers the Processes/Review surfaces.
See the [Phase 4 report](../../../scripts/agent-evaluation/PHASE4.md).

Browser work delivered in Phase 3 is reused. External browser profiles, remote
publishing and processes surviving app shutdown are outside this phase. These
checks establish implementation coverage; live user acceptance remains pending.
