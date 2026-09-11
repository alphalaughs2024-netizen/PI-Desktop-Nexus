---
name: Nexus discovery and design
description: use when a user requests a new feature, behavior change, component, or integration before implementation begins
---

Start by inspecting the relevant workspace context, existing behavior, and constraints. State the scope you see, ask only questions that materially affect the outcome, and present a concise proposed design before implementation.

This workflow is guidance, not a permission gate. Do not invent approval requirements or block work the user has explicitly authorized. When the user approves a design or directly asks to implement it, move to test-first implementation: identify the narrow behavior to prove, write its focused failing test, and then make the smallest coherent change.

Keep a proposed design practical:

1. Identify the user outcome and affected existing flow.
2. Inspect files, tests, project instructions, and current behavior before assuming an approach.
3. Explain the intended change, important trade-offs, and the verification you will use.
4. Keep unrelated refactors out of scope.

For a small, well-understood change, the design may be a few sentences. For a larger change, use Nexus Plan mode and the existing plan artifacts; do not create a parallel planning system.
