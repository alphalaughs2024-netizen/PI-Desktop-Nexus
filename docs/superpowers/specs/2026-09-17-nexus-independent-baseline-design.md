# Nexus independent baseline design

## Purpose

PI Desktop Nexus becomes an independent product beginning at version `0.0.1`.
The repository retains its accumulated technical specifications and feature
history, but its product identity, release history, and public documentation
no longer position Nexus as an upstream PI Desktop fork.

## Version and release model

All runtime, workspace-package, Cargo, protocol, release-document, and
installer version surfaces use `0.0.1`. The in-app changelog contains a single
newest-first `0.0.1` entry in every shipped locale, summarizing the Nexus
feature set represented by the current source. Earlier PI Desktop release
entries are removed from the in-app release feed; the retained specifications
and ADRs remain the technical history for the codebase.

The first Nexus release uses tag `v0.0.1` on the exact committed baseline and
publishes the Windows NSIS installer and portable executable produced from
that commit. An existing upstream-local `v0.15.0` tag is not changed.

## Product identity

Public package metadata, badges, repository links, updater ownership, and
documentation use the `PI Desktop Nexus` product name and
`alphalaughs2024-netizen/PI-Desktop-Nexus` repository. Visible developer and
creator metadata names Ryan. No product-facing page labels Nexus as a fork,
links to the upstream project, or displays upstream release or issue URLs.

The LGPL license file and bundled third-party notices remain unchanged. This
is a legal-distribution constraint rather than a product-identity statement.

## Documentation scope

The repository keeps the product README (English and Chinese), architecture,
security, runtime, plugin, delivery, ADR, guide, privacy, and feature-tracking
documentation. Delete the upstream-integration candidate tracker and obsolete
`0.15.0` release planning artifact. Rewrite only direct upstream/fork wording
or links in remaining public documentation and release configuration; do not
rewrite technical historical records merely to remove useful feature context.

Generated documentation output remains ignored build output and is not edited
as source.

## Validation

The reset must pass the release documentation preflight for `0.0.1`, the
localized changelog test, and the desktop Windows packaging command. The
release commit, tag, uploaded assets, and GitHub Release must all identify
`0.0.1`. The final release report records artifact hashes and whether local
Windows signing credentials were available.
