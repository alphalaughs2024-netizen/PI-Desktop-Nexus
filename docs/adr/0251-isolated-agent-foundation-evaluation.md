# ADR 0251: Isolated agent-foundation evaluation

- Status: Accepted for evaluation only
- Date: 2026-09-30
- Related: ADR 0002, ADR 0212, ADR 0213

## Context

The user authorized rebuilding Nexus's execution experience while retaining its
visual design. Engine replacement must be supported by measurements rather than
attributing application integration problems to pi. Existing chat migration,
Context Vault, and Prompt Inspector are not requirements for the future rebuild.

## Decision

Introduce a developer-only evaluation harness under `scripts/agent-evaluation`.
It runs pinned Codex app-server, OpenCode, and pi instances in separate profiles,
projects their events into one evaluation timeline, and exports bounded metadata.
The existing Nexus runtime is a separate baseline, not synonymous with pi.

No production engine, IPC, database schema, renderer, theme, or tool policy is
changed by this phase. Evaluation artifacts are outside the checkout and outside
`.pi-desktop-nexus`. The future production ownership contract requires its own ADR.

The default is a scripted local model fixture. Explicitly authorized cloud trials
use xkiro models verified against its live catalog as free with zero input/output
prices. The credential stays in a loopback relay's memory. Native engine profiles
receive only a non-secret relay marker. There is no automatic provider fallback
or API translation. No inference traffic goes to any other provider.

Engine selection requires evidence for every mandatory trial plus human review
of deliverable quality. A transport or replay test cannot satisfy a coding,
process-supervision, browser, or recovery trial. Candidate recommendations remain
provisional until this gate passes. Later phases require separate acceptance.

## Consequences

Nexus can measure native runtime behavior without changing the production app.
Mock tests establish the harness contract; native/cloud trials establish only
the explicitly recorded scope. Engine-specific feature gaps remain visible.
The evaluation adapters do not commit Nexus to a multi-engine product.
