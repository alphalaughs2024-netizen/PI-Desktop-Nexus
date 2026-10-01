# Whole-response progress and streaming

Scope: opt-in Codex foundation, Phase 3. Architecture: ADR 0261.

## Response Identity and Timing

Each accepted host turn exposes one status disclosure through preparation,
model waits, commentary, tools, reasoning and final output. The host acceptance
timestamp is the beginning of total elapsed time. Native steering segments and
delegate convergence retain that timestamp and turn identity. Completion, failure
or interruption freezes the final total. Model-stream throughput retains its
separate meaning; it must not be calculated from the whole-turn duration.

## Progress and Timeline

The live label states what is known: preparing, recovering, waiting for model,
reasoning, writing response, running tools, waiting for approval/input/subagents,
retrying or compacting. Quiet startup and empty reasoning items show waiting for
model. Only supplied reasoning text is expandable. Commentary never clears the
active status. The status sits at the response tail so pinned scrolling keeps it
visible during long output. Expansion uses existing tool/reasoning/delegation
controls and lifecycle spans. Steering remains visible and is excluded from
assistant copy content. Themes, materials, typography, icons and shell geometry
remain unchanged. Legacy records without timing retain their previous layout.

Phase spans describe wall-clock state and may include simultaneous activities;
they are not additive provider/CPU measurements. Metadata is bounded to 256 spans,
retains the first/latest spans and reports omissions. Per-span detail is bounded.

## Delivery and Recovery

Text/command updates use immediate leading delivery and latest-snapshot frame
coalescing. A 60ms fallback drains queues when frames are suspended. Control and
terminal events synchronously flush pending snapshots before settling state.
Existing scroll position, historical row memoization and bounded mounting remain.
Completed text bypasses reveal pacing so no final output is hidden after finish.

Execution summaries have stable IDs and no textual/reasoning body. Rust persists
the final summary plus turn identity and steering metadata. Active snapshots are
projected on chat selection/reload without replay; later generations, terminal
records and newer deltas cannot be replaced by stale snapshot responses. An old
engine with no process owner is interrupted, never advertised as still running.
Partial answers/tool results stay inspectable after failure or interruption.

See E2E-Codex-Progress-Streaming for acceptance. Local E2E suites require explicit
user authorization; packaged verification remains the final runtime phase.
