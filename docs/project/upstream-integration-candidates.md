# Upstream Pi Desktop integration candidates

Last audited: 2026-09-12

This is a decision list for the Nexus fork. Upstream is configured as the
`origin` remote (`vastsa/PI-Desktop`); Nexus is the local `main` branch and is
published through the `fork` remote. The audit was read-only: no upstream
commit has been merged by this document.

## Current divergence

- Nexus-only commits: 73
- Upstream-only commits at the time of audit: 230
- Do not use GitHub's **Sync fork** action. Review and port changes into an
  isolated Nexus branch instead.

## Recommended first batch

These are the highest-value, lowest-disruption candidates. Each still needs a
Nexus-specific cherry-pick audit, conflict review, and targeted tests.

- [ ] `8fb56219` — POSIX separators in workspace-relative tool paths
- [ ] `dce32628` — workspace-relative tool labels on Windows
- [ ] `8245c29e` — align Windows path test expectations
- [ ] `58a370d1` — rustfmt Windows path handling
- [ ] `954413a7` — exit Windows host-core after stdin ends
- [ ] `54b39928` — reposition context inspector after pane geometry changes
- [ ] `ecb6b9f1` — linkify Unicode filenames without linking outside paths
- [ ] `c9369c05` — resume queued prompts after turn finalization
- [ ] `324c6588` — keep context recoverable after failed compaction
- [ ] `f9003ff5` — preserve carried summary when fallback notices are stripped
- [ ] `eafe2763` — restore on-demand tool activations still in context
- [ ] `c1d70e2a` — retain omitted TaskWait reports
- [ ] `a2bd5538` — deliver delegate reports settled before the parent idled
- [ ] `cece3244` — stop OpenAI Responses streams after terminal events
- [ ] `c92f1baf` — dismiss tooltips after an action click
- [ ] `d8592841` — show vendor account aliases in the model menu
- [ ] `7c4154bb` — decode Windows curl diagnostics for plugins
- [ ] `ffbe3264` — sample oversized Codex archives during import scans
- [ ] `fee21f93` — preserve sampled Codex metadata for oversized lines
- [ ] `2d1d6943` — restore archived projects after session import

## Useful candidates requiring adaptation

These address real problems, but overlap with Nexus-specific architecture or
the Twilight/work-panel repairs. Do not cherry-pick blindly.

### Work panel and shell layout

- [ ] `78abc6f9` — keep browser menus inside the dock
- [ ] `32640895` — separated work-panel header control rail
- [ ] `8f1b65e2` — separate add and collapse controls
- [ ] `544ea66b` — prevent work-panel tab labels collapsing
- [ ] `74ddb229` — keep plugin body bounds under the add menu
- [ ] `f1b6916b` — float the resource menu
- [ ] `2303fd76` — end work-panel header drag before the control band
- [ ] `3ed22748` — preserve native views under context menus
- [ ] `365c4f3b` — keep native views visible while resizing
- [ ] `99932a2f` — restore work-panel sizing behavior
- [ ] `73365bcf` — raise the work-panel collapse threshold
- [ ] `d9c966fc` — collapse the work panel after pane shrink

These are especially sensitive because Nexus now owns a fixed native control
band, Context Vault, and Twilight material selectors.

### Composer and dropdown geometry

- [ ] `c9dd6a38` — prevent narrow composer toolbar overlap
- [ ] `e95bb57f` — reserve chat width for composer controls
- [ ] `7179a9fb` — keep custom dropdowns out of layout flow

`7179a9fb` is a broad refactor across Composer, Settings, Plugins, Plans, and
capability controls. Port only after comparing each affected Nexus surface.

### Settings and visual polish

- [ ] `d08c59b1` — polish subagent editor form surfaces

Adapt its colors to Twilight and preserve Nexus’s workflow/settings package
boundaries.

## Optional product features

These may improve Nexus, but are product decisions rather than maintenance
fixes:

- [ ] `d54b3946` — project visual memory editor
- [ ] `95e36214` — project-owned memory context
- [ ] `df49eb87` — multi-folder project creation
- [ ] `377a23c6` — clone a Git project from the home switcher
- [ ] `4e1de435` — drag sessions/folders across projects
- [ ] `7faf7c1a` — move an idle session to another project
- [ ] `8a248bc9` — reorder projects by dragging
- [ ] `5070a122` — preset chips for context-window and max-output settings
- [ ] `e8e36699` — ship the Skill tool in the Agent core set
- [ ] `8e838549` — expose active skills in the slash menu

Nexus already has a workflow-package and capability-aware skill system, so the
two Skill commits require an architecture comparison before adoption.

## Runtime and maintenance changes to review separately

- [ ] `42b07596` — GitHub Actions checkout 4 → 7
- [ ] `54aa3ef5` — pnpm/action-setup 4 → 6
- [ ] `ca0460dc` — download-artifact 4 → 8
- [ ] `27083c34` — setup-node 4 → 7
- [ ] `1a4bce4d` — softprops/action-gh-release 2 → 3
- [ ] `99eef311` — architecture and Rust quality gates
- [ ] `5f816c9c` — focused Biome checks
- [ ] `ceb24097` — enforce source-size budgets
- [ ] `b0f7baa0` — split shared public types by domain
- [ ] `e599ee14` — split desktop app/settings/plugin domains
- [ ] `702a3388` — split host-core storage/provider/plan/plugin domains
- [ ] `27409ef0` — compose store domain slices and runtimes

The refactors may be healthy upstream, but landing them as a batch would create
a large conflict surface. Evaluate them as a separate architecture project.

## Do not merge directly

- [ ] Full upstream merge or GitHub **Sync fork**
- [ ] Upstream branding and README/release changes that conflict with Nexus
- [ ] The upstream `AGENTS.md` rewrite; Nexus has fork-specific rules
- [ ] Documentation, formatting, or test-only commits without a selected
      runtime change
- [ ] Unreviewed refactors that replace Nexus’s workflow, plugin, Context Vault,
      or Twilight architecture

## Integration procedure when a batch is approved

1. Fetch `origin` and confirm the exact commit range.
2. Create a dedicated `codex/` branch and worktree from current Nexus `main`.
3. Audit each selected commit's files and its parent assumptions.
4. Cherry-pick or port one logical change at a time; preserve Nexus behavior
   where the two products intentionally diverge.
5. Run targeted tests, typecheck, style checks, and relevant Windows/runtime
   validation.
6. Refresh against local `main`, merge locally, verify the merged result, and
   remove the request worktree and branch.
7. Push only after explicit approval for that integration batch.

