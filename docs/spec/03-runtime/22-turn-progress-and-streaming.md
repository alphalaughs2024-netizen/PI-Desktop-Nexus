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
assistant copy content. Themes, materials, typography and shell geometry
remain unchanged. Legacy records without timing retain their previous layout.

## Accepted Progress Motion

Response and tool status labels use the accepted theme-derived 2-second stepped
text sweep. The sweep box hugs the label rather than stretching through empty
row space. Active icons use primary text ink, and the sweep runs from a subdued
theme-derived base to primary ink for visible contrast. The response row puts the disclosure caret before the activity icon,
keeps a fixed icon box and a tabular total duration, and lets the label wrap at
narrow widths. The primary row uses 15px scaled text, an 18px icon and a 38px
minimum height; timeline rows retain their compact size. Commentary never replaces the status. Supplied reasoning uses the
brain icon; quiet model waits use the rotating arc. Commands use a blinking cursor,
search and delegation use one-time movement/stroke draws, approval/input waits use
the pause icon, and live completion draws its check once. Historical completions
are static. File, editing and browser activity retain their semantic Lucide icons.
Live phase/tool changes give the main icon and label a 180ms, 2px lift/fade with
a subtle scale from .98 to 1. Its identity is phase/tool-based, so timer and token
updates do not replay the entrance. Historical rows have no entrance animation.

While a tool is actually running, the row describes its action and supplied
description or concise target. Shell executable paths and raw argument JSON are
not used as its task label. During model waits, the spinning arc and swept
"Waiting for model" label remain truthful; the latest supplied assistant update
is available as a compact tail beneath the row. Nexus does not invent commentary
or continue describing a finished tool as running. Terminal turns remove that tail.

The timeline, tool details and reasoning disclosures use Motion-inspired 180ms
grid expansion and reverse collapse, with a 150ms caret rotation. Closed content
is inert immediately; its mounted contents survive the closing transition and
are then released. Unopened tool payloads and reasoning Markdown remain lazy.
Rapid direction changes cancel pending release and retain the open content.

Continuous icon motion stops when its activity or parent turn settles. Reduced
motion uses readable static labels/icons and instant disclosures. Icon shapes
come from Nexus's existing Lucide dependency. The accepted Lucide Animated
specimen informed independent CSS timing adaptations; no proprietary Codex/Kimi
artwork, additional animation dependency or theme palette is imported.

Expanded timeline rows use a spaced vertical stack, readable secondary labels
and a fixed muted elapsed-time column. Tool/reasoning headers keep separate icon,
name and summary gaps; long lifecycle labels wrap without overflowing narrow
conversation widths. This spacing is confined to the response timeline.
An active native reasoning item selects Reasoning immediately, even before
optional summary text arrives; no reasoning body is fabricated. Quiet gaps keep
the latest actual commentary below the status. The expanded timeline omits only
model waits shorter than one second; raw spans and total timing remain intact,
and active waits appear after that threshold. Other phases are always retained.
`waiting-model` means the active execution has no foreground tool, approval,
assistant output or native reasoning item to report. It does not distinguish
provider queuing, hidden reasoning or transport delays; short transitions between
completed items and turn settlement can also record it.

Phase spans describe wall-clock state and may include simultaneous activities;
they are not additive provider/CPU measurements. Metadata is bounded to 256 spans,
retains the first/latest spans and reports omissions. Per-span detail is bounded.

Native commands with a canonical yielded process handle stay inspectable but do
not take foreground priority over later work (ADR 0263). EngineItem command
metadata records processId/yieldedAt and any authoritative exit observation.
Successful turn settlement closes the returned invocation without implying that
its process exited. Unreturned foreground commands still fail on unexpected
completion. Recovery does not turn native in-progress state into an exit.
Existing cancellation and process ownership remain in force.

## Delivery and Recovery

Text/command updates use immediate leading delivery and latest-snapshot frame
coalescing. A 60ms fallback drains queues when frames are suspended. Control and
terminal events synchronously flush pending snapshots before settling state.
Existing scroll position, historical row memoization and bounded mounting remain.
Completed text bypasses reveal pacing so no final output is hidden after finish.

Native event routing, run identity and envelope metadata avoid full execution
snapshot clones on sustained deltas. Explicit snapshots and checkpoints remain
defensive copies; first-update and batching behavior is unchanged.

Execution summaries have stable IDs and no textual/reasoning body. Rust persists
the final summary plus turn identity and steering metadata. Active snapshots are
projected on chat selection/reload without replay; later generations, terminal
records and newer deltas cannot be replaced by stale snapshot responses. An old
engine with no process owner is interrupted, never advertised as still running.
Partial answers/tool results stay inspectable after failure or interruption.

See E2E-Codex-Progress-Streaming for acceptance. Local E2E suites require explicit
user authorization; packaged verification remains the final runtime phase.
