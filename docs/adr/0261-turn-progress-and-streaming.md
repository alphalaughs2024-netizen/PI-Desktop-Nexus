# ADR 0261: Whole-turn progress and bounded streaming

- Status: Implemented; manual acceptance pending
- Date: 2026-10-01
- Related: ADR 0252, ADR 0254, ADR 0256, ADR 0259

## Decision

The opt-in Codex runtime owns one progress timeline and acceptance timestamp per
host turn. Native segments, steering, commentary and tools do not restart it.
Electron supplies its prompt acceptance time before local preparation. Runtime
phase spans distinguish preparation, recovery, model waits, supplied reasoning,
answer text, tools, approvals, questions, retries, compaction and delegate waits.
No reasoning is synthesized for a quiet provider. Concurrent states use approval,
tool, answer and supplied-reasoning priority; phase spans are elapsed wall-clock
states, not additive CPU or provider billing measurements.

One empty assistant metadata record (`<turnId>:execution`) updates the renderer
during work and is appended through the host outbox at terminal completion.
It contains no model-visible text or thinking. Rust canonical metadata preserves
execution, turnId and steering without a database migration. Runtime snapshots
remain the recovery authority for unfinished work. The renderer reconstructs
display items after selecting a session without executing or replaying tools,
rejects stale generations/sequences and retains newer live output.

The response tail has one compact status disclosure with total elapsed time.
Tools, delegation topology and supplied reasoning appear in its timeline with
existing controls. Commentary, steering and final text remain in chronological
order. Completion freezes duration; interruption/failure retains partial work.
Historical messages without execution metadata retain their existing layout.
The elapsed label is distinct from model-stream throughput statistics.

The timeline retains its beginning and newest spans, at most 256; omitted spans
are counted. Details are bounded to 300 characters. Timers update locally once
per second, avoiding runtime events solely for ticking. Streaming snapshots use
an immediate leading update, frame coalescing and a 60ms fallback when animation
frames are suspended. Approvals, errors and terminal events flush pending output.
Memoized historical entries/fragments and existing scroll ownership are retained.

## Evidence and Limits

The official [Codex app-server documentation](https://developers.openai.com/codex/app-server/)
was fetched on 2026-10-01, including its Markdown representation. It documents
turn/item identities, agent-message/reasoning/command-output deltas, authoritative
item completion, turn interruption and snapshot reads. Its command sessions
provide process IDs, output deltas, stdin, resize and termination. This supports
using explicit events and handles rather than inferring progress from text.
An official-domain web-search attempt was blocked by Google's challenge page;
the relevant official page itself was retrieved successfully.

These sources do not document Codex Desktop's exact rendering cadence. Nexus's
bounded frame coalescing is a local implementation choice, informed also by the
read-only Paseo leading-edge/60ms coalescer reference in C:\Games. No external
icons or assets are imported. Native tools and process ownership are unchanged;
new coding services remain Phase 4. This change establishes no model-speed claim.

Targeted lifecycle, reconstruction, batching and Rust canonical roundtrip checks
cover the contract. Manual visual/long-response acceptance remains a phase gate.
Local E2E suites and packaged release acceptance are not part of this run.
