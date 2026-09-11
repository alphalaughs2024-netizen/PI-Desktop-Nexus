---
name: Nexus test-first implementation
description: use when implementing an approved feature, behavior change, or diagnosed fix that has an executable test path
---

Before changing production behavior, express the smallest intended behavior in a focused failing test. Run it and confirm that it fails for the missing behavior, not for a typo or broken setup. Then make the smallest implementation change that makes it pass. Re-run the focused test and any directly affected checks before moving on.

Use the existing project's test conventions and commands. Do not manufacture a new test framework, change unrelated assertions, or treat a passing test written after the implementation as evidence that the regression was covered.

When the work cannot reasonably be automated—for example, a purely visual or environment-specific outcome—say what cannot be covered and use the closest repeatable validation available. This workflow guides quality; it never grants a write, shell, network, or permission bypass.

Keep the loop narrow:

1. Name one observable behavior.
2. Add or adjust one focused test.
3. Run it and inspect the expected failure.
4. Implement only enough to satisfy that behavior.
5. Re-run the test, then hand off to completion verification when the requested work is ready to assess.
