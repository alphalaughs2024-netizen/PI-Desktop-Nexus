# ADR 0219: Bound Consecutive Identical Tool Calls

- Status: Accepted
- Date: 2026-09-11
- Related: GitHub issue #179, ADR 0207

## Context

Small models can repeatedly request one tool with unchanged arguments, burning
context without making progress. Nexus already has a specialized three-failure
guard for line-anchored edits and shell patch commands; a second generic guard
must not interfere with that recovery path.

## Decision

`AgentRuntime` keeps one in-memory streak per prompt. A canonical fingerprint
contains the tool name and recursively key-sorted JSON arguments. On the fourth
consecutive identical call, before host execution, the runtime returns an error
with code `TOOL_REPEAT_LIMIT_EXCEEDED`, marks the call terminating, and reports a
single retriable visible error row at `agent_end`. A changed argument, an
intervening tool, or a new prompt resets the streak. `Edit` and patch-style
`Bash` are excluded because ADR 0207 owns their retry budget. Lifecycle and
delegation bookkeeping does not pass through this tool wrapper.

Only the fingerprint, tool name, and count are retained in memory. Tool output,
secrets, and argument bodies are never persisted or exposed in diagnostics.

## Consequences

Normal exploration remains unrestricted unless the exact same call is repeated
four times in a row. The guard gives small models a deterministic stop and a
useful recovery instruction, while specialized mutation recovery remains
unchanged. There is no setting to disable the bound in this first version.
