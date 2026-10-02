# ADR 0273: Floating Workflow Panel

- Date: 2026-10-02
- Status: User-approved direction; visual acceptance pending
- Scope: Renderer workflow presentation and local panel position

## Decision

Replace the permanent full-width workflow banner with a collapsed floating
glass pill, initially at the top right below the conversation title band.
The 38px closed bar has 19px end radii and pill-shaped hover controls; expanded
details retain a compact rounded panel.
Hover reveals compact details; clicking pins them open. Outside click, Escape,
and focus leaving collapse the panel. Inspect, session-level dismissal, and
navigation to Workflows retain their existing host contracts.

The user requested a draggable panel and the same glass look in all four
scenic themes. Pointer capture and keyboard positioning move the panel within
the conversation. Persist only normalized x/y fractions under the renderer
preference `pi.desktop.workflowWidgetPosition`. This contains no session,
workflow, project, or prompt data and never alters host-owned activation.
Unavailable storage defaults to the top right. Container and widget size
observation keep the panel reachable when its contents or the window resize.

Use one transparent, untinted surface with an 8px backdrop blur, a subtle edge,
and no colored fill or sheen so the scenery retains its brightness. A masked
accent rim glows at the upper-left and lower-right diagonals, without filling
the capsule or changing its geometry. Hover/focus adds a 2.8s orbiting rim
highlight with a short fade; reduced motion keeps that highlight stationary.
Use a smooth reversible disclosure, theme-aware
text and controls, reduced-motion/reduced-transparency support, and localized
errors. Hidden contents are inert; Escape restores disclosure focus. Ignore
late status/inspection/dismissal responses from a previously selected session.

This supersedes ADR 0228's in-content workflow-strip presentation only. No
native surface, storage schema, host API, or permission change is introduced.
The request remains on its isolated branch until the user tests the visual
result and approves merging.

## Verification

Targeted position tests cover bounds, resizing, malformed preferences, and
blocked storage. Existing workflow, theme, and regression contracts are updated
for the floating surface. Typecheck/build and rendered component checks cover
the four scenic themes, disclosure, dragging, keyboard controls, and dismissal.
Full local E2E suites are not run for this request.

The focused workflow/position/regression suites passed 33 checks, and four
additional changed theme/source checks passed. Desktop typecheck, locale build,
and Electron main/preload/renderer build passed. The rendered component was
checked in all four scenic themes at 1280x800 and at a 375px narrow width:
the closed strip was 300x38 and the default open panel about 300x145, with
intermediate animation frames and no horizontal overflow or browser errors.
Hover, Escape/focus, inert contents, inspection, pointer drag, reload, resize,
keyboard movement/reset, dismissal failure/success, long titles, Settings,
and reduced motion passed. Two broader source-pattern checks failed identically
on unchanged main (builtin subagent rows and the Context Vault theme selector).
Visual acceptance by the user remains pending.
The untinted revision passed the four-theme rendered checks and build. The
hover rim's computed angle advanced during the loop, faded out on leave, and
reported no animation under reduced motion.
