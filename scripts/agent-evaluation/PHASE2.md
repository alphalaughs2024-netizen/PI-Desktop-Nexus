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
recovery/config/argv, unsupported capabilities and version mismatch. Steering
checks cover native turn guards, duplicate IDs, uncertain acknowledgements,
completion ordering and cancellation while completion drains steering.

The earlier checkpoint passed 76 targeted checks. After the response-sampling
steering correction, 67 runtime checks in seven Codex files and 59 desktop
checks across steering, transcript hydration, composer queueing, permissions
and persistence passed (126 total). Shared/runtime builds and desktop typecheck passed. Local E2E
suites were not run. Theme CSS, composer geometry, icons and layout were not edited. Permission
cards preserve their presentation and disable only unsupported session grants
for native Codex requests.

## Manual acceptance

After freeing disk space or restarting, launch from the request checkout:

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

## Native text steering recheck

The integrated adapter passed a live free OpenRouter Space Bunny trial. During
an already-running 12-second native command, a text instruction changed the
requested final answer from ORIGINAL to EMERALD. The final answer was EMERALD;
one instruction was accepted and one terminal outcome was emitted. Both host
and native turn IDs, and the original start timestamp, were preserved. Recovery
retained the terminal snapshot and native handle without replay events. The
trial took 22.199 seconds, including command/model time; this is not a benchmark.
Evidence: %USERPROFILE%/.nexus-codex-phase2/native-steering-report.json.

Deterministic checks also verify an acknowledgement racing completion is
persisted before the terminal signal and that cancellation closes an unresolved
request without false completion. Steering currently accepts text only. The
running app must be quit normally and relaunched to load the updated sidecar;
the later user text-generation test failed: that command-boundary trial did not prove interruption during answer sampling.

## Composer-path steering and persistence

The user's first composer test produced ORIGINAL followed by EMERALD within one
native turn: native history records the correction after ORIGINAL was already
emitted. In the second test, the correction reached Codex during the command:
one exec_command, one native turn, and a final answer of EMERALD. This confirms
active-turn steering rather than a second turn or a restarted command.

Read-only review also exposed a host persistence gap: accepted steering events
were shown by the renderer but ignored by the assistant-only append path.
Electron now sends accepted native user-message events through the existing
durable outbox, scoped to the opt-in backend. A real existing-host trial with a
separate disposable profile, host shutdown/restart, and outbox replay preserved
one correction with the original message/turn identity. No model request was
needed. Evidence: %USERPROFILE%/.nexus-codex-phase2/steering-persistence-report.json.
The existing foreground app needs relaunch to load this persistence correction;
manual reopen verification of a newly steered instruction remains pending.

## User acceptance feedback

The user reports passes for themes, appearance, image vision and conversation
in the `sup` test chat. The transcript was inspected read-only. Steering failed
because it was explicitly unavailable in the initial adapter. Full access failed
because the controller rejected the mode; it now maps the explicit session
choice to native danger-full-access/never. Global defaults remain unchanged.
The user reports web-search success; Nexus has no visible search item for the
recorded attempt, so provider-side search observability remains unverified.
Canonical Nexus/native transcripts were inspected rather than SQLite index
text: tool index rows have null text by design, while command outputs remain
intact in canonical tool-call blocks. No persistence corruption is inferred
from those index rows.
Cancel/reload acceptance is not yet confirmed.

Phase 3 owns the persistent timeline and whole-response timer UX. Phase 4 owns
browser/viewports/preview and complete coding-service parity. Plan/Goal,
regenerate and legacy plugin tools are deliberately not claimed as
working in this Phase 2 adapter. Native reasoning is shown only if emitted.
Keep the default runtime unchanged until user acceptance.

## Actual response-sampling steering correction

The user rejected steering because the original answer kept generating and the
correction appeared only afterward. Pinned Codex 0.157.1 checks queued input
after the sampling request finishes (core/src/session/turn.rs). Paseo's local
adapter validates native boundary-steer acknowledgements; that path cannot
establish immediate sampling interruption. Nexus now interrupts sampling,
observes the native terminal, and starts a corrected segment on the same
thread under the original Nexus turn. Active native tools/approvals retain
boundary steering. This amends the earlier one-native-turn expectation.

