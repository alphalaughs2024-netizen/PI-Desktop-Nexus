# ADR 0274: Session-owned background processes and preview servers

- Status: Implemented; manual acceptance pending
- Date: 2026-10-02
- Related: ADR 0252, ADR 0255, ADR 0259, ADR 0263

## Decision

Codex response history is sealed at completion. Reuse the Rust host's existing
shell/permission/hidden-runner/process-group/Windows Job boundaries for an
independent, session-owned process registry. ProcessStart admits background
commands under shell policy. ProcessRead inspects bounded logs and actual exits.
ProcessStop terminates an exact owned tree, never an arbitrary OS PID.
Inspection is Plan/Goal-safe; launch/stop are Agent-only. Stopping previously
authorized work is low risk. Late observations do not rewrite sealed responses.

Admission allows eight live processes globally, four per chat and 128 records.
Logs retain a 96KB tail with cursors and loss markers. Waits cap at 30 seconds
without stopping work. Rust atomically saves lifecycle metadata in private
managed-processes.json. Logs are process-local; unfinished recovered records
become interrupted with unknown exit. No process adoption or replay occurs.
Admission storage failure fails closed; launch-state storage failure stops its
owned process. Delete, rebinding, user Stop and shutdown stop chat-owned work.
Response completion and model/adapter replacement preserve it. The existing
runner contains abrupt host loss; normal shutdown drains the registry.

Main PreviewServer composes the typed host operations with bounded loopback HTTP
readiness. Original turn, shell and delegate permission scope reach Rust.
Occupied-port preflight and registry authority reservation prevent unrelated
server adoption and concurrent duplicate starts. localhost becomes 127.0.0.1;
credentials/fragments/external URLs are rejected and redirects are not followed.
2xx/3xx with a live owned command means reachability, not correct content or
exclusive ownership of the listener. Existing browser tools verify the page.
Timeout preserves the handle; cancellation during startup stops admitted work.
The outer deadline includes approval, readiness and transport slack.

Fixer/UI designer receive preview/process tools; test runner receives process
tools; explorer/reviewer receive inspection. Custom catalogs remain exact.
Delegates share the parent chat registry and can leave an intentional preview
after completion. TaskStop remains a worker stop; user Stop closes chat-owned
processes. managedPreview requires a complete, permitted service catalog.

## Limits And Validation

This is Phase 4's first implementation. It does not adopt native exec handles,
keep processes alive after app exit, replay work, add process UI or establish
complete file-edit/Git/review/build parity. Focused Rust/Main/runtime tests cover
lifecycle, containment, permission, logs, recovery, readiness and cancellation.
Full local E2E suites remain opt-in; manual app acceptance is pending.
