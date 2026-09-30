# Phase 1: recorded engine comparison

Observation date: 2026-09-30. Status: **prototype ready for human acceptance;
production engine selection is not approved**.

## Recommendation

Provisional recommendation: **Codex app-server**, with an explicit custom-provider
capability profile, a tested restricted Windows backend, and Nexus-owned browser
and preview services. Its native thread/turn/item lifecycle, patch tool, process
sessions and interruption/reconstruction fit the planned execution contract.
This recommendation is based on the workflow and ownership fit, not speed.

OpenCode is a viable alternative and finished the website sample sooner. pi also
completed it through its full SDK. The evidence does not establish that replacing
pi alone improves response quality or latency. Much of the current Nexus failure
is in Nexus's own bridge and process ownership. Retaining pi with a rebuilt
integration remains technically credible.

Codex has two concrete integration constraints: restricted writes in the original
AppData trial root failed, and patch-validation failures need an experimental raw
event path in this pin. Human acceptance must include these limitations. Phase 2
must define a stable/pinned compatibility boundary before production replacement;
Phase 6 must test packaged Windows behavior independently. No existing profile,
renderer or production runtime was changed to achieve these results.

## Tested runtime and source versions

| Candidate | Tested runtime | Separate source reference |
|---|---|---|
| Codex app-server | npm CLI 0.157.1 | C:/Games/cli at 7498521d288b9b3b96ffba4eedf089d8d6e06a84 |
| OpenCode | 1.18.23 | C:/Games/opencode-custom at c2eacd72afc4a4984564c393e15ab30011057269 |
| pi | full pi-coding-agent SDK 0.85.1 | Installed SDK shipped with Nexus dependencies |

Installed Codex 0.158.0-alpha.2.1 was an explicitly separate compatibility probe,
not a silent upgrade of the pinned candidate. Source snapshots are not proof of
the exact shipped runtime implementation. No repository was cloned in this work.

Primary documentation was fetched successfully on 2026-09-30 and cross-checked
against pinned runtime behavior:

- Codex app-server: `https://developers.openai.com/codex/app-server` (thread
  start/resume, turn start/interrupt/completion, streaming item updates).
- OpenCode server: `https://opencode.ai/docs/server/` (asynchronous prompt,
  session/message endpoints, event stream).
- pi coding SDK: `https://raw.githubusercontent.com/badlogic/pi-mono/main/packages/coding-agent/docs/sdk.md`
  (createAgentSession, SessionManager, resource ownership and disposal).

Current documentation may describe capabilities beyond these pins; passing live
trials and the pinned schemas are authoritative for this evaluation. The initial
web lookup returned no content; direct primary-page retrieval succeeded.

Additional inspected sources:

- Paseo, 21efcc975abeecb8c23ea705493ff541c6c6d0c7: leading updates followed by a
  60ms coalescing window; adapter/native-handle ownership.
- Kimi source, b6144f94ea6b22455a4e750d1750d220987e7bc2: separate turn, step,
  retry and tool events. Readable public code is not a reconstruction of every
  installed obfuscated daemon behavior.
- Extracted Codex/Kimi assets were not selected or copied into Nexus.

## Mandatory trials and ownership

| Trial | Codex | OpenCode | pi |
|---|---|---|---|
| Quiet startup | Immediate harness status/timer; native events | Same | Same |
| Multi-step website | Live native patch + tools + final, one harness turn | Live native write + tools + final | Live SDK write + tools + final |
| Image input | Reference and both capture images reach xkiro | Same | Same |
| Stale edit | Native patch rejects absent old content; unchanged bytes | Native edit rejects; unchanged bytes | SDK edit rejects; unchanged bytes |
| Preview/process continuity | Shared companion; same PID across calls, closed at teardown | Same | Same |
| Desktop/mobile verification | Companion Chromium images and diagnostics | Same | Same |
| Active-tool cancellation | Native interrupt; one interrupted outcome | Native abort; one interrupted outcome | SDK abort; one interrupted outcome after adapter correction |
| Provider failure after a read | Read result and handle retained; no fallback | Same | Same |
| Completed-turn restart | Native handle/count restored, no request on reconnect | Same | Native SessionManager handle restored, no replay |
| Uncertain mutation reconstruction | Engine killed after marker; one marker/no automatic replay | Same | SDK cancellation/shutdown, one marker/no replay; not a hard crash |

All references to the preview/browser tests describe a **harness-owned** service.
They do not claim all engines include a built-in browser or background-server
supervisor. Native edit tests establish a defined stale-content rejection, not
universal protection against every semantic mistake or concurrent edit race.

The full coding SDK replaced an earlier raw pi Agent evaluation. A wrong-image
OpenCode attempt was discarded; it is not included in the valid comparison.

## Same-model website sample

