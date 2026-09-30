# ADR 0255: Connect Codex to Nexus-owned tools

- Status: Phase 2 opt-in implementation; manual acceptance pending
- Date: 2026-10-01
- Related: [ADR 0252](0252-codex-execution-contract.md),
  [ADR 0254](0254-browser-session-execution.md)

## Context

Codex owns native file and shell execution. Browser, preview, skill, workflow,
Git worktree and plugin services belong to Nexus. Their existing host handlers
must remain authoritative when Codex is the engine. Advertising a capability
does not establish an executable binding or permission grant.

## Decision

- Each Codex session gets a private loopback HTTP MCP bridge, authenticated by
  a fresh bearer token passed through the child environment. Browser origins
  and unauthenticated requests are refused. Keys and bridge tokens do not enter
  launch arguments, recovery snapshots or transcript diagnostics.
- Build the catalog from executable host and Main registries. Host definitions
  take precedence over duplicate extension entries. Native file/shell tools
  and Context Vault/Prompt Inspector tools are excluded from this bridge.
- Dispatch using the session, turn and mode owned by Nexus, irrespective of
  similarly named model arguments. Existing host/Main permission enforcement
  remains in place; the native MCP transport approval is not a host grant.
- Cache identical JSON-RPC calls within the active run. Keep all in-flight
  identities. Limit cached replies to 128 entries and 16 MiB; keep up to 4096
  bounded hashed admission identities per run and admit at most 64 concurrent
  calls. Repeated IDs with changed arguments fail. Evicted replies are reported
  as expired without repeating the call. Limits fail before dispatch.
- A vision-capable model receives a structured image block from a verified
  screenshot under its session scratch directory. Text carries metadata.
  GUI diagnostics and recovery retain metadata and omit encoded image bytes.
  MCP result errors remain failed tool items even if transport completed.
- Close owned bridges on launch, transport or initialization failure,
  preparation cancellation, process exit and shutdown. Preserve the original
  startup error even when cleanup also fails.
- Project instructions, the instruction catalog and active workflow guidance
  enter the native thread's developer instructions. Guidance cannot grant
  tools or permissions. Temporary HTML previews resolve within the session's
  workspace or scratch root using the existing path containment checks.
- Idle model/provider changes preserve the native thread handle. The next
  turn explicitly names the selected model; workspace/engine changes still
  require a new chat. No provider fallback is introduced.

## Acceptance Boundaries

This is opt-in integration. Plan/Goal, legacy extension command dispatch,
Main-local tool cancellation and configured subagent execution remain pending
Phase 2 work. The bridge does not implement a session-owned preview process
supervisor; `managedPreview` remains false. Existing file preview is a separate
capability. The current production runtime and appearance remain unchanged.

## Validation

Targeted tests cover authentication, identity binding, duplicate/conflicting
requests, cache eviction during an active mutation, screenshot image input,
diagnostic redaction, failed MCP results, model switching and bridge cleanup
on failed/interrupted preparation. A recorded real Nexus/Codex browser trial
verifies actual image input. Full local E2E and packaged-build tests remain
separate opt-in/acceptance gates.
