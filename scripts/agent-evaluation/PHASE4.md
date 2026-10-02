# Phase 4: Managed Coding Services

Date: 2026-10-03. Implementation and focused validation complete;
live user acceptance pending.

## Delivered

- Rust-owned ProcessStart/ProcessRead/ProcessStop, with session isolation,
  selected-shell permissions, process-tree ownership, bounded output and
  interrupted recovery without replay.
- Main PreviewServer start/status/stop/list with loopback HTTP readiness,
  occupied-port refusal and cancellation cleanup.
- Codex capability reporting, cancellation cleanup and built-in subagent
  catalogs. Custom tool restrictions remain authoritative.
- Session-owned Processes panel with real status/output, stop-one/stop-all,
  preview routing, inactive/hidden polling and retained stop errors.
- Native successful multi-file review evidence, correctly directed rename
  paths and delegate attribution, without fabricated rollback snapshots.
- Bounded, cancellation-aware Task-to-timeline binding across independent
  MCP and native notification channels. Real delegation exposed and verified
  the fix for CODEX_TOOL_ITEM_UNBOUND.
- Bounded Git inspection that preserves errors instead of inventing a clean
  workspace, with status-based file limits.

See [the service specification](../../docs/spec/03-runtime/23-managed-processes-and-previews.md)
and [ADR 0274](../../docs/adr/0274-session-owned-processes-and-previews.md) /
[ADR 0278](../../docs/adr/0278-phase4-process-inspection-and-native-review.md).

## Validation

- Rust focused managed tests: 6 passed, including host mode/shell/ownership gates.
- Main preview and local executor tests: 10 passed.
- Shared selected contracts/preset tests: 49 passed.
- Runtime selected config/bridge/delegation/preset tests: 51 passed.
- New controller cancellation test: 1 passed.
- Shared/runtime builds and desktop TypeScript check passed.
- Debug production Rust host build passed with existing unused-code warnings.
- Production runner smoke passed: real Node HTTP server, readiness and output,
  later-call inspection, occupied-port refusal, explicit stop, session stop and
  graceful host shutdown. Each termination released the server port.

Run the focused smoke from the repository root with a built host:

```powershell
node scripts/agent-evaluation/managed-services-smoke.mjs <absolute-host-binary>
```

The smoke uses a disposable temporary profile and no model/API calls. It leaves
its small profile directory available for diagnosis and always closes its host.

## Completion Validation

- Desktop native review, Git diff/worktree and preview tests: 28 passed.
- Runtime adapter/controller/delegation tests: 74 passed, including early Task
  arrival and cancellation before binding. The stale Plan-without-host test
  expectation now matches the explicit CODEX_HOST_REQUIRED contract.
- Extended Rust ownership test passes for direct user inspection and stop;
  foreign-session ids fail and observed stopped status is required.
- Shared/runtime builds, desktop TypeScript check and Electron production build
  pass. Existing build size and Rust unused-code warnings remain.
- Real Codex + Rust + Git fixture: native multi-file edit/review, foreground
  Node tests, preview readiness/later inspection, Chromium-rendered result,
  stale patch refusal with unchanged bytes, user stop/port release, and
  confirmed Git create/commit/merge/cleanup all pass.
- Real parent/child Codex fixture: exact alternate model route, declared tool
  grants, original host session/turn, attribution and report convergence pass.
- Actual React panel inspection with controlled IPC passes: four scenic themes,
  1120px/375px layout, keyboard focus, stop-one/all, retained stop errors,
  preview routing, native diff disclosure, chat-switch response retirement and
  inactive/hidden polling. No page errors or composer-area overlap.

Controlled Responses fixtures run locally without external model/API calls.
The panel fixture verifies components with mocked IPC; Rust ownership is
verified separately. Full repository E2E suites were not run; scenarios remain
opt-in. Evidence is written outside the checkout under the existing test root.

```powershell
node scripts/agent-evaluation/phase4-coding-workflow.mjs <new-evidence-directory> <absolute-host-binary>
node scripts/agent-evaluation/codex-configured-delegation.mjs <new-evidence-directory>
node scripts/agent-evaluation/phase4-panel-inspection.mjs <evidence-directory>
```

## Acceptance And Limits

The planned coding-service implementation is delivered. User testing with live
providers/workspaces remains before Phase 4 is accepted. Parent/delegate paths
remain scheduling guidance, not filesystem ACLs or a transactional native-edit
lock; independent managed worktrees are the concurrent mutation boundary.
Native evidence cannot offer host snapshot rollback. External browser profiles,
remote Git publishing and processes surviving app shutdown are outside scope.
