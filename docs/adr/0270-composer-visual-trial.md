# ADR 0270: Composer Visual Trial

- Date: 2026-10-02
- Status: User-approved trial; adoption and merge pending visual acceptance
- Scope: Composer presentation only

## Decision

Preserve the existing width, rounded shell, themes, model names and actions.
Reduce the idle input from three reserved lines to two, align toolbar controls
at 32px, and separate attachment/mode/permission, model/reasoning, and
context/voice/enhancement/submission into three groups. Narrow layouts wrap
the left group above the remaining controls. Multiline growth, keyboard input,
file chips, permissions and model selection retain their existing behavior.

This trial amends D297's composer-only no-stroke rule with an inset hairline
using semantic theme ink. Focus strengthens this line without changing bounds
or moving controls. Scenic materials, shadow and transparency fallbacks remain
owned by their existing theme styles; the old solid scenic focus rings are
removed. The floating browser composer retains its outer frame and compact
brain selector without an additional inner frame.

The English welcome placeholder becomes `Ask Nexus anything`. Context hints
and their existing fade remain available. Disabled Send is visually quiet;
enabled Send keeps the theme's existing treatment.

## Validation and Acceptance

Inspect the real Composer at desktop and narrow sizes across standard and
scenic themes, with empty/multiline drafts, focus, menus and reduced motion.
Run focused input/model/permission/send checks and the desktop typecheck/build.
Local E2E suites require a separate request. Leave this request committed in
its own worktree, unmerged and unpushed, for the user's comparison.

The 2026-10-02 renderer inspection passed all six themes at 1280px, 560px and
375px, control geometry, focus stability, seven-line scrolling, menu bounds,
reduced motion and the compact brain selector with no renderer exceptions.
Desktop typecheck and main/preload/renderer build passed. Focused regression
checks passed 55 of 58; the same three source-pattern assertions fail on the
unchanged main checkout (two attachment materialization assertions and one
slash-mode dispatch assertion). No full local E2E suite was run.
