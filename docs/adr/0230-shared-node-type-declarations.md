# ADR 0230: Node typings for shared build-time tests

## Status

Accepted

## Decision

The shared package may contain build-time tests that use Node standard-library
modules. It therefore declares `@types/node` as a development dependency. This
does not add a runtime dependency or change the browser-facing shared package;
it keeps the package's composite TypeScript build self-contained and makes the
desktop dependency build reproducible from a clean install.
