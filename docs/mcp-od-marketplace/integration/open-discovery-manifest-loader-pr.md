# PR Proposal: Manifest‑First Plugin Loader + Remote Installer for MCP Open Discovery

This is a drop‑in PR description for the Open Discovery repository. It aligns the registry with the MCP OD Marketplace plugin spec by completing a manifest‑first loader, dependency‑aware registration, schema validation, and a remote installer for Marketplace ZIPs. It is written to match the current Open Discovery registry modules and minimize churn.

## Executive Summary

- Keep current registry architecture. Promote the existing manifest path to first‑class and finalize missing pieces.
- Validate canonical `mcp-plugin.json` with Ajv (Draft‑07) using the Marketplace schema; produce actionable errors.
- Respect dependency graphs via stable topological sort with cycle diagnostics.
- Capture plugin registrations (tools/resources/prompts) and forward to the live McpServer.
- Add a remote installer to fetch, verify, stage, and load Marketplace ZIPs.
- Preserve legacy module discovery and hot‑reload.

## Current Code Inventory (Open Discovery)

The following modules already implement most of the design:

- tools/registry/plugin_loader.js
  - Ajv validation for mcp-plugin.json; dynamic ESM import of the entry.
  - Server proxy to capture registrations preflight; capability reconciliation; optional strict mode.
  - Topological order utility for dependencies.
- tools/registry/plugin_manager.js
  - Detects mcp-plugin.json and routes spec plugins to the loader.
  - Pre-validates tools via ToolValidationManager; staged installers (JS/ZIP).
- tools/registry/index.js
  - Orchestrates discovery/validation/hot‑reload and dynamic (un)load + re‑register.
- tools/registry/core_registry.js
  - DB-backed state, re-registration against server, stats, hot‑reload caches.
- tools/registry/hot_reload_manager.js
  - Watchers, debounce reloads, after‑reload callback for re‑registration.
- tools/registry/tool_validation_manager.js and tools/registry/mcp_types_adapter.js
  - Zod/JSON Schema handling; ensure MCP-compatible schemas.
- tools/registry/resource_manager.js and tools/prompts_sdk.js
  - Helpers for resource and prompt registration + tests.

This PR focuses on targeted deltas to fully align with the Marketplace spec while retaining compatibility.

## Deltas by File (Minimal Changes)

1. tools/registry/plugin_loader.js

- Manifest schema source
  - Use the Marketplace schema as the source of truth: `docs/specs/schemas/mcp-plugin.schema.json` (keep in sync or vendor a copy).
  - Improve error formatting to include path, message, and suggestion.
- Entry contract
  - Enforce a default export or named export `createPlugin(server)`; emit a clear error if missing.
- Capability reconciliation
  - After preflight capture, compare declared capabilities with actual registrations and log warnings. Add `STRICT_CAPABILITIES` support to fail on mismatch when enabled.
- Dependency order
  - Ensure loader calls `topoSortByDependencies` across discovered manifests before importing. Emit a cycle chain in errors.
- Summary
  - Return a structured load summary `{ loaded:[], skipped:[], failed:[], timings:{} }` to aid higher‑level reporting.

2. tools/registry/plugin_manager.js

- Spec path priority
  - Continue preferring `mcp-plugin.json` when present.
- Staged installers
  - When staging a ZIP: require `mcp-plugin.json` + an entry file; compute and persist SHA256 checksum. Optionally persist detached signature blob if present.
  - Add basic checksum verification before finalizing an install.
- Validation manager
  - Keep pre‑validation via ToolValidationManager. When `STRICT_TOOLS` is enabled, block load on schema errors.
- API surface
  - Expose `installFromZip(filePath, options)` and `installFromUrl(url, options)` returning the staged artifact metadata (name, version, checksums, paths) and hooking into hot‑reload/registry reload.

3. tools/registry/index.js

- Feature flags and config
  - Add env/config toggles:
    - `MANIFEST_LOADER_ENABLED` (default: true)
    - `REQUIRE_SIGNATURES` (default: false)
    - `STRICT_CAPABILITIES` (default: false)
    - `STRICT_TOOLS` (default: false)
    - `PLUGIN_INSTALL_DIR` (default: ./plugins)
  - Emit a one‑line boot summary of feature flags.