Model: deepseek/deepseek-v4.1-flash:free via xkiro, verified zero pricing and vision
support at trial time. Same screenshot and fixed prompt; build index.html, inspect
both captures, implement Start a session. Browser dimensions: 1280x800 and 390x844.

| Engine | Whole turn | Preparing | Waiting-model phase | Tools | Reasoning/text phases |
|---|---:|---:|---:|---:|---:|
| Codex | 61.632s | 0.913s | 53.702s | 5.122s | 1.895s |
| OpenCode | 45.986s | 1.660s | 33.997s | 1.833s | 8.496s |
| pi SDK | 46.696s | 3.082s | 31.991s | 1.918s | 9.705s |

These are **one workflow sample per candidate**, not statistical engine or model
rankings. Different API serialization/instructions remain part of each workflow.
Waiting-model is a known UI state, not pure provider compute. It can include
engine preparation between requests. No baseline Nexus latency benchmark was
collected, so an improvement over Nexus cannot be quantified from this table.

Provider intervals overlap (including engine title traffic). The clipped union
was 41.310s for OpenCode and 41.573s for pi. Codex recorded 38.034s from completed
requests, with two incomplete requests at teardown; that value is incomplete and
must not be used to infer low provider latency. Headers/first byte are not first
answer tokens. Never sum concurrent request duration into whole-turn timing.

Independent desktop/mobile checks passed for all three: Start a session changes
to Session started, no horizontal overflow, no page errors. Visual inspection
shows recognizable reference layouts with spacing/font/color differences. None
is asserted pixel exact. Human deliverable-quality acceptance is outstanding.

## Free-model screening

The same small tool request/result, red-image (where supported), and static
content-anchored sum patch were used. This is a screening task, not a codebase or
website-quality benchmark. The returned patch was checked statically, not executed.

| Model | Tool/result/patch | Image | Sample elapsed |
|---|---|---|---:|
| qwen/qwen3.8-max:free | Passed | Passed | 20.710s |
| deepseek/deepseek-v4.1-flash:free | Passed | Passed | 14.687s |
| deepseek/deepseek-v4-pro | Passed | Catalog unsupported; skipped | 8.733s |
| minimax/minimax-m3:free | Passed | Passed | 8.285s |
| mistralai/mistral-medium-3.5 | Passed | Passed | 3.244s |
| xiaomi/mimo-v2.6-flash:free | Passed | Passed | 14.415s |
| qwen/qwen3.8-omni-flash:free | Passed | Passed | 15.524s |

The live catalog identified all screened entries as free, including names without
:free. DeepSeek was selected provisionally for the harder workflow. The short
Mistral screening time does not establish the best coding model. No paid model
was called; paid trials would need separate approval and a concrete question.

## Baseline Nexus findings

Current source independently confirms these integration gaps:

- apps/desktop/electron/main/index.ts around 5456 strips browser screenshot image
  data from the model-visible result. A screenshot path cannot replace image input.
- BrowserPreview in that file around 5410 requires an open workspace; Temporary
  chat scratch does not satisfy its workspace contract.
- browser-cdp.ts does not allow Emulation.setDeviceMetricsOverride.
- Rust Read rejects binary; offset is explicitly zero-based. This is a confusing
  line-number interface, not a confirmed off-by-one implementation bug.
- Hashline editing already validates tags, provenance and unseen-line constraints.
  The reported wrong-target semantic edit is not evidence of no existing safety.
- Windows shell ownership uses KILL_ON_JOB_CLOSE, consistent with descendants
  dying at tool teardown. A session preview needs explicit longer-lived ownership.

The two AI efficiency reports were treated as observations to verify. They are
not authoritative evidence of tools' exact behavior or engine responsibility.

## Windows Codex diagnostic

1. An unknown custom-model descriptor omitted native apply_patch. Source confirms
   that fallback. An explicit evaluation descriptor exposed the native tool.
2. With the Windows backend disabled and approval never, commands/patches were
   blocked by policy. Provider calls still succeeded. This was not model refusal.
3. Enabling the unelevated restricted backend still failed Add File inside the
   original AppData fixture root for both npm CLI and installed alpha probes.
4. The same model/configuration outside AppData wrote the file and rejected stale
   context. The live website then passed with the native patch and MCP browser.

This reproduces a path-sensitive behavior; the exact AppData virtualization/ACL
mechanism has **not** been fully isolated. Do not call it a general Windows fix
or packaged-app proof. No sandbox was disabled and no elevated setup/sign-in was
performed to hide the failure.

Raw patch outputs also revealed validation errors for which no typed fileChange
item was emitted. The harness opts into rawResponseItem/completed and maps that
output to a failed tool item. This API is experimental/internal in inspected
source; production integration must explicitly own pinning/compatibility risk.

