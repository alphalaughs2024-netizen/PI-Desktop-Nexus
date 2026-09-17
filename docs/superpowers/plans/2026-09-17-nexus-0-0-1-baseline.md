# Nexus 0.0.1 Baseline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish PI Desktop Nexus as an independent `0.0.1` product and publish its first Windows GitHub Release.

**Architecture:** Release metadata will be reset across package, Rust, and protocol surfaces. The in-app changelog will be reduced to one localized Nexus entry and public identity surfaces will point exclusively to the Nexus repository and Ryan. Technical specifications remain intact, while only obsolete upstream-tracking documents are removed.

**Tech Stack:** Node.js, pnpm, TypeScript, Cargo, Electron Builder, Git, GitHub CLI.

**Spec:** `docs/superpowers/specs/2026-09-17-nexus-independent-baseline-design.md`

## Global Constraints

- Use `0.0.1` across every version-bearing workspace package, Cargo, protocol, changelog, and README surface.
- Preserve all architecture, security, plugin, delivery, ADR, guide, privacy, and feature-tracking documentation.
- Keep the LGPL license and third-party notices unchanged.
- Never alter the existing upstream-local `v0.15.0` tag.
- Publish only to `alphalaughs2024-netizen/PI-Desktop-Nexus` after the exact source commit is tagged `v0.0.1`.

---

### Task 1: Reset Nexus identity and release history

**Files:**
- Modify: root/package/docs/apps/packages `package.json`, `Cargo.toml`, `Cargo.lock`, `packages/shared/src/protocol.ts`, `packages/shared/src/changelog*.ts`, `packages/shared/src/changelog.test.ts`, `README.md`, `README.zh-CN.md`, and Electron updater metadata selected by exact `vastsa`, `PI-Desktop-fork`, and `fork` reference searches.
- Delete: `docs/project/upstream-integration-candidates.md`, `docs/superpowers/plans/2026-09-17-release-0-15-0.md`.
- Test: `packages/shared/src/changelog.test.ts`, `scripts/check-release-docs.mjs`.

**Interfaces:**
- Consumes: `ChangelogEntry` catalogs and the existing version replacement behavior in `scripts/release.mjs`.
- Produces: `APP_VERSION === "0.0.1"`, a one-entry localized changelog, and Nexus-only release metadata.

- [ ] **Step 1: Establish the red release-surface checks**

Run: `node scripts/check-release-docs.mjs 0.0.1`

Expected: FAIL because version surfaces and changelogs still name `0.15.0`.

- [ ] **Step 2: Replace the release history and public identity**

Create a single `0.0.1` `ChangelogEntry` for all eight shipped locales with one matching highlight. Replace direct public upstream links and fork language with the Nexus repository and Ryan. Delete only the two obsolete tracker/plan files named above.

- [ ] **Step 3: Synchronize version-bearing metadata**

Run: `node scripts/release.mjs 0.0.1`

Expected: package, Cargo, protocol, and bundled catalog metadata update; the script reports a passing release-documentation preflight.

- [ ] **Step 4: Verify the localized release catalog**

Run: `pnpm --filter @pi-desktop/shared test -- --run src/changelog.test.ts && node scripts/check-release-docs.mjs 0.0.1 && git diff --check`

Expected: four changelog tests pass, the preflight reports `0.0.1 (0.0.x line)`, and `git diff --check` has no output.

- [ ] **Step 5: Commit the baseline**

Run: `git add -A && git commit -m "chore(release): establish Nexus 0.0.1 baseline"`

Expected: a single clean, reviewable baseline commit.

### Task 2: Package and publish the first Nexus release

**Files:**
- Generate: `apps/desktop/release/PI-Desktop-Nexus-Setup-0.0.1.exe`, `apps/desktop/release/PI-Desktop-Nexus-Portable-0.0.1.exe`.

**Interfaces:**
- Consumes: committed `0.0.1` version metadata and the `win.nsis` / `win.portable` Electron Builder targets.
- Produces: GitHub tag and release `v0.0.1` containing both verified Windows executables.

- [ ] **Step 1: Tag the exact release commit**

Run: `git tag v0.0.1`

Expected: `git rev-list -n 1 v0.0.1` equals the committed baseline SHA.

- [ ] **Step 2: Build fresh Windows artifacts**

Run: `pnpm install --frozen-lockfile && pnpm --filter @pi-desktop/desktop run dist:win`

Expected: Electron Builder exits zero and writes the setup and portable `0.0.1` EXEs.

- [ ] **Step 3: Verify release artifacts**

Run: `Get-FileHash apps/desktop/release/PI-Desktop-Nexus-Setup-0.0.1.exe,apps/desktop/release/PI-Desktop-Nexus-Portable-0.0.1.exe -Algorithm SHA256`

Expected: both files exist with non-empty SHA-256 hashes; record signing status separately.

- [ ] **Step 4: Merge, publish, and inspect the GitHub Release**

Run: `git push nexus main v0.0.1 && gh release create v0.0.1 --repo alphalaughs2024-netizen/PI-Desktop-Nexus --title "PI Desktop Nexus 0.0.1" --generate-notes apps/desktop/release/PI-Desktop-Nexus-Setup-0.0.1.exe apps/desktop/release/PI-Desktop-Nexus-Portable-0.0.1.exe && gh release view v0.0.1 --repo alphalaughs2024-netizen/PI-Desktop-Nexus`

Expected: the public release identifies `v0.0.1` and lists both Windows assets.
