# ADR 0259: Make subagent execution policy and message ownership explicit

- Status: Opt-in implementation; manual acceptance pending
- Date: 2026-10-01
- Related: ADR 0062, ADR 0243, ADR 0255, ADR 0256

## Decision

Configured Codex children use Nexus host tools. Their tool metadata names the
declared catalog, shell availability, permission scope, parent permission mode
and scheduling-only ownership. Parent native shell outcomes do not establish
what happened in a child's host shell. Keep explorer's Bash access as approved
by the user and label it as shell-enabled; inspection intent is not enforced
read-only access. Do not loosen parent sandbox policy to make the environments
appear identical.

Child message payloads carry their Task owner and agent name on every start,
update and completion, including reasoning and failure rows. Envelope-only
attribution was sufficient for persistence but lost during live rendering.
The existing subagent activity UI now receives the same ownership as reload.

Add typed Nexus Browser inspection, screenshots, viewports, console and
interaction tools to the assignable catalog and built-in UI designer. Its
browser screenshots deliver structured images through the existing bounded
session bridge. BrowserPreview only opens the page. Unsupported model vision
is explicit; paths or pixel counts cannot be claimed as visual inspection.
User definitions retain their exact catalog; no implicit grants or migration.

## Evidence and limits

The user's Greeting Conversation saved child rows with Task ownership, while
live message updates lacked it. Their earlier test-runner's saved host outputs
confirm real test results that the parent wrongly disputed after a native
sandbox failure. Targeted fixtures cover live ownership, policy metadata,
unchanged restrictions and child screenshot image delivery. Wrong intended edit
locations remain model errors: freshness tags validate file state, not semantic
intent. Phase 4 will address broader edit contracts. Appearance is unchanged.
