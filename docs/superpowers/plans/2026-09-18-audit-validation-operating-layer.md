# Audit Validation Operating Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the evidence-backed audit increment that makes the packaged sidecar self-describing, tool validation recoverable, updater failures quieter, summon shortcuts diagnosable, and existing health diagnostics more useful without adding a parallel platform.

**Architecture:** Extend the existing package/build contract, runtime validation envelope, updater controller, shortcut application path, logger, and `app.health` RPC. All new fields are additive and privacy-safe. Raw logs remain available; incident summaries are bounded in memory and health remains read-only.

**Tech Stack:** TypeScript/React/Electron, Node test runner and Vitest, Rust host-core/RPC tests, Markdown specifications.

**Spec:** `docs/superpowers/specs/2026-09-18-audit-validation-operating-layer-design.md`

## Global Constraints

- Keep the release sidecar entrypoint at `Resources/agent-runtime/sidecar.js` and preserve ESM.
- Validation recovery is advisory; never silently execute a suggested alternate tool.
- Renderer-facing updater errors remain generic and must not expose feed URLs or raw exception text.
- Shortcut registration failures must not silently substitute another binding.
- Health and incident data must not include credentials, secrets, session text, arbitrary tool arguments, or private project content.
- Preserve existing filesystem containment, permission, browser, provider, and delegation boundaries.
- Update relevant `docs/spec/` behavior and `docs/spec/06-delivery/04-e2e-test-plan.md` scenarios.
- Use TDD: each production change starts with a failing focused test and ends with a clean logical commit.

---

### Task 1: Package an explicit ESM boundary for the agent sidecar

**Files:**
- Modify: `packages/agent-runtime/package.json`
- Modify: `apps/desktop/package.json`
- Modify: `apps/desktop/test/runtime-build-contract.test.mjs`
- Modify: `apps/desktop/test/packaging-footprint.test.mjs`
- Create/modify: clean-profile sidecar packaging test helper under `apps/desktop/test/`
- Modify: `docs/spec/03-runtime/07-process-model.md`
- Modify: `docs/spec/06-delivery/06-release-runbook.md`
- Modify: `docs/spec/06-delivery/04-e2e-test-plan.md`

**Interfaces:**
- Produces `dist-bundle/package.json` with `{ "type": "module" }` beside `sidecar.js`.
- Electron-builder copies both files to `Resources/agent-runtime/`.

**Steps:**

- [ ] Add a failing packaging assertion that the bundle output and extra-resource contract include the module-boundary file.
- [ ] Add a clean-profile execution test that copies only the packaged sidecar files into a temporary directory and starts it with `ELECTRON_RUN_AS_NODE=1`.
- [ ] Run the focused tests and confirm they fail before implementation.
- [ ] Generate the boundary file during the runtime bundle command and include it in packaging.
- [ ] Run focused runtime-build, packaging-footprint, and clean-profile tests.
- [ ] Update the process/release/E2E specs with the packaged ESM invariant.
- [ ] Commit `fix(packaging): ship the agent sidecar module boundary`.

### Task 2: Add structured recovery metadata to model-facing tool validation

**Files:**
- Modify: `packages/agent-runtime/src/runtime.ts`
- Modify: `packages/agent-runtime/src/runtime.test.ts`
- Modify: `crates/host-core/src/tools/mod.rs` only if the shared result envelope needs an additive field
- Modify: `docs/spec/03-runtime/03-tools-and-permissions.md`
- Modify: `docs/spec/03-runtime/08-error-codes.md`
- Modify: `docs/spec/06-delivery/04-e2e-test-plan.md`

**Interfaces:**
- `INVALID_ARGUMENT` validation failures expose `details.kind = "tool-validation"`, `tool`, `purpose`, `missing`, `example`, and optional `suggestedTool`.
- Existing `errorCode`, message, and fail-closed behavior remain intact.

**Steps:**

- [ ] Add Vitest cases for missing `Glob.pattern`, `Grep.pattern`, `Read.path`, and `Bash.command`; assert the safe metadata and absence of arbitrary arguments.
- [ ] Run the cases and confirm the old errors lack the expected metadata.
- [ ] Implement a small static recovery descriptor map and attach it from `requireAliasedParams`/timeout validation.
- [ ] Ensure aliases are normalized before metadata is computed and no alternate tool is invoked.
- [ ] Run the targeted runtime suite and relevant host tool tests.
- [ ] Update tool/error/E2E specifications.
- [ ] Commit `feat(runtime): add tool validation recovery hints`.

### Task 3: Classify and de-duplicate updater failures

**Files:**
- Modify: `apps/desktop/electron/main/updater.ts`
- Modify: `apps/desktop/test/auto-update.test.mjs`
- Modify: `apps/desktop/test/update-timeout.test.mjs` if needed
- Modify: `packages/shared/src/types.ts` only for additive optional diagnostic fields
- Modify: `docs/spec/06-delivery/06-release-runbook.md`
- Modify: `docs/spec/06-delivery/04-e2e-test-plan.md`

