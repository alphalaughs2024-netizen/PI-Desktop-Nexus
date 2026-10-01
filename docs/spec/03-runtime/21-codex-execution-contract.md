# Codex execution contract

Status: Phase 2 opt-in prototype; manual acceptance pending.
Related: [ADR 0252](../../adr/0252-codex-execution-contract.md).

## Launch and scope

Run pnpm dev:codex from the request checkout. It calls the regular pnpm dev
pipeline with NEXUS_AGENT_ENGINE=codex and a separate profile under
%USERPROFILE%/.nexus-codex-phase2/profile. NEXUS_CODEX_PROFILE selects another
explicit test profile. The production .pi-desktop-nexus profile is refused. Chromium userData,
cookies and renderer localStorage also use the separate profile. One process
may own that opt-in profile; a second launch surfaces the existing window.

Pinned npm Codex 0.157.1 must already be installed. The prototype neither signs
in nor installs/upgrades an engine. Configure an API-key Responses endpoint;
unsupported transports/OAuth and mismatched engine versions fail explicitly.
On Windows, Nexus resolves the matching x64/arm64 optional native npm package
and launches codex.exe directly with piped I/O and windowsHide. The JavaScript
CLI shim spawns its native child without that flag, so hiding only the shim is
insufficient. Both package versions must match the pin; a missing native binary
or unsupported architecture fails before execution. A bundled vendor binary
is supported when the optional package is absent. Other platforms retain the
existing shim launch. Native process-tree cancellation remains Nexus-owned.
Creating a chat must not open a separate console window.
Nexus still owns its GUI and appearance. Ordinary pnpm dev retains pi.
When PI_DESKTOP_HOST_BIN explicitly names an existing compatible host binary,
the launcher rebuilds JS dependencies and uses that binary without invoking
Cargo. This is development reuse, not verification of a fresh or packaged build.

## Session / turn / items

EngineSession binds engine version, provider/model, workspace and native handle,
with truthful capabilities. Temporary chats use their session scratch root.
EngineTurn contains a durable host turn ID, fresh run ID, current native turn ID,
retired nativeSegments, original accepted timestamp, phase, terminal timestamp
and one outcome. Explicit guarded segment advancement retires the prior native
ID and returns to waiting-model without changing the host run or start time.
EngineItem holds assistant text, supplied reasoning, tools, approvals or
artifacts. No hidden reasoning is synthesized. The selected thinking level is
forwarded per turn using endpoint metadata; unavailable levels fail clearly
rather than silently using a higher provider default. AgentStatus.execution and
agentExecutionSnapshot expose this state without launch credentials.

The adapter emits immediate connection preparation status and existing Nexus
message/tool events. Commentary, native model steps and tool calls do not reset
the turn. Partial states flush before exactly one completed/interrupted/failed
outcome. Repeated, delayed, previous-generation, previous-native-turn and
post-terminal events cannot mutate the active state. Missing item completion
is explicitly failed. Native nonzero command exits remain failed.

## Recovery

Application transcript persistence remains host-owned. The adapter atomically
writes private recovery snapshots and retains native Codex history. Reconnect
resumes the native handle and reads its snapshot without inference. Known
completion is retained; unresolved work becomes interrupted with partial output.
An uncertain tool action is never replayed automatically. Explicit new user
input starts a new turn. Changed workspace/engine bindings require a new chat.
Idle provider/model changes keep the native handle and update the session's
effective model binding; the next turn explicitly names the chosen model.

Unexpected process exit fails the active turn. Pending approvals are denied.
Recovery write failure reports CODEX_RECOVERY_STORAGE_FULL for ENOSPC/EDQUOT,
or CODEX_RECOVERY_WRITE_FAILED for other errors, with a bounded filesystem code.
It preserves visible partial output but does not claim it is durably saved.
A failed save removes only its own temporary file, best effort, preserves the
previous snapshot and permits later queued saves after storage recovers.
Experimental raw patch/session output mapping is version-pinned and tested;
upgrading Codex requires fixtures and a live Windows check.

## Actual permission policy

