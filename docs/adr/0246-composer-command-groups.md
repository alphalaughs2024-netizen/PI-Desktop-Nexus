# ADR 0246: Composer Command Groups and User Skill Aliases

- Status: Accepted
- Date: 2026-09-29
- Related: ADR 0024, ADR 0245, D174

## Decision

The composer presents app commands, plugin commands, user skills, bundled
workflows, prompt templates, and trusted extension commands in separate groups.
This is a presentation distinction over one slash namespace. Existing app,
template, and plugin alias precedence is preserved; user skills follow them
and trusted extensions remain last.

Only active user skills admitted to the bounded instruction catalog are listed.
Their aliases remain model turns: the agent loads the exact skill id with its
existing `Skill` tool before responding. Bundled `/guide-*` aliases continue
to activate workflows through the host. Group metadata is additive to the
composer command IPC response; no new authority or permission is introduced.
