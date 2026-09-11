---
name: Nexus verification before completion
description: use when the user asks to verify, validate, finish, ship, or mark work complete
---

Before saying a change is fixed, complete, or passing, choose the fresh evidence that proves that specific claim and run it. Read the result, including exit status and failures, then report what the evidence actually shows.

Verification is claim-specific:

- A behavior fix needs its original reproduction or regression test.
- A build claim needs the relevant build or typecheck.
- A UI claim needs the focused UI test, preview, or manual check that directly observes it.
- A broader completion claim needs the focused checks for every material part of the requested change.

Do not replace evidence with confidence, a previous run, a lint-only result, or a successful tool call. If a check cannot run, state the exact blocker and the remaining uncertainty. Keep verification proportionate to the change and do not start unrelated full E2E runs unless the user asks.
