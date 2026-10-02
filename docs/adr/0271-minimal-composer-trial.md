# ADR 0271: Minimal Composer Trial

- Date: 2026-10-02
- Status: User-approved trial; visual acceptance and merge pending
- Scope: Composer presentation and action organization

## Decision

Amend ADR 0270's organized toolbar with two groups. Place `+` and combined
mode/permission on the left; context ring, text model/reasoning, dictation and
Send/Stop on the right. Keep permission visible and Full access identifiable.
Goal locks only permission choices, allowing mode changes from the same menu.

Put Add files, Voice mode, enhancement and available Undo in the keyboard
accessible `+` menu. Keep voice/dictation exclusion and all existing session,
planning, confirmation and draft operations. A compact context display omits
only its percentage text. SpeechControl retains its default voice button for
other consumers. The native floating composer retains its Brain selector.

Preserve rounded shells, existing widths, scenic materials, theme ink, two-line
idle input and seven-line draft growth. Below 540px container width the left
group occupies the first row and the right group the second.

## Validation

Inspect the actual Composer across themes and widths, keyboard/menu behavior,
mode selection, permissions, enhancement/Undo, reduced motion and native
composer contracts. Run focused regressions and desktop typecheck/build.
Full local E2E suites are not authorized. Keep this branch unmerged until the
user tests and accepts it; publishing requires separate authorization.

The actual-component inspection passed 18 theme/viewport combinations at
1280px, 560px and 375px, including menu bounds, mock file-picker routing,
enhancement/Undo, mode switching, Goal permissions, Full access cancellation,
focus stability, multiline scrolling, reduced motion and the compact model
selector. Screenshots were inspected; no renderer exceptions occurred.
Focused suites passed 73 of 76 checks. The three previously confirmed baseline
source-pattern failures concern attachment session materialization (two) and
slash-mode dispatch (one); none is introduced by this trial. Desktop typecheck
and main/preload/renderer build passed. Live voice and native file selection
remain for the user's app test.

The context-ring follow-up keeps the compact indicator visible beside the
model selector without reported usage, showing a neutral ring and an honest
pending label. Reported usage fills the ring according to used capacity;
tooltip and accessible text expose used percentage and tokens. Existing
noncompact inspectors retain their remaining-capacity presentation.
