# Phase 3 Accepted Motion Implementation

Date: 2026-10-01. Implementation acceptance: pending user visual test.

Branch: `codex/nexus-phase3-motion-20261001`.
Worktree: `C:\wt\nexus-phase3-motion-20261001`.
Base: `c596004cf`.

## Selection and Implementation

The user selected the Codex-style 2s status sweep, all seven activity icons,
and the combined specimen, explicitly choosing Motion-inspired disclosure.
The separate research preview was accepted as the direction; no proprietary
Codex or Kimi artwork is imported.

- Theme-derived stepped text sweep; no palette or material changes.
- Semantic existing Lucide shapes with adapted cursor, arc, brain, search,
  delegation, pause and one-time completion motion.
- A fixed icon box, wrapping status label and tabular whole-response duration.
- 180ms expansion/reverse collapse with a 150ms caret rotation.
- Immediately inert closing contents, released after the close; rapid reopen
  cancels release. Tool payloads and thinking Markdown stay lazy.
- Static historical completions and static terminal child activity.
- Static readable reduced-motion labels/icons and instant disclosure transitions.
- MIT adaptation notice referenced as a distributed renderer asset.

No engine, protocol, persistence, Context Vault, Prompt Inspector, composer,
sidebar, scenery or work-panel ownership changes are included.

## Validation

- Desktop TypeScript check passed, including the final terminal-activity guards.
- Targeted phase/icon, activity, thinking, transcript and scroll checks: 50 pass,
  one pre-existing transcript-style assertion fails on both this branch and
  unchanged primary `main`. It expects an obsolete assistant bubble selector.
- Style-token guard reports the same five pre-existing violations on both
  branches: scenic themes, scheduled surfaces and a settings radius. No new
  violation is introduced.
- Actual `ChatTranscript` components inspected in an isolated Vite fixture at
  1280x860 and 430x860. No provider/model calls or changes to actual chat state.
- Computed status animation: `2s steps(48) infinite activity-text-sweep`.
- Computed disclosure: `grid-template-rows 0.18s cubic-bezier(.2,.8,.2,1)`.
- Reverse collapse sampled at an intermediate height with contents still mounted
  and already inert; after settling, height and mounted detail count were zero.
- Rapid collapse/reopen retained a single expanded timeline.
- Command, search, reasoning, delegate, approval and completion states showed
  their corresponding motion. Output updates retained active motion.
- Historical completion loaded without any icon animation; its duration was 21s.
- Production reduced-motion rules applied by the isolated fixture: all inspected
  icon animations were `none`, disclosures had a `0s` transition, and labels
  retained readable text fill. This did not change the OS motion preference.
- Dark/light and all four scenic CSS themes had no horizontal overflow at 430px.
  Scenery images and native shell movement require the user's app test.
- Browser diagnostic errors/warnings: none.
- Screenshots saved outside the repository in the existing visualization folder:
  `nexus-motion-desktop.jpg`, `nexus-motion-narrow.jpg`,
  `nexus-motion-light-reduced.jpg`.

Local E2E suites and packaged validation were not run. The first native dev
launch stopped after initialization. A retry exposed Windows `VirtualAlloc`
error 1455 and esbuild out-of-memory during dependency optimization. The isolated
renderer was stopped before the final single-server launch. That launch succeeded
with command-local `GOMAXPROCS=2`: renderer at `http://localhost:5173/`, host-core
handshake confirmed, and agent sidecar configured against the existing test
profile. No temporary files were deleted to recover space.

## Acceptance

Inspect a real response with quiet waits, commands, supplied reasoning and
completion. Expand/collapse the timeline and nested details, including a rapid
reverse. Check familiar scenic materials, sidebar/work-panel movement, upward
scroll ownership and reduced motion. Verify the total timer never resets.

The request remains unmerged until this implementation receives visual acceptance.
After acceptance, merge locally and remove the verified request worktree/branch.
Nothing is pushed.
