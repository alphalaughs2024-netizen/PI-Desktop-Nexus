# Phase 4: Managed Coding Services

Date: 2026-10-02. First implementation; user acceptance pending.

## Delivered

- Rust-owned ProcessStart/ProcessRead/ProcessStop, with session isolation,
  selected-shell permissions, process-tree ownership, bounded output and
  interrupted recovery without replay.
- Main PreviewServer start/status/stop/list with loopback HTTP readiness,
  occupied-port refusal and cancellation cleanup.
- Codex capability reporting, cancellation cleanup and built-in subagent
  catalogs. Custom tool restrictions remain authoritative.

See [the service specification](../../docs/spec/03-runtime/23-managed-processes-and-previews.md)
and [ADR 0274](../../docs/adr/0274-session-owned-processes-and-previews.md).

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

The existing controller Plan-without-host test expects
CODEX_CAPABILITY_UNAVAILABLE but receives CODEX_HOST_REQUIRED. This failure was
reproduced on unchanged main and is outside this change. Full local E2E suites
were not run; their updated scenarios remain opt-in.

## Remaining

User validation of live website/build workflows, process inspection/cleanup UI
as needed, native edit/review coordination, and Git/worktree/build/test audits.
This report does not mark the whole Phase 4 complete.