| Check | Result | Private evidence |
|---|---|---|
| Real native stream with deterministic local Responses fixture | Old connection closed 33 ms after steering; old partial answer preserved; corrected EMERALD; one instruction, one host terminal, same host run/start time; recovery emitted no replay events | %USERPROFILE%/.nexus-codex-phase2/stream-segments-check/report.json |
| Free OpenRouter Space Bunny during actual answer text | Correction accepted in 131 ms; 132 characters of partial original text; no old deltas after acceptance; EMERALD; no tools; one host terminal | %USERPROFILE%/.nexus-codex-phase2/cloud-stream-report.json |
| Isolated live Electron renderer | Accepted instruction visible once live, after chat switch and after renderer reload; partial original and final EMERALD persisted; main app target explicitly selected after bootstrap | %USERPROFILE%/.nexus-codex-phase2/gui-steering-report.json |

The cloud pricing was rechecked as zero before that trial. These are single
samples, not engine/provider speed comparisons. The first GUI attempts targeted
the early hidden plugin picker or raced app bootstrap; those harness failures
were diagnosed and are not counted as passes. The final check waited for the
main window and completed bootstrap. Screenshots/history remain private.

Read-only review of the user's test profile found database-or-disk-full failures
and zero-byte temporary engine snapshots. The latest wait/stop steering rows
were already indexed and canonical; not every disappearing row was a missed
append. The renderer had an additional ownership bug: later queue cleanup could
retract an admitted optimistic row. That error no longer changes admission.
Host persistence and engine recovery remain separate owners; storage errors
now describe unconfirmed saving/reload recovery instead of promising retention.
Injected ENOSPC/EDQUOT/write/rename tests preserve the prior snapshot, remove
only the failed operation's own temporary file and allow later queued saves.
No existing user caches, profile data or trial evidence were deleted.

Manual acceptance remains pending. Ask for a long answer, steer after actual
text starts, confirm the old answer stops, then switch away/back and reload.
Repeat steering during a long command and cancel during generation. Do not
merge or advance to Phase 3 until the user accepts. Whole-response timer and
timeline rendering remain Phase 3 even though host turn/start identity is
stable here. No local E2E suite or packaged build was run for this correction.

## Windows console-window correction

The user confirmed that steering and disappearing instructions were fixed.
Their remaining acceptance issue was a console appearing on the first message
in a new chat. The installed 0.157.1 CLI shim starts its native child without
windowsHide even though Nexus hides the shim. Nexus now resolves and pins the
Windows native package and launches codex.exe directly through the hidden,
piped transport. No installed package was edited.

Targeted launch/transport checks passed (16 tests), including x64/arm64,
hoisted packages, missing binaries, mismatched versions and credential handling.
All seven Codex runtime test files passed (73 tests), the runtime TypeScript
build passed, and git diff --check was clean.
An isolated Electron-as-Node Windows smoke trial used a local Responses fixture:
initialize, real streamed output, sampling steering and cancellation passed;
one terminal outcome was recorded for the completed turn. Window monitoring
observed no new visible windows, and no owned processes remained after teardown.
Evidence: %USERPROFILE%/.nexus-codex-phase2/native-console-check-1790795347150/
(report.json and windows.json). No cloud requests were made. The first smoke
attempt asserted terminal-event count before asynchronous output flushing;
the corrected check waits for that event and passed.

The running foreground app still uses its old sidecar. Quit normally and
relaunch pnpm dev:codex before checking new-chat launch visibility. Manual
acceptance of the console correction remains pending; no merge or push yet.
No local E2E suite or packaged Windows build was run.

## Plan/Goal approval integration