Ask: read-only plus on-request escalation. Accept edits: workspace-write plus
on-request escalation. Auto: workspace-write, no escalation grants. Full access
maps to native danger-full-access with never approval, only when explicitly
selected for this session; it is not a global default. Other modes retain their
previous mappings. Windows uses the unelevated native sandbox for sandboxed modes.
Only explicit Allow once grants a native escalation. Session grant controls are
disabled for these requests. All approvals retain the 120-second deny timeout.
Native user questions retain the existing non-expiring Ask behavior.
Unknown server requests and unsupported secret questions fail clearly.

Cancel interrupts and closes the owned native process tree, preserving partial
output. Native command sessions are engine-owned. Dedicated preview process
supervision is a later service and is not claimed by this phase. ADR 0254 adds
session-bound Browser viewports and screenshots. File previews are available
through the private tool bridge; `managedPreview` remains false until
session-owned process supervision is implemented.

## Nexus tool bridge (ADR 0255)

A private authenticated loopback MCP bridge exposes executable Nexus Browser,
file preview, skill, workflow, Git worktree and plugin services to Codex. Native
Codex tools own file/shell work; Context Vault and Prompt Inspector stay outside
this bridge. Nexus binds every dispatch to its session and active turn and
retains host/Main permission enforcement. Project/workflow guidance enters
developer instructions without granting permissions.

Duplicate JSON-RPC IDs in one run share the same operation. Changed arguments
fail. Cached replies are bounded to 128 entries and 16 MiB; active identities
cannot be evicted. Up to 4096 hashed identities are retained per run, with at
most 64 active requests. An expired reply is reported without replay; new calls
over those limits fail before dispatch. Startup failure and interruption close
owned bridges and preserve the original error.

Screenshot results deliver actual image blocks to image-capable models while
transcript/recovery diagnostics omit encoded bytes. Models without image input
receive an explicit limitation. MCP `isError` results produce failed tool rows.
Main-local handlers receive a session/call-scoped cancellation signal. Stop,
timeout or transport close settles their visible result without waiting for an
unresponsive handler. Queued Browser actions do not dispatch after cancellation;
active navigation stops its owned guest, and an active mutation reports
`BROWSER_POSSIBLY_APPLIED`. Later workflow, Git and plugin mutation boundaries
check cancellation. Already-started native Git/devkit changes are not rolled
back or claimed undone. MCP shutdown aborts active calls and bounds its cleanup
wait to one second.

## Plan and Goal boundaries (ADR 0258)

Plan/Goal uses the existing host artifact and approval workflow. Entering either
mode stops the native execution segment and owned delegates before host mode
mutation. Partial output, host turn identity and start time remain intact.
Planning exposes permission-checked Nexus inspection tools and declared
plan-safe actions; native shell/patch, delegation and arbitrary browser evaluation
are unavailable. Bash retains its actual host permission policy, so planning
intent does not promise shell containment. GUI questions use the existing
non-expiring dialog and preserve unanswered questions on cancellation.

Submission stops the planning segment, validates the host artifact's exact
Markdown/hash/size, and leaves the proposal awaiting explicit approval. Approval
claims a new host execution turn with the exact artifact and selected permission
mode, resumes the same native history and restores native tools. Invalid,
unclaimed or mismatched execution descriptors fail before launch. Cancellation
or a failed transition cannot restart the previous segment. Reload uses the host
approval state and recovery handle; no mutation is replayed.

## Trusted extensions (ADR 0257)

The existing granted extension catalog loads through a Codex session bridge.
Commands, dialogs, rename, creation/fork and queued messages use the originating
host session. Registered tools cannot replace reserved names; they execute only
in an active Agent turn and receive its cancellation signal. Supported lifecycle
events and extension-owned tool_call/tool_result hooks are forwarded. pi-specific
context/provider mutation and unsupported control APIs produce diagnostics.
No pi agent, inference fallback or fabricated context usage is introduced.
Trusted code retains its sidecar trust and must cooperate with cancellation.
Disposal withdraws published commands; appearance is unchanged.

## Configured subagents (ADR 0256)

Task uses separate native Codex sessions. The preset's exact provider/model pin
is authoritative; unpinned workers inherit the chat selection. Model-selected
overrides and unavailable pins/tools fail without fallback. Native delegation
is disabled. Tool catalogs and returned provider calls are enforced before
execution, including streamed/namespaced functions; a hidden native tool cannot
bypass the preset. Children use host Read/Glob/Grep/Write/Edit/Bash rather than
native file/shell handlers, preserving saved permissions and shell identity.
This is tool enforcement, not additional containment of an allowed shell.
Task admission and reports include declared tools, Nexus host shell availability,
permission scope and parent permission mode. Ownership is explicitly scheduling
metadata, not filesystem ACLs. Parent native shell and child host shell can have
different sandbox results; reports must be assessed against their own observed
outputs. Explorer remains shell-enabled and is not described as enforced read-only.

