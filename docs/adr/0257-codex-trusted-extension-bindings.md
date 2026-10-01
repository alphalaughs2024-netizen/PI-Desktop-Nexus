# ADR 0257: Bind trusted extension commands to Codex sessions

- Status: Opt-in implementation; manual acceptance pending
- Date: 2026-10-01
- Related: ADR 0214, ADR 0215, ADR 0252, ADR 0255

## Decision

Reuse the trusted extension loader and session runner through a Codex-specific
bridge. Do not instantiate a pi agent or introduce an inference fallback.
Existing host grants and scope resolution still select the enabled entries.
Changes to that entry catalog replace the idle session binding and preserve its
native history. Commands, dialogs, rename, session creation/fork and the host
message queue remain attached to the originating Nexus chat.

Registered extension tools use the private MCP catalog, cannot replace reserved
host/control/native tools, and execute only in Agent mode while their parent turn
is active. Their own tool_call/tool_result hooks are honored. Execution receives
the parent cancellation signal; trusted code must cooperate with that signal.
These modules retain their existing sidecar trust and are not OS-sandboxed.
Extension exec calls launch hidden on Windows. Multimodal tool content remains
intact for image-capable models; other models receive an explicit limitation.

Supported message/turn/tool lifecycle observations are forwarded from the native
adapter. Tool hooks cover extension-owned tools, not native Codex tools. Native
context/provider request mutation, before_agent_start prompt replacement,
manual compaction, active-tool replacement and extension changes to thinking
effort are unsupported and diagnosed. No pi message context or fabricated token
usage is exposed. getSystemPrompt returns Nexus developer guidance, not Codex's
internal system instructions. Provider/model changes remain GUI-owned.

Disposal withdraws commands. Legacy UI text/layout/materials do not change.
Targeted fixtures cover the actual loader, dialogs, ownership, queued messages,
tool hooks, reserved names, planning exclusion and cancellation. Full local E2E
suites and packaged verification remain unrun. Plan/Goal approval is separate
unfinished Phase 2 work; Phase 3 has not started.
