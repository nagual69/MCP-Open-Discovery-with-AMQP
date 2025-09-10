# Manifest-First Loader (Developer Guide)

Updated for Open Discovery Server v2.0 manifest pipeline (capture → reconcile → validate → forward) – aligns Marketplace packaging with live registry semantics.

## Overview

- Canonical manifest: `mcp-plugin.json` (JSON Schema Draft‑07)
- Entry contract: module exports `createPlugin(server)` (sync or async) registering tools / resources / prompts
- Capture & Reconcile: loader proxies server first to capture declared registrations, then compares vs manifest.capabilities.*
- Dependency ordering: stable topological sort with explicit cycle chain diagnostics
- Validation integration: optional ToolValidationManager batch validation prior to final registration (STRICT_TOOLS)
- Capability strictness: mismatch can warn or throw (STRICT_CAPABILITIES)
- Backward compatibility: legacy module discovery path still runs as fallback when `MANIFEST_LOADER_ENABLED` is false or no spec plugins found
- Structured result: loader returns `{ loaded, skipped, failed, timings, stats }` enabling higher-level reporting

## Feature Flags & Environment

| Flag | Default | Purpose |
|------|---------|---------|
| MANIFEST_LOADER_ENABLED | true | Enable spec plugin discovery + load path |
| PLUGIN_INSTALL_DIR | ./plugins | Root install dir for fetched / staged plugins |
| REQUIRE_SIGNATURES | false | Enforce detached signature presence + verification |
| STRICT_CAPABILITIES | false | Fail load if declared capabilities missing after createPlugin() |
| STRICT_TOOLS | false | Fail load if tool validation reports invalid (via validation manager) |
| MARKETPLACE_TOKEN | (unset) | Optional auth token for authenticated Marketplace fetches |
| SCHEMA_PATH | (auto) | Override schema path (defaults to vendored Marketplace schema) |
| DEBUG_REGISTRY | false | Verbose registry debug logging |

Boot summary logs a single line enumerating active flags for observability.

## Installer Usage

Two surfaces:

1. Programmatic API
  - `installFromUrl(url, { requireSignatures, installDir })`
  - `installFromZip(filePath, { requireSignatures, installDir })`
  Steps:
  1. Fetch / read manifest, Ajv validate against Marketplace schema (actionable errors)
  2. Compute SHA256 checksum (required). Verify signature if `requireSignatures` or REQUIRE_SIGNATURES flag.
  3. Extract to `PLUGIN_INSTALL_DIR/<name>@<version>/` (atomic move after temp extraction)
  4. Write `install.lock.json` with provenance `{ name, version, url?, sha256, signature?, installedAt }`
  5. Trigger registry reload → manifest loader capture+validate+forward
  6. Return structured summary (see below)

2. Optional CLI (thin wrapper)
  - `open-disc install <url-or-id>` – invokes programmatic API and prints summary table.

### Structured Summary Shape
```
{
  loaded: [ { name, version, path, tools, resources, prompts } ],
  skipped: [ { name, reason } ],
  failed:  [ { name, error } ],
  timings: { totalMs, validationMs, importMs, reconcileMs, registerMs },
  stats: { toolsRegistered, resourcesRegistered, promptsRegistered, invalidTools, warnings }
}
```

## Lock File Format

File: `install.lock.json` stored inside each plugin directory.

```
{
  "name": "example-plugin",
  "version": "1.0.0",
  "sourceUrl": "https://marketplace.example.com/...",
  "sha256": "<hex>",
  "signature": "<base64-optional>",
  "installedAt": "2025-09-06T00:00:00Z"
}
```

Additional future fields (reserved): `dependenciesResolved`, `validationSummary`.

## Troubleshooting

- Manifest validation errors: Each Ajv issue includes `instancePath` and message. Provide minimal reproducer manifest.
- Missing createPlugin: Ensure entry ESM exports `createPlugin` (named) — default export object with `createPlugin` also supported.
- Capability mismatch: Ensure each declared tool/resource/prompt actually registers; enable `STRICT_CAPABILITIES=true` to block.
- Tool schema issues: With `STRICT_TOOLS=true` invalid tools block load; otherwise they log warnings (validation manager output).
- Dependency cycles: Inspect emitted chain `A -> B -> C -> A` and break optional dependency edges.
- Signature failures: Confirm detached signature matches published public key set, or disable REQUIRE_SIGNATURES in non‑prod.
- Hot reload not re-registering: Verify registry captured server instance and plugin manager invoked loader on file change.

## Dynamic Operations & Hot Reload

- Dynamic load: `dynamicLoadModule` supports on-demand module addition (legacy path) – spec plugins should prefer installer path.
- Unload: spec plugin unload currently marks inactive; full unregister pending SDK support.
- Re-register: hot reload manager invokes loader; captured registrations are replayed to live server.

## Security Notes

- No postinstall scripts executed; only validated manifest + imported entry.
- All network fetches should be rate-limited and timeboxed.
- Future: sandboxed execution; per-plugin resource permission model.

## References

- `docs/specs/mcp-plugin-spec.md`
- `docs/specs/schemas/mcp-plugin.schema.json`
- `docs/integration/open-discovery-manifest-loader-pr.md`

_Synced with Open Discovery commit: <ADD_COMMIT_HASH_HERE>_
