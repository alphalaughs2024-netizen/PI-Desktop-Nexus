# ADR 0263: Codex command observations and bounded waits

- Status: Implemented; manual acceptance pending
- Date: 2026-10-01
- Related: ADR 0252, ADR 0254, ADR 0256, ADR 0261

## Evidence

The website-building test returned a native exec process handle while the server
remained alive. Browser navigation and screenshots succeeded afterward, but any
running command item took priority over later model activity. Successful turn
settlement then classified every unfinished command as failed. Separately,
TaskWait defaulted to 600 seconds (maximum 900) behind a 240-second MCP deadline.
The recorded wait failed at that transport deadline. An invented browser ID
failed; the real session tab ID worked. The preview file was outside the chat's
workspace and scratch roots, so its rejection was an expected boundary.

Read-only Codex source references in `C:\Games\cli\codex-rs` confirm that unified
exec returns a process handle and its asynchronous watcher reports exit later.
The pinned Nexus engine is 0.157.1; reference source is explanatory, not proof
that all installed versions expose identical notifications.

## Decision

EngineItem optionally retains native command observations: processId, yieldedAt,
exitedAt and exitCode. The raw exec return's canonical header supplies yieldedAt;
the command's stdout cannot supply it. Unknown header forms remain foreground
conservatively. Native command items supply processId and authoritative exit.
A yielded command remains inspectable and receives output, but cannot mask
foreground tools, approvals, assistant output or supplied reasoning. Successful
turn settlement closes its returned invocation without inventing process exit.
Foreground commands lacking a return still fail on unexpected turn completion.
Cancellation retains the existing engine shutdown and interruption behavior.
Recovered in-progress command items are never treated as proof of exit.

This is bounded turn-owned evidence, not a new process supervisor. Notifications
after turn settlement are not incorporated into that sealed turn. Cross-turn
process ownership, restart survival and session preview supervision remain Phase 4.
Steering keeps the existing tool-boundary rule for commands still owned by Codex.

Codex TaskWait defaults to 60 seconds and caps individual waits at 180 seconds,
leaving 60 seconds before the 240-second transport deadline for result delivery.
Legacy oversized calls are clamped. Timeout returns the effective bound, current
roster and instructions to wait again on the same IDs; it never stops workers.
The tool schema advertises the cap. Approval expiry remains 120 seconds.
These limits amend the older 600/900-second contract for the Codex adapter only.

Successful browser results expose the resolved browserId. An unavailable explicit
tab returns IDs belonging to the requesting chat and guidance to omit browserId
or list tabs. It never redirects to another tab or leaks another chat's IDs.
Preview rejection reports the allowed workspace/scratch roots and HTTP(S)
alternative without weakening filesystem containment.

Native event admission and envelope construction read small contract metadata
without cloning the full growing item collection. Published snapshots and
checkpoints remain defensive copies with the existing delivery cadence.

## Validation

Targeted tests cover yielded commands, later failure, stdout spoofing, progress
priority, snapshot restoration, wait expiry/resumption, and browser identity
isolation. Streaming checks exercise 100 chunks without adapter snapshot reads
for routing metadata. This supports a local-overhead improvement, not a claim
about model speed. Manual acceptance and packaged Windows checks remain separate.
