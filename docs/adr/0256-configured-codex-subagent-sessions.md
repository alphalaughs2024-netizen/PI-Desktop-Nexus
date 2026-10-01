# ADR 0256: Run configured subagents in separate Codex sessions

- Status: User-selected architecture; opt-in implementation, manual acceptance pending
- Date: 2026-10-01
- Related: ADR 0252, ADR 0255; existing subagent contracts ADR 0062 and ADR 0089

## Evidence and Decision

The user requested an investigation of native delegation before choosing an
implementation. A recorded Codex 0.157.1 trial with a local Responses fixture
preserved the role's model and instructions, but sent its requests through the
parent provider despite an alternate provider declaration. The read-only role
also received `apply_patch`. Disabling shell was respected. Those observations
do not establish native enforcement of Nexus's saved provider/tool settings.

The user selected separate Codex sessions preserving exact models, providers
and restrictions. Each Task starts an independent native engine with a private
history/recovery handle. Production still has one selected engine; children do
not fall back to pi. Native multi-agent tools are disabled for parent and child
processes, so all delegation uses Nexus's configured Task catalog.

## Ownership and Enforcement

- Nexus owns each child, its preset, exact binding, permission scope and parent
  turn attribution. A saved pin is authoritative. Unpinned presets inherit the
  chat's selected provider/model. Task model overrides are refused; unavailable
  pins/tools fail explicitly. The exact-model picker is a separate follow-up.
- Each child has a private authenticated Nexus MCP bridge exposing only its
  declared tools. File/shell tools use existing host services with the parent
  chat, turn, saved permission scope and pinned shell identity. Main services
  retain their existing admission rules. Child lifecycle events cannot finish
  the parent's host turn; only attributed message/tool rows are forwarded.
- A private provider bridge filters native declarations and validates every
  returned output item before native execution, including streamed item/done
  and response/completed frames. Only actually offered permitted function tools
  pass. Namespaced MCP functions are supported; native patch, shell, resource,
  goal, browser and undeclared tool calls fail closed. Shell is also disabled
  natively. A violation terminates the child without provider retry or fallback.
- This enforces tool availability, not arbitrary-shell filesystem containment.
  A preset with Bash retains that tool's actual host policy. No stronger OS
  sandbox or rollback guarantee is claimed. Trusted extensions keep their own
  execution boundary.
- Preset maxTurns bounds provider attempts (including retries); maxTokens caps
  each Responses output. At most ten children run per chat. Read-only children
  may overlap; concurrent mutating children in one workspace are refused even
  with disjoint ownership labels. Labels do not create worktree isolation.

## Completion and Recovery

Task returns immediately; TaskWait/List/Stop retain the existing controls.
Reports are bounded, expose truncation/omitted IDs, and can be read by ID without
re-execution. TaskList returns a roster rather than repeating full reports.
When the parent goes idle, Nexus keeps the host turn open, shows waiting for
subagents, awaits unresolved children, and provides undelivered reports through
a new native segment on the same thread. This is an observed normal completion
boundary, not replay of an interrupted tool. Host turn/start time remain fixed.

Task completion updates its original GUI row with the final provider/model,
status and timing. Additive self-contained tool_end metadata preserves the row
after its initial transport completion or renderer reload. A failed child is a
child failure report, not a parent turn failure. Parent Stop, disposal and fatal
failure stop owned children. Partial output is retained; changes already applied
are not undone.

Private bounded recovery records contain no credentials. Reload marks unresolved
children interrupted and reads their partial snapshots without launching them.
Native histories remain available for inspection. Storage/cleanup failure is
reported without claiming durable saving or confirmed process shutdown.

## Verification

Targeted fixtures cover pins, missing bindings, tool restrictions, permission and
shell attribution, concurrent writers, report delivery, cancellation and cold
reconstruction. Two native Windows probes exercise the real pinned executable:

- `scripts/agent-evaluation/codex-restricted-tools.mjs`: permitted MCP Read runs;
  an adversarial native patch is blocked and no file appears.
- `scripts/agent-evaluation/codex-configured-delegation.mjs`: distinct parent/child
  endpoints and exact models, child GUI attribution, integrated report, preserved
  host turn and one terminal outcome. Both use local fixtures without cloud fees.

The earlier native-role investigation is reproducible with
`scripts/agent-evaluation/codex-native-delegation.mjs`. Local E2E suites and
packaged-build verification remain unrun. Plan/Goal and legacy extension commands
remain separate unfinished Phase 2 integrations. Phase 3 has not started.
