# Nexus Energy Pill Study

- Date: 2026-10-02
- Status: Fluid ribbon selected; application trial implementation underway
- Branch: `codex/energy-pill-20261002`

## Existing architecture

The desktop renderer uses React 19, Zustand 5, Lucide, semantic CSS tokens, and
native CSS/SVG animation. There is no installed general animation library.
`ActiveWorkflowCard` owns workflow inspection, dismissal, keyboard disclosure,
dragging, and renderer-local position preferences. Its existing height/fade
disclosure can be reused without replacing agent-operation logic.

The store exposes session-keyed `agentStatuses` and `runningSessions`.
`AgentStatus.execution.turn` contains the engine's phase, progress phase,
outcome, and timing metadata. These are more accurate than the workflow's
`primary.stage`, which describes workflow activation rather than live execution.
`sessionOutcomes` is an unread-notification projection and is therefore not
appropriate as the sole source of persistent core state.

## Visual references

- User-supplied Nexus capsule reference: compact glass shape, diagonal light,
  restrained depth. The core should be fluid rather than metallic.
- FreeFrontend, Liquid Glass Lens Button in CSS SVG:
  <https://freefrontend.com/css-liquid-glass/#2026-09-16-liquid-glass-lens-button-in-css-svg-l>
  Inspected its example and description of opposing inset highlights and
  blurred rim glare. Used as visual inspiration only; no code or assets copied.

## Proposed assets

The separate comparison presents three original, procedural SVG cores:
fluid ribbon, flowing energy ring, and folded plasma. All use layered vector
strokes, blue-violet gradients, a small fixed blur for luminous spill, and
transform/opacity animation. Existing scenic images supply all four wallpapers.
No downloaded asset or additional dependency is required.

The capsule preview uses light-spill layers outside the glass surface. These
must not be clipped by the surface's overflow or scroll ownership. Its static
diagonal caustics remain separate from the small hover/focus orbit. Backdrop
and bloom blur strengths remain fixed during animation. Expanded guidance
retains its own bounded scroll area.

## Proposed live state mapping

| Reported state | Core behavior |
| --- | --- |
| No running turn | Idle, stationary luminous ribbon |
| Reported reasoning | Slow organic deformation |
| Tool, answering, running subagents, compaction | Distinct flowing movement |
| Preparing, waiting for model, approval/input, retry delay | Stationary core with the actual waiting label |
| Completed outcome | One short settling transition, then stationary success |
| Failed outcome | Stationary error treatment and readable error label |
| Interrupted or unavailable | Idle motion with the actual terminal/availability label |

The preview's state picker is simulated. Production must subscribe to the
specific displayed session and resolve those states from the real engine turn.
It must never infer reasoning from a network wait or animate the core just
because the workflow is active. Reduced motion disables continuous animation.

## Next gate

The user chose Fluid ribbon and requested stronger glow and glass depth. The
trial reuses session-keyed store selectors, the existing disclosure/drag/actions,
and native CSS/SVG. Normative component/E2E contracts describe the implemented
behavior. Validate session transitions, expanded/collapsed geometry, dragging,
keyboard focus, reduced motion, all four themes, and composer clearance.
Keep the result unmerged until visual testing is accepted.

## Hover border adaptation

The user selected Aceternity's Hover Border Gradient:
<https://ui.aceternity.com/components/hover-border-gradient>.
Nexus already uses TypeScript and Tailwind 4.3, with shared React controls in
`apps/desktop/src/components/ui.tsx` and styles in `src/styles/`. It does not
use shadcn's scaffold or the `@/` alias. No scaffold migration is needed.
The decorative component lives alongside existing controls under
`src/components/ui/HoverBorderGradient.tsx` and uses Nexus's `cx` helper.

The reference's directional pale gradient and blue hover highlight are adapted
with registered CSS percentage properties and opacity crossfades. A masked
center keeps the existing glass and controls intact; the reference's black
backing would hide the wallpaper. A fixed 2px blur supplies the border bloom.
There is no React interval, animated blur, or additional Motion dependency.
Keyboard focus receives the same highlight and reduced motion stops the sweep.
The decoration does not represent agent activity; the fluid ribbon remains
bound to real session state.

Validation: desktop TypeScript and the Electron build passed; 13 focused
workflow state, positioning, and regression checks passed. The broader scenic
suite had one existing Context Vault selector failure, reproduced unchanged
on the previous pill trial. No full E2E suite was run.

Playwright inspected the launched native application's built renderer. The
collapsed pill measured 352x47.6 CSS pixels and expanded to 352x186.6; hover and
keyboard focus paused the sweep and reached full blue-highlight opacity.
Escape restored the collapsed height. Four temporary scenic-theme projections
preserved geometry and their glass colors; a 900x720 viewport kept the control
inside the window. Reduced motion stopped the sweep and a temporarily projected
working-core visual state. The actual idle core remained stationary. Screenshots
were visually inspected and no page errors were observed. Temporary theme and
motion projections were restored before handing the running app to the user.
