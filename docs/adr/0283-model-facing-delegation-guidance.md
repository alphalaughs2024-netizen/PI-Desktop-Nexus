# ADR 0283: Model-facing delegation guidance

- Status: Accepted

## Decision

Nexus supplies the same compact Task guidance in the Codex developer
instructions and the Task tool description. It defines when to dispatch a
subagent, when to keep work in the parent, how to run independent reads in
parallel, how to reserve the single shared-workspace mutation lane, and how to
verify results with TaskWait and actual evidence. It explicitly tells the model
to call Task when the criteria match rather than merely discussing delegation.

The guidance is advisory: it does not force delegation for trivial work and
does not alter preset tools, permissions, model selection, concurrency limits,
or host authorization. Runtime admission remains authoritative.

## Consequences

Any supported model receives the same practical dispatch cues, including models
that were not trained on Nexus's product conventions. The Task catalog and
developer prompt stay aligned, while enforcement remains in the existing
read-scope and mutation scheduling boundaries.
