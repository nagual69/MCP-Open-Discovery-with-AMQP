# Legacy Asset Curation For The 3.0 Extraction

This document records which top-level assets from the legacy repository are worth carrying into the standalone TypeScript-first 3.0 repository.

The rule is simple: only move assets that are still authoritative for the extracted runtime, plugin platform, packaging flow, or default test surface.

## Decision Summary

### Keep And Rewrite

These themes are worth keeping in 3.0, but they should be rewritten against the extracted typed runtime instead of copied verbatim.

- environment and operator reference
- HTTP client compatibility notes for the extracted streamable HTTP transport
- transport architecture and deployment shape
- plugin authoring, packaging, and validation guidance
- a single maintained architecture diagram source, if we want one

### Keep As-Is Or Nearly As-Is

These were already migrated or already existed in repo-local form.

- `README.md`
- `docs/REPO_EXTRACTION_CHECKLIST.md`
- `docs/TESTING_MIGRATION_DECISION.md`
- `docs/mcp-od-marketplace/specs/schemas/mcp-plugin.schema.v2.json`
- `plugins/scripts/build-blessed-plugins.js`
- repo-local deploy scripts under `scripts/`
- Docker assets under `docker/`
- typed runtime tests and repo-local test fixtures under `testing/test-data/`

### Defer Until Runtime Parity Exists

These legacy doc themes should not be copied forward as authoritative 3.0 guidance until the extracted runtime implements the same behavior.

- advanced HTTP session TTL and Last-Event-ID resumability notes
- Origin allowlist and rebinding-protection operator guidance
- deployment summaries written around the legacy JS host

At the time of extraction, the 3.0 streamable HTTP transport supports initialized sessions and stateless POST auto-initialization, but it does not yet expose the legacy TTL or Origin-validation controls as active typed-runtime features.

### Leave Behind

These assets are useful as archaeology at most and should not move into the standalone repository by default.

- remediation reports and migration journals that describe already-completed work
- one-off implementation summaries and deployment reports
- marketing collateral, PDFs, and duplicate image exports
- helper scripts that are not referenced by the repo-local build, Docker, or test path
- checked-in logs, local runtime data, extracted plugin temp directories, and generated build output
- marketplace web-app or builder documentation that describes a separate product surface

## Recommended 3.0 Documentation Set

The standalone repository should keep a compact set of current, typed-runtime-focused documentation.

- `docs/ENVIRONMENT_VARIABLES.md`
- `docs/BACKWARD_COMPATIBILITY.md`
- `docs/QUICK_REFERENCE.md`
- `docs/TRANSPORT_ARCHITECTURE.md`
- `docs/PLUGIN_AUTHORING.md`
- `docs/REPO_EXTRACTION_CHECKLIST.md`
- `docs/TESTING_MIGRATION_DECISION.md`

## Script Curation

### Keep

- `scripts/rebuild_deploy.ps1`
- `scripts/rebuild_redeploy.sh`
- repo-local helper scripts referenced by Docker or package scripts

### Leave Behind Unless A Real Need Appears

- ad hoc AMQP demo clients
- one-off export scripts
- legacy deployment wrappers that are not part of the 3.0 package scripts
- shell entrypoint helpers that are not used by the current typed Docker image

## Collateral Curation

### Worth Keeping

- one maintained architecture source file, preferably editable text such as Mermaid
- protocol reference material only if maintainers actively use it during development

### Not Worth Keeping By Default

- screenshots, PDFs, and multiple rendered logo variants
- executive one-pagers and presentation collateral
- duplicate architecture renders generated from a text source

## Definition Of Done

The documentation side of the extraction is in good shape when all of the following are true.

- repo-local docs describe only behavior that the typed runtime actually supports
- no default 3.0 doc depends on the legacy JS host for correctness
- the README points to repo-local docs instead of legacy-root narratives
- the env sample matches active typed-runtime configuration keys
- maintainers can understand build, deploy, transport, and plugin workflows from the 3.0 folder alone