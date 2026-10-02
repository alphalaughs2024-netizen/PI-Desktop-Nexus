# ADR 0273: Floating Workflow Panel

- Date: 2026-10-02
- Status: User-approved direction; visual acceptance pending
- Scope: Renderer workflow presentation and local panel position

## Decision

Replace the permanent full-width workflow banner with a collapsed floating
glass pill, initially at the top right below the conversation title band.
The 48px closed bar has 24px end radii, a fluid ribbon, two-line name/reason
copy, and pill-shaped hover controls; expanded
details retain a compact rounded panel.
Click reveals compact details; hovering affects light only. Outside click, Escape,
and focus leaving collapse the panel. Inspect, session-level dismissal, and
navigation to Workflows retain their existing host contracts.

The user requested a draggable panel and the same glass look in all four
scenic themes. Pointer capture and keyboard positioning move the panel within
the conversation. Persist only normalized x/y fractions under the renderer
preference `pi.desktop.workflowWidgetPosition`. This contains no session,
workflow, project, or prompt data and never alters host-owned activation.
Unavailable storage defaults to the top right. Container and widget size
observation keep the panel reachable when its contents or the window resize.

Adapt the user's clear-glass reference with low-opacity theme fills, a fixed
3px closed/9px expanded backdrop blur, paired sharp inset reflections, a fine
inner contour, and a soft lower shadow. Dark scenic themes use lightly
tinted navy glass; Alpine uses pale glass. A separate pointer-transparent SVG
owns diagonal caustics and diffuse light spill outside the surface's clipping
boundary. Hover/focus adds a 5s orbiting bloom; reduced motion keeps it still.
Small external light particles and two diffuse diagonal spill fields illuminate
the wallpaper around the pill. Hover/focus drifts the particles using transforms
and opacity only; idle particles remain stationary. Reduced transparency hides
these decorative layers, and reduced motion disables their drift. The user
requested this spill instead of a border-only glow and click-only expansion.
The user selected an original blue-violet fluid ribbon after comparing three
procedural SVG cores, then requested stronger bloom and visual depth.

Observe the displayed session's engine progress and terminal results directly,
without changing host-owned operations. Workflow activation is not execution
activity. Quiet waits stay still, actual reasoning/execution animate, completion
settles once, and error stays stationary. New runs ignore stale terminal or
reasoning snapshots. All core motion uses transforms/opacity with fixed blur;
the SVG light-spill orbit uses a bounded dash-offset animation. No new package,
downloaded visual asset, host channel, or global status projection is introduced.
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
That untinted rim treatment was superseded by the selected fluid-ribbon/glass
revision above. Its validation is recorded separately when complete.

The selected ribbon revision passed 13 focused state/position/regression checks,
the changed scenic-theme source check, desktop typecheck, and the Electron build.
Rendered checks used the actual component with a mocked host/store: four scenic
themes at 1280x800 and a 375px narrow viewport. The closed pill is 352x48;
the default expanded panel is about 352x187, with intermediate expansion frames.
Pixel comparisons confirmed moving reasoning/tool states and stationary waits,
settled success, and error. Session isolation, composer clearance and draft,
Inspect, hover, dragging, keyboard focus/Escape, inert contents, reduced motion,
dismissal rejection/success, long titles, and Settings passed without page errors.
These fixture checks do not replace native-app testing or user visual acceptance.

The clear-glass follow-up passed the same rendered scenarios in all four themes,
including click-only disclosure, open state retained on pointer leave, particle
transform changes on hover, reduced-motion particle suppression, and the
expanded reduced-transparency fallback. The inner glass and document have no
horizontal overflow; intentional external light is excluded from content-width
assertions. No page errors were reported. Focused tests and desktop typecheck
passed; the trial remains unmerged for the user's next visual test.
