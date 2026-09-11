---
name: Nexus systematic debugging
description: use for a reproducible bug, test failure, build failure, regression, or unexpected behavior before applying a fix
---

Treat the reported symptom as evidence, not the diagnosis. Reproduce it where possible, read the full failure, inspect the relevant code and recent changes, and identify the narrowest credible root-cause hypothesis before editing.

Use Nexus tools deliberately:

1. Use `Read`, `Glob`, and `Grep` to map the failing path and find comparable working behavior.
2. Run the smallest relevant command through `Bash` to reproduce or collect evidence. Preserve its concrete error, location, and conditions.
3. Trace data and control flow to the source of the bad state. In multi-component paths, compare inputs and outputs at each boundary rather than guessing across the stack.
4. State one falsifiable hypothesis and test it. If it is rejected, gather the next evidence; do not stack speculative fixes.
5. Once the source is understood, write a focused regression test first, then make the minimum change needed to pass it.

Do not hide, downgrade, or bypass permissions and confirmations. A workaround can be useful to unblock the user, but label it as such and continue separating it from the root cause.