The built-in UI designer declares Nexus Browser snapshot, screenshot, viewport,
console and interaction tools (ADR 0259). Screenshots deliver actual images to
image-capable children. BrowserPreview alone is not visual verification. Custom
presets retain their exact saved tool restrictions; an unavailable capability
fails explicitly instead of receiving an undeclared fallback tool.

Message/tool rows remain under the original Task and parent turn. Child
reasoning, commentary and final messages carry ownership on both the event
envelope and each message payload, so live display and reload agree. Child status,
error and terminal signals do not end the parent. Final Task results carry
structured provider/model, timing and outcome metadata; self-contained tool_end
metadata updates the same persisted row after the original call has returned.
Read-only work may overlap; simultaneous mutation workers sharing one workspace
are refused. Ten workers may run per session; private records retain at most 100
delegations, with admission refusing undelivered overflow. Preset maxTurns bounds
provider attempts and maxTokens caps each model response.

TaskWait returns bounded reports with explicit truncation/omitted IDs; a timeout
does not stop children. TaskList returns the roster; TaskStop retains partial
results. If the parent idles with undelivered work, show waiting-subagents,
retain its host turn/start time, and integrate settled reports through a normal
new native segment. Emit one terminal outcome after convergence. Stop, disposal
and parent failure stop owned children. Recovery reads partial child snapshots
and marks unresolved work interrupted without tool replay or automatic relaunch.
No credentials enter records. The exact-model settings picker is follow-up work.

## Acceptance boundaries

Text steering preserves the original host turn and records an accepted
instruction once. During model text/reasoning generation (including a quiet
model wait), interrupt the current native turn, wait for its terminal event,
and start a corrected native segment on the same thread with the original
reasoning effort. Preserve partial output and retire the old native ID.
During an active tool or approval, use native turn/steer with expectedTurnId;
its input is consumed at that work boundary, not by replaying tools.
A delayed initial start acknowledgement cannot rebind a retired native ID.
Failure after an observed native terminal closes the host turn; uncertain
interruption does not resubmit input. Cancellation prevents corrected restart. Stale/completed
turns reject without native dispatch. Requests with the same message ID are
deduplicated for the active run; uncertain failures are not replayed and never
reported accepted. Native tool work is not restarted.
Completion drains pending steering acknowledgements before releasing the host
turn; cancellation closes pending transport requests and remains interruptible.
Steering attachments
currently fail explicitly; send them as a new user turn.
Electron persists accepted native user-message events through its durable outbox
using the original host turn and message ID. Normal prompt rows are not appended
again. A host outage or app restart must retain the accepted instruction once.
An engine-admitted instruction remains visible even if later renderer queue
cleanup fails; only a rejected submission retracts its own optimistic row.
Chat switching and reload hydration must keep the instruction exactly once.

Agent/Plan/Goal, new user turns, native file/shell tools and configured image input
are supported. Legacy regenerate, manual
compaction and graceful stop do not silently fall back to pi. Existing features
remain available in the default runtime. Full response timeline/timer rendering
is Phase 3; full coding services are Phase 4. Existing chat migration is not
required. Responses support alone does not establish custom-tool compatibility.
The original OpenRouter Space Bunny route did not expose the custom patch tool.
[ADR 0253](../../adr/0253-openrouter-codex-patch-compatibility.md) adds an exact
endpoint compatibility service: JSON function transport returns to Codex's native
custom patch handler, preserving validation/permissions. Its loopback token is
private, the upstream key stays in the bridge, and cancellation closes both.
A disposable read/patch/read trial passed with one terminal outcome. The xkiro
route passed native patch/recovery checks without this service. Local E2E suites remain unrun unless
explicitly requested.

A periodic save failure for the active run stops its owned execution before
reporting failure; a late failed save from an older/terminal run cannot stop
the new run. Its original filesystem code remains explicit even if the final
snapshot write subsequently succeeds.
