# ADR 0253: OpenRouter compatibility for native Codex patch tools

Status: Phase 2 prototype; user acceptance pending
Related: [ADR 0252](0252-codex-execution-contract.md)

## Evidence

Codex 0.157.1 exposes apply_patch as a custom freeform tool. OpenRouter's
Responses endpoint accepted the request but Space Bunny did not report that
tool as available. Forcing a custom tool returned HTTP 400. The model used
shell workarounds instead. A disposable trial translating only that tool to a
JSON function and translating its returned call back to a native custom item
passed a direct read/patch/read workflow with one completed turn.

## Decision and ownership

For the exact HTTPS openrouter.ai/api/v1 endpoint, the Codex session owns an
authenticated loopback transport service. It converts apply_patch's definition,
history call/output pairs and Responses stream items. Other tool declarations,
images, ordinary output, model and provider selection are preserved. Codex's
native handler still owns patch validation, approvals, sandbox policy and edits.
Nexus does not apply the returned patch itself. No provider or model fallback
occurs and no shell editing substitute is presented as a successful patch tool.

The local service uses a random bearer token that differs from the provider key.
The engine receives the local token; only the bridge holds the upstream key.
Recovery stores the original provider/session binding, never the transient port,
token or key. Provider configuration in the app remains unchanged. Requests
must name the bound model and only the Responses paths are accepted.

The bridge bounds incoming bodies and stream frames, retains backpressure,
forwards upstream failure status, rejects malformed patch arguments and closes
on cancellation, engine loss, failed startup or shutdown. It never replays a
request. This is a version-tested transport adaptation, not a universal claim
about every Responses gateway. Changes require protocol fixtures and a real
native Windows workflow trial.

## Sources and limits

Primary sources inspected: the pinned rust-v0.157.1 protocol/openai_models.rs,
core/tools/handlers/apply_patch_spec.rs, and OpenRouter Responses tool-calling
and overview documentation. No external repository was cloned or copied.
Search results motivated the probe; live source and native trials determined
what was implemented. Provider-side search tools are not claimed to be fully
observable by this patch compatibility layer.
