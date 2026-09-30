# Agent evaluation prototype

This is Phase 1 instrumentation, not the rebuilt Nexus app. Production themes,
renderer, engine, and data remain unchanged. See [recorded comparison](./COMPARISON.md).

## Run on Windows

```powershell
node scripts/agent-evaluation/cli.mjs doctor
node --test scripts/agent-evaluation/evaluation.test.mjs
node scripts/agent-evaluation/cli.mjs run --engine codex --scenario read
node scripts/agent-evaluation/cli.mjs run --engine opencode --scenario stale-edit
node scripts/agent-evaluation/cli.mjs run --engine pi --scenario browser
node scripts/agent-evaluation/cli.mjs serve
```

The last command prints a private loopback dashboard URL. Stop with Ctrl+C.
Scripted responses exercise real engines without inference; they do not measure
model intelligence. Cloud trials require explicit authorization and
`--allow-cloud`. The live xkiro catalog must declare zero input/output prices,
free access and tools, plus vision where needed. No paid fallback is attempted.

```powershell
node scripts/agent-evaluation/cli.mjs run --engine codex --source xkiro --allow-cloud --model qwen/qwen3.8-max:free --image
node scripts/agent-evaluation/cli.mjs run --engine opencode --source xkiro --allow-cloud --model deepseek/deepseek-v4.1-flash:free --scenario website
node scripts/agent-evaluation/cli.mjs serve --allow-cloud
```

The CLI reads only the existing selected xkiro credential from Nexus's secret
store. API callers can pass a Buffer to `evaluate` or `serve` in memory instead.
Profiles receive a non-secret relay marker. Never put real keys in command-line
arguments, committed files, exports, or engine configuration.

Version pins: Codex CLI 0.157.1, OpenCode 1.18.23, pi coding SDK 0.85.1.
Nothing is installed or updated automatically. Windows npm launchers resolve to
an executable/Node entrypoint without shell-built commands. Pi uses the primary
checkout's installed dependency; `NEXUS_EVALUATION_PI_ROOT` can supply an explicit
`@earendil-works` module directory.

## Capabilities and ownership

- Codex: real app-server threads, turns, patch, command sessions, image input,
  interruption and native history. Explicit custom-model metadata declares
  capabilities to test. Windows uses the unelevated restricted backend.
- OpenCode: real server sessions, native file tools, HTTP commands and SSE parts.
- pi: full coding SDK, native read/edit/write and SessionManager; not a raw Agent
  with harness-only persistence.
- All three use the same **harness-owned** preview and Chromium services:
  `evaluation_preview` and `evaluation_browser`. Codex/OpenCode use MCP; pi uses
  SDK custom tools. Screenshot results carry actual image content. Desktop is
  1280x800; mobile is 390x844. Console repetitions have counts. Unique console/page-error results are capped at
  100, with explicit dropped counts.
- Native edit tools are not claimed to provide universal transactional safety.
  The stale-edit trial uses absent old content and checks unchanged bytes.

The browser/preview service is preapproved only for the private evaluation
workspace. Other engine approval requests are declined. Human approval timing
and a production permission UI are not implemented here. No filesystem
containment claim is made for pi/OpenCode file tools or the companion process.
Codex's raw event opt-in is experimental/internal in the inspected source;
production reliance requires a pinned compatibility test or a stable alternative.

## Profiles, outputs, and recovery

Profiles/history/reports: `%LOCALAPPDATA%/NexusAgentEvaluation/<run>`.
Private workspaces: `%USERPROFILE%/.nexus-agent-evaluation/workspaces/<run>/<engine>`.
Restricted Codex writes failed under AppData in live probes and succeeded outside
it. Do not treat the successful external-root trial as packaged-app validation.
Older reports may use the original AppData workspace location.

Each website trial generates the same owned reference, sends the same fixed
request and image, and leaves `index.html` plus captures in its workspace.
Preview processes survive separate tool calls, then close at trial teardown.
No foreground profile is reused. No previous chats are migrated or deleted.

Exports are metadata only: version, model, events, timings, tool labels, image
counts, outcome and native handles. Native histories and screenshot/files are
private local artifacts, never committed. Provider intervals overlap; use the
clipped union in `timingSummary`, not a sum. Header/first-byte latency need not
be first answer text. Dashboard delivery, render task and next-frame samples are
bounded and separate from provider timings; they are not GPU paint measurements.

`native-trials.mjs` exposes completed-turn restart, uncertain-mutation
reconstruction, stale-edit checks, and active-tool interruption. Restart makes
no inference request automatically. It does not establish that an explicit
new request after an uncertain mutation is safe to retry automatically.

## Selection boundary

Each mandatory gate needs its own evidence. A fixture pass is not a cloud quality
pass; an image payload is not evidence of interpretation. Recommendations remain
provisional until the user's prototype/deliverable acceptance. No production
engine replacement, merge, push, E2E suite, sign-in, or paid trial is implied.

## Native sampling steering check

After building shared/runtime, run `node scripts/agent-evaluation/codex-stream-steering.mjs <isolated-evidence-directory>`. The local Responses fixture streams an unfinished answer through pinned Codex, then checks real native interruption, corrected sampling, one host outcome and read-only recovery. It makes no cloud request and reports transport/lifecycle behaviour, not model quality. Its evidence directory is retained for inspection. This is a targeted native integration probe, not a local Nexus E2E suite.