**Interfaces:**
- Internal classifier returns `feed-unavailable`, `network`, `configuration`, or `timeout`.
- `UpdateState` remains renderer-safe; optional classification is diagnostic-only and never contains raw URLs/errors.

**Steps:**

- [ ] Add tests for unchanged automatic failures being logged/pushed once, manual failures remaining visible, and timeout state recovery.
- [ ] Run focused updater tests and confirm the de-duplication assertions fail.
- [ ] Implement classification from stable error codes/messages, a last-automatic-failure key, and state emission suppression only for unchanged automatic failures.
- [ ] Preserve manual generic error text and existing mode/timeout behavior.
- [ ] Run updater and desktop focused tests.
- [ ] Update release/E2E documentation.
- [ ] Commit `fix(updater): classify and suppress repeated automatic failures`.

### Task 4: Expose summon shortcut registration state and recovery UX

**Files:**
- Modify: `packages/shared/src/protocol.ts`
- Modify: `packages/shared/src/types.ts`
- Modify: `apps/desktop/electron/main/index.ts`
- Modify: `apps/desktop/src/lib/api.ts`
- Modify: `apps/desktop/src/components/settings/KeyboardShortcutsSection.tsx`
- Modify: `apps/desktop/test/settings-keyboard-shortcuts.test.mjs`
- Modify: `packages/i18n/src/locales/en/index.ts`
- Modify: `packages/i18n/src/locales/zh-CN/index.ts`
- Modify: relevant settings styles if needed
- Modify: `docs/spec/03-runtime/07-process-model.md`
- Modify: `docs/spec/06-delivery/04-e2e-test-plan.md`

**Interfaces:**
- Add a read-only `summonShortcutStatus` IPC query/event with the optional status shape in the design spec.
- Main updates status on registration/unregistration and de-duplicates identical failure logs.
- Settings renders a concise status and actions using the existing recorder/reset/disable controls.

**Steps:**

- [ ] Add source-contract tests for the status type/channel, main transitions, and recovery copy/actions.
- [ ] Run the focused settings test and confirm it fails.
- [ ] Implement status state and IPC bridge, preserving existing shortcut registration behavior.
- [ ] Add localized concise status/recovery labels; avoid explanatory filler.
- [ ] Run focused settings tests and typecheck the desktop renderer/main code.
- [ ] Update process/E2E specs.
- [ ] Commit `feat(settings): surface summon shortcut registration state`.

### Task 5: Extend app health with bounded incident summaries and workspace/updater state

**Files:**
- Modify: `apps/desktop/electron/main/logger.ts`
- Modify: `apps/desktop/electron/main/updater.ts` (read-only snapshot accessor)
- Modify: `apps/desktop/electron/main/index.ts`
- Modify: `crates/host-core/src/rpc/mod.rs`
- Modify: `packages/shared/src/types.ts`
- Add/modify: logger/health tests under `apps/desktop/test/`
- Add/modify: host RPC health tests under `crates/host-core/src/`
- Modify: `docs/spec/03-runtime/09-logging-and-observability.md`
- Modify: `docs/spec/03-runtime/06-host-rpc-protocol.md`
- Modify: `docs/spec/06-delivery/04-e2e-test-plan.md`

**Interfaces:**
- `Logger` records a bounded normalized incident index keyed by stable code/fingerprint.
- `app.health` keeps existing fields and adds optional `runtime`, `workspace`, and `incidents` fields with no sensitive payloads.

**Steps:**

- [ ] Add tests for fingerprint/count/first-last timestamps, capacity/expiry, and redaction of secret-like values.
- [ ] Add health contract tests for optional fields and backward-compatible required fields.
- [ ] Run focused tests and confirm the new assertions fail.
- [ ] Implement the minimal incident index and safe snapshots; integrate updater and summon status without creating another health service.
- [ ] Extend host health response with workspace mode/capability counts where host-owned data is authoritative.
- [ ] Run desktop and host focused suites.
- [ ] Update logging/RPC/E2E specs.
- [ ] Commit `feat(diagnostics): extend health with safe incident summaries`.

### Task 6: Cross-cutting validation and integration

**Files:**
- Modify any affected spec/test files only.

**Steps:**

- [ ] Run all focused Node tests for packaging, updater, shortcuts, diagnostics, and runtime validation.
- [ ] Run relevant Rust host-core tests, including the platform-neutral shell spill fixture if it is touched.
- [ ] Run desktop typecheck/build checks that do not invoke known unrelated VitePress dead-link failures.
- [ ] Review the complete diff for privacy, scope, and spec synchronization.
- [ ] Commit any strictly necessary test/doc-only correction as its own logical commit.
- [ ] Refresh the branch against the latest local `main` before integration.
