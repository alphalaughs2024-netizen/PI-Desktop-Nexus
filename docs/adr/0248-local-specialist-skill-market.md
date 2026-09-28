# ADR 0248: Local specialist skill market

- Status: Accepted
- Date: 2026-09-29
- Related: ADR 0247

## Decision

Settings > Skills has a bundled Specialist Skill Market. Catalog entries are
visible for discovery and full-document preview, but are not installed or
available to the agent by default. Installing creates an enabled global user
skill through the existing host-owned `skills.create` API. The resulting file
is user-owned and can be edited, disabled, or removed from My Skills. Removal
returns the catalog entry to the installable state.

The catalog is static and local to the application. It does not contact a
repository, run scripts, install tools, or use the separate plugin marketplace.
Its manifest records category and source; bundled documents and license text
ship with the application. The first selection contains only self-contained,
MIT-licensed specialist documents whose subjects do not repeat Nexus workflow
guidance. The market preview shows the entire original document before the
user chooses to install it.

## Rationale

This keeps discovery separate from activation and retains the existing
global/project skill storage and runtime contract. A future remote source may
add provenance, versioning, and resource packaging without turning every
bundled catalog item into default prompt context.