## Native command-session probe

Codex also launched a read-only TTY Node fixture through exec_command, returned a
session ID, showed heartbeats in separate write_stdin calls, and stopped after
Ctrl+C with COMMAND_STOPPED. PowerShell reported exit code 1 for that interrupted
process; the harness retains this failed-command status rather than claiming
successful exit. This establishes inspectable command lifetime and input, not
safe arbitrary background-server behavior. Preview ownership remains separate.

An earlier read-only command fixture mistakenly wrote a stop-marker on SIGINT.
The sandbox rejected that write, as expected; the corrected probe uses stdout
only. Its failure is retained as evidence of enforcement, not a model-quality
failure. Read-only shell configuration was not relaxed for the retest.

## Display measurements and remaining limits

A headless Windows browser reloaded the dashboard during a native Codex fixture
trial. Turn identity and accepted timestamp survived; phases included preparing,
waiting-model, tool, responding, completed. Total displayed duration was 4.7s.
13 samples had projection-to-delivery delays of 6–258ms, DOM tasks 0.2–1.4ms and
next-frame delays 0–0.3ms. This includes the prototype's 250ms polling cadence;
it does not measure Nexus's renderer or actual GPU paint.

Remaining work/gates:

- Human prototype and deliverable-quality acceptance; production engine decision.
- Human approval handling/timing (the harness declines general requests and
  preapproves only scoped companion tools). Keep production's 120-second deny
  timeout until separately approved.
- Production filesystem/shell authority and owned service cleanup; pi/OpenCode
  and companion tools are not represented as sandboxes.
- Hard pi process crash during mutation, explicit retry after uncertain mutations,
  large-context compaction, authenticated model switching and packaged Windows
  parity are outside the completed trial scope.
- Multi-sample latency distributions and current Nexus baseline measurements.
- Stable alternative or pinned compatibility coverage for Codex raw patch errors.

The prototype is evidence for selecting the next phase, not completion of Phases
2–6. No engine becomes production default and no runtime/theme is replaced here.

## Local evidence index

Reports/history remain private under %LOCALAPPDATA%/NexusAgentEvaluation.
Old workspaces are beneath each report root; new workspaces are recorded in the
report and live under %USERPROFILE%/.nexus-agent-evaluation/workspaces.
Only this metadata summary is committed. No credential, native history, image
or generated website is committed (the owned reference fixture is source data).

| Evidence | Local run identifier |
|---|---|
| Codex valid website | 2026-09-30T08-17-57.026Z-d5921b34 |
| OpenCode valid website | 2026-09-30T07-24-24.537Z-2df105b7 |
| Full SDK pi website | 2026-09-30T07-39-13.321Z-9d855174 |
| Discarded wrong-image OpenCode attempt | 2026-09-30T07-21-45.389Z-d4e62c23 |
| Codex stale read/patch | 2026-09-30T08-28-54.726Z-f38dd546 |
| OpenCode stale edit | 2026-09-30T07-29-10.094Z-de766ac9 |
| pi stale edit | 2026-09-30T07-34-44.853Z-15684095 |
| Codex completed restart | recovery-codex-8004b4b7 |
| OpenCode completed restart | recovery-opencode-6bb11874 (final profile layout) |
| pi completed restart | recovery-pi-66cd4293 (final profile layout) |
| Codex/OpenCode/pi uncertain marker | uncertain-codex-1fec99ff / uncertain-opencode-df86886b / uncertain-pi-4cc62c00 |
| Active interruptions | interruption-codex-e0e551f8 / interruption-opencode-996f81b5 / interruption-pi-83a0d9f6 |
| Codex read then 401 | 2026-09-30T08-28-54.727Z-f8d8188a |
| OpenCode/pi read then 401 | 2026-09-30T07-29-18.377Z-86f71ed4 / 2026-09-30T07-34-48.331Z-a7df73da |
| Renderer reload + samples | 2026-09-30T08-35-24.786Z-a1a4ea64 / renderer-evidence.json |
| AppData restricted failures | codex-restricted-1790755038637 / codex-npm-restricted-1790755672437 |
| Outside-AppData native write/stale rejection | evaluation-native-write-1790755877234 |
| Native command session heartbeat/input/stop | 2026-09-30T08-50-44.410Z-10dd1ed4 / command-evidence.json |
| Read-only command marker rejection | 2026-09-30T08-46-49.350Z-5e041564 |
| Final OpenCode/pi supervised browser trials | 2026-09-30T08-55-35.753Z-c3b29032 / 2026-09-30T08-55-35.755Z-4c2d3d1c |

Model screening: model-probe-2eec1b81, ec6d9a1d, 442b3b03, dab0bf69, 47bd760d,
ecf09323 and 39f2d6ca, respectively in the model table's order.
