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
Nexus still owns its GUI and appearance. Ordinary pnpm dev retains pi.
When PI_DESKTOP_HOST_BIN explicitly names an existing compatible host binary,
the launcher rebuilds JS dependencies and uses that binary without invoking
Cargo. This is development reuse, not verification of a fresh or packaged build.

## Session / turn / items

EngineSession binds engine version, provider/model, workspace and native handle,
with truthful capabilities. Temporary chats use their session scratch root.
EngineTurn contains a durable host turn ID, fresh run ID, native turn ID,
original accepted timestamp, phase, terminal timestamp and one outcome.
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
input starts a new turn. Changed session bindings require a new chat.

Unexpected process exit fails the active turn. Pending approvals are denied.
Recovery write failure reports a failure and leaves application partial output.
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
output. Native command sessions are engine-owned. Dedicated preview servers,
configurable browser viewports and screenshot tool results are later services,
not capabilities claimed by this phase.

## Acceptance boundaries

Agent mode, new user turns, native file/shell tools and configured image input
are supported. Plan/Goal, legacy regenerate, steering, plugin tools, manual
compaction and graceful stop do not silently fall back to pi. Existing features
remain available in the default runtime. Full response timeline/timer rendering
is Phase 3; full coding services are Phase 4. Existing chat migration is not
required. Responses support alone does not establish custom-tool compatibility.
The recorded OpenRouter Space Bunny trial passed commands/images/reasoning, but
did not expose Codex's custom apply_patch tool and rejected a forced custom-tool
request. Native patch parity on that route remains unverified. The xkiro route
passed native patch/recovery checks. Local E2E suites remain unrun unless
explicitly requested.
