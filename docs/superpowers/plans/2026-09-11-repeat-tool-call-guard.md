# Repeat Tool-Call Guard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop a prompt when its agent attempts four consecutive identical tool calls, without blocking legitimate changed-argument or interrupted-call workflows.

**Architecture:** `AgentRuntime` owns a per-prompt in-memory fingerprint streak. Tool execution checks the next fingerprint before dispatching to host-core; on the fourth call it records a structured termination reason and returns a normal tool error with `terminate: true`. Existing `afterToolCall` bookkeeping propagates the result to delegates and converts the pending reason into one visible terminal error row.

**Tech Stack:** TypeScript, pi-agent-core, Vitest, shared error registry, Markdown specs/ADRs.

**Spec:** Approved in-chat design for GitHub issue #179.

## Global Constraints

- The guard is Nexus runtime state only: no database, IPC, profile, or installed-app change.
- It applies per prompt and agent runtime; four consecutive canonical-equivalent calls terminate.
- Tool output, secrets, and full argument payloads must not be retained; keep a bounded hash/fingerprint only.
- Existing three-failed-mutation recovery remains unchanged.
- Update runtime/error/E2E specifications and add an ADR.

---

### Task 1: Runtime repeat-call tracker and regression tests

**Files:**
- Modify: `packages/agent-runtime/src/runtime.ts`
- Modify: `packages/agent-runtime/src/runtime.test.ts`

**Interfaces:**
- Produces: a per-prompt tracker that returns a terminating `TOOL_REPEAT_LIMIT_EXCEEDED` result on the fourth identical consecutive call.
- Consumes: tool name, normalized parameters, and the existing `terminatingToolCalls`/`afterToolCall` flow.

- [ ] **Step 1: Write failing runtime tests**

Add tests that invoke the real registered `Read` tool and assert that the host is called three times, the fourth call terminates with `TOOL_REPEAT_LIMIT_EXCEEDED`, reordered object keys remain equivalent, changing an argument resets the streak, and a new prompt clears the streak.

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `pnpm --filter @pi-desktop/agent-runtime test -- runtime.test.ts -t "repeat tool"`

Expected: FAIL because no repeat-call termination exists.

- [ ] **Step 3: Implement the minimal tracker and terminal row plumbing**

Add stable, secret-free fingerprinting; check it before host execution; record a structured pending termination; preserve the existing mutation guard and delegate outcome behavior.

- [ ] **Step 4: Run focused tests to verify they pass**

Run: `pnpm --filter @pi-desktop/agent-runtime test -- runtime.test.ts -t "repeat tool"`

Expected: PASS.

### Task 2: Public error contract and documentation

**Files:**
- Modify: `packages/shared/src/errors.ts`
- Create: `docs/adr/0219-repeat-tool-call-guard.md`
- Modify: `docs/spec/03-runtime/02-agent-runtime.md`
- Modify: `docs/spec/03-runtime/03-tools-and-permissions.md`
- Modify: `docs/spec/03-runtime/08-error-codes.md`
- Modify: `docs/spec/06-delivery/04-e2e-test-plan.md`
- Modify: `docs/spec/08-meta/decisions-log.md`

**Interfaces:**
- Produces: `TOOL_REPEAT_LIMIT_EXCEEDED`, retriable with only tool name and repeat count in its visible details.

- [ ] **Step 1: Add the shared error code and documentation**

Describe the four-call boundary, reset semantics, retained transcript evidence, and exclusion of internal lifecycle calls.

- [ ] **Step 2: Run type checks and documentation checks**

Run: `pnpm --filter @pi-desktop/shared typecheck && pnpm --filter @pi-desktop/agent-runtime typecheck`

Expected: PASS.

### Task 3: Regression validation and delivery

**Files:**
- Verify only.

- [ ] **Step 1: Run full targeted runtime suite**

Run: `pnpm --filter @pi-desktop/agent-runtime test`

- [ ] **Step 2: Run diff and type validation**

Run: `pnpm --filter @pi-desktop/shared typecheck && pnpm --filter @pi-desktop/agent-runtime typecheck && git diff --check`

- [ ] **Step 3: Commit, refresh, merge into local main, and clean up**

Use logical conventional commits, update the branch against local `main`, merge only after all checks pass, then remove this worktree and branch. Do not push.
