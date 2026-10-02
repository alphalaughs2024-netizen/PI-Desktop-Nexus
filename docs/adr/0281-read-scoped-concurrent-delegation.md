# ADR 0281: Enforced read-scoped concurrent delegation

- Status: Accepted

## Context

Task ownership metadata previously described a read request but a preset that
declared Bash, Write, or another mutating tool still entered the single
workspace writer lane. This made several inspection requests appear to fail at
dispatch even though they did not need mutation.

## Decision

When a Task explicitly requests `ownership.access: read`, delegation admission
intersects its available tools with Nexus's inspection allowlist: Read, Glob,
Grep, ProcessRead, and browser inspection tools. The child receives only that
effective list and instructions that make the restriction explicit. Read
delegates therefore overlap safely. A task with no remaining inspection tool is
rejected with a bounded tool-availability error.

The saved preset, its permissions and its tool document are not rewritten.
Write-scoped tasks retain the existing host permission policy and one-mutating-
delegate scheduling rule. Browser inspection is read-scoped; browser actions
that change a page are excluded. This is a scheduling and tool-admission
boundary, not an operating-system filesystem ACL.

## Consequences

Reports show the effective child policy, so a caller can distinguish a read
task from a writer. Concurrent inspection work can make progress in one
workspace while mutation remains serialized. Separate managed worktrees remain
required for concurrent mutation.
