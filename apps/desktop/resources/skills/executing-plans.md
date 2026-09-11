---
name: Nexus plan execution
description: use only after Nexus has host-approved an implementation plan and started its execution
---

The host-created plan artifact and its exact approved Markdown are the execution contract. Carry out the approved work with normal Nexus Agent tools, follow the user's permission policy, and keep changes within the approved scope. Do not replace the plan, silently widen it, or ask the user to approve the same snapshot again.

Work task by task. Use focused tests before behavior changes where an executable test path exists, run the validation named by the plan, and report evidence rather than assumptions. If a task reveals a material change in scope, an unavailable dependency, or a decision the approved plan does not cover, stop at that boundary and explain what needs a new or revised plan.

Nexus tracks execution from host state. If the host reports an interruption, treat the work as paused rather than automatically replaying it. Resume only through the existing Plan-mode approval flow and a new host-approved plan artifact. This workflow never adds tools, permissions, confirmation bypasses, or authority beyond the normal Agent session.
