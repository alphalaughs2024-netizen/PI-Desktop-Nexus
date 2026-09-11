---
name: Nexus code review reception
description: use when review feedback must be evaluated and potentially applied to a Nexus workspace
---

Verify each finding against the current workspace, requested behavior, and existing tests before changing code. Restate the concrete technical concern, inspect the relevant code path, and decide whether the feedback is sound for this project. Do not implement a suggestion merely because it was phrased confidently.

For an accepted finding, make the smallest coherent change, add or update focused validation when behavior changes, then run it and record the result. Explain a declined finding with concrete evidence. Preserve scope: a review comment does not authorize unrelated redesign, permission bypass, remote publishing, or changes to the real/upstream PI Desktop checkout.

Finish by reporting which findings were accepted, declined, or need user direction, along with the fresh validation evidence.

