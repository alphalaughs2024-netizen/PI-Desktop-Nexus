# Phase 3 Progress and Streaming Validation

Date: 2026-10-01. Manual acceptance: pending.

Branch: `codex/nexus-phase3-20261001`.
Worktree: `C:\wt\nexus-phase3-20261001`.
Base: `49cb4e5bb`.

## Implemented

- One expandable response status with a whole-turn clock and final duration.
- Truthful lifecycle phases, supplied reasoning, tools and worker topology.
- Stable identity and acceptance time through steering and native segments.
- Immediate leading stream delivery, frame batching and a 60ms fallback.
- Terminal/control flush, memoized prose fragments and existing scroll ownership.
- Durable execution metadata, turn IDs and steering in Rust canonical records.
- Snapshot display reconstruction that preserves newer output and settles old
  streaming records without replaying commands.

Existing themes, materials, shell layout, typography and icons are retained.
No external assets were imported or repositories cloned.

## Evidence

| Check | Result |
| --- | --- |
| Runtime contract, adapter and subagents | 71 targeted tests passed |
| Renderer grouping, batching and snapshot projection | 22 targeted tests passed |
| New execution locale keys/placeholders | 1 test passed across eight locales |
| Runtime build | Passed |
| Desktop TypeScript check | Passed |
| Rust release build | Passed |
| Rust thinking and execution metadata roundtrips | Passed |
| Diff whitespace check | Passed |
| Isolated renderer probe | Passed at 1280px and 430px |

The renderer probe uses the real transcript components and theme CSS in a
separate headless Chrome page. It makes no model calls and does not change the
running app's chat. Screenshots were inspected in dark desktop/narrow views and
light reduced-motion mode. It verified one status row, steering bubble geometry,
no timeline overflow, a frozen 21-second completed total, preserved upward scroll
position during twelve sustained updates, full final text and zero page errors.
Screenshots are local ignored evidence under `.cache/phase3/`.

The Codex development app was relaunched with the rebuilt host and the existing
isolated test profile. Host/sidecar startup and renderer loading succeeded.
Live responses in the first launch showed active and completed whole-turn labels;
user acceptance of the final build is still required.

## Research and Limits

The official [Codex app-server documentation](https://developers.openai.com/codex/app-server/)
was fetched, including its Markdown version. Turn/item lifecycle, supplied
reasoning and command deltas, authoritative completion and snapshot reads inform
the execution contract. The documentation does not establish Codex Desktop's
exact UI update cadence. The read-only Paseo coalescer in `C:\Games` informed the
local leading-update and bounded-batching choice. See ADR 0261.

Broader locale checks encountered existing missing Browser, Sidebar and Context
Vault keys. The targeted new execution catalog check passed; those unrelated
catalog gaps were not changed. No local E2E suite or packaged Windows workflow
was run. No provider latency improvement or model-speed claim is established.

## Manual Acceptance

1. Run a long request with commentary and tools. Expand the status row and inspect
   tools and supplied reasoning. Check that total time continues through waits.
2. Steer the request. Confirm the prompt remains visible and the clock does not
   restart.
3. Scroll upward while output arrives. Confirm the transcript stays at your
   reading position; returning to the bottom resumes follow.
4. Stop a response, switch chats and reload. Confirm partial output and the
   terminal duration remain available, with no duplicate tools.
5. Check a familiar scenic theme and sidebar/work-panel movement.

Merge and request-worktree cleanup follow acceptance. Nothing has been pushed.