- Registry bootstrap
  - When the manifest loader is enabled, call the manifest discovery + topo‑sort + load path before legacy discovery; keep legacy as fallback.
- Hot‑reload bridge
  - Ensure after‑reload callback re‑registers manifest plugins using the same loader function and returns the structured summary for logs.

4. tools/registry/hot_reload_manager.js

- No functional change required; ensure reload of spec plugins calls back into `plugin_manager.loadPlugin` or a thin wrapper that preserves manifest semantics.

5. tools/registry/tool_validation_manager.js and mcp_types_adapter.js

- Maintain current MCP schema adaptation. Add a “summary reporter” method that aggregates per‑tool results and returns counts (valid, warn, error) for logs and CI.

6. tools/registry/resource_manager.js and tools/prompts_sdk.js

- Keep registration helpers; add small examples in tests for manifest‑driven registration and ensure list/read flows are covered.

## Installer: Minimal Additions

Add a thin remote installer with two surfaces:

- Programmatic API (preferred)
  - `installFromUrl(url, { requireSignatures, installDir })`
    1. Fetch manifest; Ajv validate.
    2. Verify checksum (required); verify signature if `requireSignatures`.
    3. Download ZIP; extract to `installDir/<name>@<version>/`.
    4. Persist lock file: `{ name, version, url, sha256, signature? }`.
    5. Ask registry to (re)load that module; return structured summary.
- Optional CLI
  - `open-disc install <url-or-id>` that forwards to the API.

Security posture: signatures optional now, feature‑flag to require in prod later.

## Tests to Add or Update

- Manifest validation (unit)
  - Valid/invalid manifests with precise Ajv error snapshots.
- Dependency order (unit)
  - Topo‑sort happy path; explicit cycle test with chain output.
- Registration mapping (integration)
  - All‑capabilities sample plugin registers tools/resources/prompts; ensure handlers respond.
- Capability reconciliation (integration)
  - Declared‑but‑missing capability emits warning; with `STRICT_CAPABILITIES=true` it rejects.
- Installer flows (integration)
  - URL and ZIP installs: verify checksum, extract, load; then unload and clean.
- Hot‑reload (integration)
  - Change a manifest plugin’s entry file; verify watcher reload + re‑register summary.

CI: run these along with existing registry tests; produce a concise PASS/FAIL summary per suite.

## Developer and Ops Docs

- Add `docs/manifest-loader.md` explaining:
  - Manifest fields and schema link (source of truth: Marketplace repo at `docs/specs/schemas/mcp-plugin.schema.json`).
  - Flags and their defaults.
  - Installer usage and lock file format.
  - Troubleshooting (common Ajv errors; missing createPlugin export; dependency cycles).

README: mention manifest‑first loader, installer, and feature flags.

## Security and Policy

- Checksums required for all remote installs.
- Optional detached signature verification (Ed25519) behind `REQUIRE_SIGNATURES`.
- No postinstall scripts; extracted files are inert until explicitly imported by loader.
- Rate‑limit remote fetches and support retry/backoff.

## Config & Env

- `MANIFEST_LOADER_ENABLED` (bool, default true)
- `PLUGIN_INSTALL_DIR` (path, default ./plugins)
- `REQUIRE_SIGNATURES` (bool, default false)
- `STRICT_CAPABILITIES` (bool, default false)
- `STRICT_TOOLS` (bool, default false)
- `MARKETPLACE_TOKEN` (optional)

## Acceptance Criteria

- Ajv validation of `mcp-plugin.json` using Marketplace schema with actionable errors.
- Topological dependency load with cycle diagnostics.
- Spec plugins register tools/resources/prompts via capture‑and‑forward; summary returned.
- Remote installer fetch → verify checksum → extract → load → reloadable.
- Legacy discovery remains intact; feature flags controllable.
- Tests are green in CI; new docs published.

## Migration & Rollout

- Ship behind `MANIFEST_LOADER_ENABLED`; enable in non‑prod first.
- Document rollback (disable flag; remove install dir).
- Keep vendor schema in repo only if importing from Marketplace is not feasible.

## References

- Marketplace spec docs:
  - `docs/specs/mcp-plugin-spec.md`
  - `docs/specs/schemas/mcp-plugin.schema.json`
- Integration guide:
  - `docs/integration/mcp-open-discovery-registry-integration.md`
