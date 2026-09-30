# ADR 0243: Browser agent interaction and result contract

- Status: Accepted
- Date: 2026-09-28
- Deciders: PI-Desktop core
- Related: [ADR 0234](0234-browser-built-in-capability-contract.md),
  [ADR 0241](0241-browser-tab-guests.md)

## Context

The typed Browser schema and Main handlers disagreed on evaluate and wait
arguments. Type and keypress did not perform their named actions. Screenshot
responses could put base64 image data into the model context. Links requesting
a new window opened in the system browser, leaving the controlled guest on the
original page even though the click succeeded.

## Decision

The typed schema is the contract for Browser tool arguments. Main passes the
declared fields to the broker and returns explicit failures to the agent.
Under ADR 0254, interactions use the requesting session's resolved retained
guest and current snapshot references, independently of GUI selection. A wait
checks live guest loading and URL state. Screenshot results expose a saved
session scratch path and bounded metadata in text. A capable Codex model may
also receive a structured multimodal image block through the authenticated
Nexus tool bridge; encoded image data is never inserted into prose or GUI
diagnostics. A Browser tool that inspects or navigates, including `browser_list_tabs`,
reveals the Browser panel for the active conversation.

An allowed page link requesting a new window navigates the current controlled
guest. This keeps the click destination visible to the user and subsequent
Browser tools without introducing a second, unmanaged window. Existing URL
policy and guest permissions still apply.

## Consequences

- Agents can observe navigation and continue on the clicked page.
- Screenshot save failure is an explicit tool failure.
- `target=_blank` links replace the current guest page; a future explicit
  new-tab tool can give them a separate retained guest.