ADR 0258 binds Codex to the existing Rust approval workflow. Entering planning
stops the old native segment and delegates before host mode changes, preserving
the host turn/start time. Restricted inspection, GUI questions, exact Markdown
submission and explicit approved native execution retain one history handle.
Targeted planning/adapter checks pass (51 tests); desktop typecheck passes.
The real Codex 0.157.1 + Rust host Windows fixture passes both Plan and Goal:
%USERPROFILE%/.nexus-codex-phase2/planning-20261001-b/report.json. No cloud
request was needed. The preceding fixture attempt had an async-predicate polling
bug, which was corrected before these results. GUI acceptance remains pending;
no full local E2E suite, merge, push or Phase 3 work has occurred.

## Browser first-attachment recovery

The user's loaded-page Surface unavailable report exposed premature capture
before positive GUI bounds and stale capture results after geometry changes.
Four focused lifecycle cases failed against the prior implementation. The pane
now waits for bounds, retires captures across attachment/geometry/navigation
epochs, and bounds transient retries to three captures without page reload.
Twelve focused Browser checks pass. The real Electron Windows fixture passes
initial attachment, injected transient empty capture, actual colored screenshot
and retained-page hide/resize/reveal with one navigation and no manual Retry.
Evidence: %USERPROFILE%/.nexus-codex-phase2/browser-surface-20261001-b/report.json
and surface.png. A previous fixture assertion incorrectly assumed the first real
Chromium capture must succeed; the successful run allows the specified bounded
retry budget. Manual GUI acceptance remains pending. No visual styling changed.

## Subagent feedback corrections

Inspected the user's Native browser visibility check and Greeting Conversation
saved outputs. The first test-runner's host Bash really produced MODULE_NOT_FOUND
for the directory test argument and 3-pass/1-fail after a corrected invocation.
The parent's native shell hit a different sandbox EPERM and wrongly accused the
child of fabricating results. Task now reports explicit execution-policy metadata.
Explorer keeps Bash as the user selected, with accurate shell-enabled labeling.

Greeting Conversation exposed live child message ownership missing from message
payloads, although Main persisted its envelope ownership correctly. All live
child text/reasoning/failure messages now carry the Task owner. The built-in UI
designer gains the user-approved typed Browser tools and actual screenshot image
input; custom catalogs stay exact. Thirty runtime/bridge/definition checks and
36 shared parser/preset checks pass, including a restricted child's authenticated
screenshot bridge and parent turn/permission identity. Runtime build and desktop
typecheck pass. No paid/provider trial was used. Manual acceptance is pending.

## Latest acceptance and exact-model settings

The user reports all preceding manual tests passed, with two remaining issues:
brainstorming in Plan mode and Copy on older prompts. Main now permits guidance
loading through the planning gate and main-window sanitized clipboard writes.
Thirty-seven focused checks and desktop typecheck passed. Those two latest
manual checks remain pending; Phase 3 has not started.

ADR 0260 adds a searchable model picker to every built-in and custom row. Current
uses the parent chat's provider/model at delegation start. Explicit choices retain
the exact configured provider ID and model ID. Built-in choices persist as Main
profile metadata; custom choices use the Rust model-only document save, preserving
advanced fields and exact prompt bytes. No paid model request was needed.

The isolated live renderer fixture passed built-in/custom selections, Current,
keyboard search, bounded menus at 1280x900 and 720x800, long IDs and rejected-save
feedback with zero page errors. In-memory provider/save fixtures avoided changing
the user's configuration. Evidence: %USERPROFILE%/.nexus-codex-phase2/
model-picker-20261001-b/report.json and picker-1280.png / picker-720.png.
Its first attempt observed the old page before remount; that fixture timing error
was corrected. Targeted desktop checks (48), runtime checks (25) and Rust document
checks (2) pass. Desktop typecheck and the release Rust host build pass. No full
local E2E suite or packaged verification was run. Manual
model-picker acceptance remains pending. The user authorized merging Phase 2
and the picker into local main before that test, followed by a fresh launch with
the rebuilt Rust host. No push is authorized. One restart timed out waiting for
sidecar.configure; the following recorded startup configured successfully.
