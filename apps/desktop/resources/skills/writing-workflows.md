---
name: Nexus workflow package authoring
description: Create and maintain a versioned Nexus workflow package with fixtures and capability checks.
---

# Nexus workflow package authoring

Use this guidance when creating or changing a Nexus workflow package.

1. Establish the intended outcome, supported Nexus modes, and actual host capabilities. A package describes compatible capabilities; it never creates tools, permissions, confirmations, executable hooks, or authority.
2. Create the package through the Skills settings page. Nexus scaffolds a `workflow.json` manifest and `WORKFLOW.md` body in the selected global or project workflow root.
3. Keep the id inside its host-assigned `user/` or `project/` namespace. Do not imitate or override `nexus/` packages.
4. Set a semantic package version and concise activation terms. Automatic activation uses literal host-validated terms only; it never evaluates package-supplied code or regular expressions. Prefer manual activation when the trigger is ambiguous.
5. Declare only capabilities that Nexus already provides. If a required capability is unavailable, leave the package unavailable and explain the compatibility requirement instead of inventing a tool call.
6. Write a clear `WORKFLOW.md` body in Nexus terms. Tell the agent how to inspect, plan, ask for confirmation, use existing tools, and verify results. Do not paste provider-specific instructions.
7. Add one positive and one negative fixture for every expected stage. Run the package preview and fixtures after each change. Fixture prompts are evaluated in memory and are not stored as activation audit data.
8. Bump the package version when its behavior or compatibility contract changes. Check the compatibility badge after a Nexus upgrade; an older or newer package format must be upgraded before it can activate.

The workflow package is guidance only. Nexus retains sole control over tools, permissions, session state, Plans, Goals, Git operations, and confirmations.
