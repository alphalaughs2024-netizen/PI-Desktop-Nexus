# ADR 0282: Host-owned provider usage ledger and billing adapters

- Status: Accepted

## Decision

Record one bounded, idempotent usage record per Responses request in the Rust
host database. The record is bound to the parent session and turn and stores
provider/model identity, parent agent attribution, outcome, normalized token
subsets, request/generation identity, charge provenance, and an optional fixed
decimal amount. Parent, subagent and compaction requests share the parent chat
ledger; delegates are not counted as extra user turns.

Provider-reported request charges and generation reconciliation win over
provider-specific price estimates, which win over catalog estimates. Missing
usage or pricing remains explicitly unpriced/unavailable. Account and key
usage endpoints are displayed in a separate provider section and are never
subtracted into a local chat total because they may include other applications.

OpenRouter ordinary-key `/key` and `/models`, wikivibe `/usage` and compatible
usage responses, and Xkiro `/usage`, `/usage/history` and `/models` are the
first adapters. A custom endpoint may use a compatible response shape; unknown
schemas remain unsupported while its local request records continue to work.
All billing requests resolve endpoint, headers and credentials from the saved
Rust provider record, reject redirects, use bounded responses/timeouts, and
cache refreshes briefly. Secrets never reach renderer state or logs.

## Consequences

The shell cost popover can distinguish This chat from All Nexus usage and the
dashboard can report request coverage honestly. Older turn-only history keeps
its tokens but cannot be given invented charges. Provider balance/limit data is
useful context but is visibly separate from Nexus spend.
