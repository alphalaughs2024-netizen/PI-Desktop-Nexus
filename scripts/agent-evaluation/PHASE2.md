# Codex backend Phase 2 verification

Date: 2026-09-30
Status: Implemented opt-in; user acceptance pending
Engine: Codex npm 0.157.1
Models: xkiro deepseek/deepseek-v4.1-flash:free and OpenRouter
stealth/space-bunny-alpha; live catalog pricing verified zero for both

## Recorded live checks

| Check | Result | Private evidence |
|---|---|---|
| Native read / patch / read | Passed; note.txt changed from violet lantern to emerald lantern, three completed native tool items, one completed turn | %USERPROFILE%/.nexus-codex-phase2/native-check-1790771728517/report.json |
| Standalone image interpretation | Failed interpretation: actual solid red image was called purple/magenta. Image data was supplied to turn/start. Do not count this as successful vision recognition. | Same native report |
| Native restart / recovery | Passed: same native handle, turn/item IDs, terminal times and file contents; no assistant/tool events and no new prompt submitted | Same root/recovery-report.json |
| Electron main / sidecar / Codex / renderer | Passed: one durable application turn, completed command and assistant items, completed transcript persisted | %USERPROFILE%/.nexus-codex-phase2/app-turn-report.json |
| Provider credential isolation | Passed live: native command tested presence only and returned absent | Same Electron report |
| Electron image interpretation | Passed: model correctly identified the actual solid red attachment | Same Electron report |
| OpenRouter command/image/reasoning | Passed categorical red recognition and native command; one completed turn, 24.793 seconds | %USERPROFILE%/.nexus-codex-phase2/openrouter-turn-report.json |
| OpenRouter direct native patch | Not passed: model reported apply_patch unavailable and used shell invocation of the engine patch utility after failures; file verified, 147.122 seconds | %USERPROFILE%/.nexus-codex-phase2/openrouter-patch-report.json |
| OpenRouter custom-tool diagnostic | Engine request contains custom apply_patch; model's reported tool list omits it. Forced custom-tool request returns HTTP 400 invalid_prompt. Responses support does not establish native patch parity. | %USERPROFILE%/.nexus-codex-phase2/openrouter-tool-diagnostic.json |
| Selected thinking effort | Passed live: selected low was sent as reasoning.effort=low on the actual native Responses request | %USERPROFILE%/.nexus-codex-phase2/openrouter-effort-report.json |
| Existing transcript display | Passed: native command and final answer rendered in Nexus's existing layout | %USERPROFILE%/.nexus-codex-phase2/transcript.png |

Standalone model/tool trial took 35.803 seconds. The Electron trial took 81.689
seconds including setup and provider/tool waiting. These are different prompts
and single samples. They do not prove speed improvements or measure engine
versus provider overhead separately. The first image failure demonstrates model
interpretation variability, not a claim that every vision result is reliable.

The request launched pnpm dev:codex successfully with an explicitly supplied
existing compatible host binary. A fresh Cargo build first hit Windows PDB
LNK1318, then a separate debug-symbol-free build exhausted C: disk space.
No Rust source changed in Phase 2. Reusing the host proves GUI integration;
it does not prove a clean full build or packaged Windows parity.
Automatic approval review refused failed-cache removal; the cache was retained.
Chromium userData/sessionData are also isolated beneath profile/electron. The
test app logged a clean shutdown after its normal Quit confirmation, then
restarted with the selected-effort correction.

## Deterministic and compile checks

Targeted tests cover generation/sequence fencing, duplicate terminal events,
missing tool completion, nonzero native exits, raw patch validation errors,
connection/local-launch preparation cancellation, simultaneous admission,
per-turn thinking effort, malformed frame shape, split-chunk credential
redaction, the 120-second
deny timeout, stale approval responses, unexpected process exit, partial-output
recovery, cold disconnected snapshots, image input payloads, secret-free
recovery/config/argv, unsupported capabilities and version mismatch.

42 targeted runtime checks in seven files and 12 permission checks passed
(54 total). Shared/runtime builds and desktop typecheck passed. Local E2E
suites were not run. Theme CSS, composer geometry, icons and layout were not edited. Permission
cards preserve their presentation and disable only unsupported session grants
for native Codex requests.

## Manual acceptance

Use the opened fresh-profile Nexus window or launch from the request checkout:

~~~powershell
$env:PI_DESKTOP_HOST_BIN = "C:\jcode projects\PI-Desktop-Nexus\target\debug\pi-desktop-host-core.exe"
pnpm dev:codex
~~~

Test a new Temporary chat and a disposable project. Ask for native file work,
attach an image, interrupt a long request, and reload a chat. For mutation in
Ask mode, use Allow once; keep tests inside the disposable workspace. The fresh
profile has the authorized xkiro and OpenRouter Responses providers. Explicitly
select a verified free model; OpenRouter's provider default is a paid model and
was never used in these trials. Space Bunny has image input enabled. The original
OpenRouter patch limitation motivated ADR 0253. The compatibility probe completed
a direct native read/patch/read in 17.502 seconds with one translated patch,
three tool items and one completed turn. Private evidence is
%USERPROFILE%/.nexus-codex-phase2/native-openrouter-bridge-report.json. This is one
sample, not a speed benchmark. No old chat/profile was deleted or migrated.

## Integrated compatibility recheck

The source-integrated OpenRouter bridge passed direct native read/patch/read
in 15.314 seconds, with no shell-edit substitute, and preserved the original
provider identity in the snapshot. Explicit Full access passed a read of the
prepared sibling fixture in 6.717 seconds. Both had one completed terminal
outcome. Evidence: %USERPROFILE%/.nexus-codex-phase2/production-openrouter-report.json.
These are single workflow samples, not engine latency comparisons.

## User acceptance feedback

The user reports passes for themes, appearance, image vision and conversation
in the `sup` test chat. The transcript was inspected read-only. Steering failed
because it was explicitly unavailable in the initial adapter. Full access failed
because the controller rejected the mode; it now maps the explicit session
choice to native danger-full-access/never. Global defaults remain unchanged.
The user reports web-search success; Nexus has no visible search item for the
recorded attempt, so provider-side search observability remains unverified.
Cancel/reload acceptance is not yet confirmed.

Phase 3 owns the persistent timeline and whole-response timer UX. Phase 4 owns
browser/viewports/preview and complete coding-service parity. Plan/Goal,
regenerate, steering and legacy plugin tools are deliberately not claimed as
working in this Phase 2 adapter. Native reasoning is shown only if emitted.
Keep the default runtime unchanged until user acceptance.
