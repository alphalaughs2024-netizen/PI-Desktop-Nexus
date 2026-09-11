# Nexus Skill System Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Resolve the seven audited skill-system isolation, safety, prompt-budget, mode, UI, and naming issues without adding a new workflow pack.

**Architecture:** Electron owns app-shipped skills and per-profile enablement; host-core owns user skill documents. The agent runtime bounds and renders metadata before a model sees it, while Electron only loads a body whose id was advertised to that session.

**Tech Stack:** TypeScript, Electron IPC, React, Rust host-core, Vitest, node:test.

**Spec:** `docs/superpowers/specs/2026-09-11-nexus-skill-system-hardening-design.md`

## Global Constraints

- No new Superpowers/default workflow skills are shipped.
- Global user skills live below the active Nexus data root; project skills remain portable `.agents/skills` documents.
- The catalog cap is 8,000 characters, deterministic, and source-prioritized.
- Skill loading is read-only in Agent, Plan, and Goal.
- No remote publishing or E2E execution is implied by this work.

---

### Task 1: Isolate skill and plugin profile state

**Files:**
- Modify: `apps/desktop/electron/main/index.ts`
- Modify: `crates/host-core/src/user_skills.rs`
- Test: `apps/desktop/test/nexus-data-isolation.test.mjs`
- Test: `crates/host-core/src/user_skills.rs`

- [ ] Add failing tests for the explicit Nexus plugin data root and global user-skill root.
- [ ] Make Electron resolve `dataDir` once before constructing `PluginRuntime` and pass it directly.
- [ ] Make `UserSkillRegistry` derive only its global skill directory from `data_dir/agents/skills`; leave project resolution unchanged.
- [ ] Run focused desktop and Rust tests.

### Task 2: Bound, classify, and safely load catalogs

**Files:**
- Modify: `packages/agent-runtime/src/plugin-skills.ts`
- Modify: `packages/agent-runtime/src/plugin-skills-prompt.ts`
- Modify: `packages/agent-runtime/src/runtime.ts`
- Modify: `apps/desktop/electron/main/index.ts`
- Test: `packages/agent-runtime/src/plugin-skills-prompt.test.ts`
- Test: `packages/agent-runtime/src/runtime.test.ts`

- [ ] Add failing catalog tests for source order, cap, and trust copy.
- [ ] Add `instructionCatalogWithinBudget` and apply it before prompt rendering and runtime matching.
- [ ] Record each session's advertised ids and reject non-advertised loads.
- [ ] Wrap loaded text with an invariant that it cannot grant authority.
- [ ] Run focused runtime tests.

### Task 3: Make read-only Skill available in contract modes

**Files:**
- Modify: `packages/agent-runtime/src/runtime.ts`
- Modify: `apps/desktop/electron/main/agent-sidecar.ts`
- Test: `packages/agent-runtime/src/runtime.test.ts`
- Test: `apps/desktop/test/plugin-skills.test.mjs`

- [ ] Add a failing Plan/Goal composition test.
- [ ] Include `Skill` for every mode with an advertised catalog.
- [ ] Keep Plan's local tool proxy denial for mutation/plugin tools while allowing `Skill`.
- [ ] Run focused runtime and desktop tests.

### Task 4: Expose bundled Nexus skills safely in Settings

**Files:**
- Modify: `apps/desktop/electron/main/builtin-skills.ts`
- Modify: `apps/desktop/electron/main/index.ts`
- Modify: `packages/shared/src/protocol.ts`
- Modify: `packages/shared/src/types.ts`
- Modify: `apps/desktop/src/lib/api.ts`
- Modify: `apps/desktop/src/components/settings/AgentSkillsPage.tsx`
- Test: `apps/desktop/test/agent-capability-settings.test.mjs`

- [ ] Add failing UI/IPC contract tests for a separate read-only bundled section.
- [ ] Rename catalog ids to the Nexus namespace while retaining legacy aliases only for load compatibility.
- [ ] Persist bundled-skill enablement under Nexus profile data and return metadata/body through local IPC.
- [ ] Add separate settings rows with inspect and enable controls only.
- [ ] Run focused desktop tests.

### Task 5: Synchronize delivery documentation and validate

**Files:**
- Modify: `docs/spec/03-runtime/01-ipc-protocol.md`
- Modify: `docs/spec/03-runtime/02-agent-runtime.md`
- Modify: `docs/spec/04-ux/06-settings-ia.md`
- Modify: `docs/spec/06-delivery/04-e2e-test-plan.md`
- Modify: `docs/spec/07-plugins/04-plugin-security.md`
- Create: `docs/adr/0220-nexus-skill-boundaries.md`

- [ ] Document ownership, catalog, mode, trust, and settings contracts.
- [ ] Add an E2E scenario for Nexus profile isolation and safe skill loading in all modes.
- [ ] Run focused Rust/runtime/desktop verification and inspect the final diff.
- [ ] Commit the logical changes, refresh from local main, merge, verify, and clean up without pushing.
