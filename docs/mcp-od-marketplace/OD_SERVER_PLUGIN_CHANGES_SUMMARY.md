# OD Server: Plugin Changes Summary (Sync for Marketplace)

This document summarizes the implemented changes on the MCP Open Discovery (OD) server related to spec v2 plugins, and why the schema required updates. Use this as the authoritative reference to keep Marketplace packaging in sync with OD runtime behavior.

## What changed in OD Server

1) Spec v2 manifest enforcement and integrity
- Ajv validation against `mcp-plugin.schema.v2.json`.
- Recompute `dist.hash` over entire ordered `dist/` tree and compare to manifest (sha256:<hex>).
- Optional per-file checksums accepted and verified when present.

2) Capability capture and strictness
- The loader executes `createPlugin(server)` through a capture proxy and records actual registrations (tools/resources/prompts).
- OD reconciles captured vs declared capabilities; with `STRICT_CAPABILITIES=true`, mismatches fail the load.

3) Signature verification (optional, recommended)
- When `REQUIRE_SIGNATURES=true`, OD verifies either `mcp-plugin.sig` or `manifest.signatures[]`.
- Verification honors the signature algorithm field; the signed payload is the literal `dist.hash` string.
- Trusted public keys are loaded via credentials manager (ids from `PLUGIN_TRUSTED_KEY_IDS`) or fallback trusted key file.

4) External dependency policy + global allowlist
- Default policy is bundled-only (no runtime externals).
- If host enables `PLUGIN_ALLOW_RUNTIME_DEPS=1`, externals must be declared in `externalDependencies[]` with exact versions.
- OD enforces a global allowlist (`tools/plugins/allowlist-deps.json`). Policies:
  - external-allowed: warns when not in allowlist (advisory)
  - external-allowlist: requires allowlist inclusion
  - sandbox-required: same as allowlist for externals, and may require sandbox availability

5) Dependency ordering
- OD respects `manifest.dependencies[]` for topological load ordering and fails on cycles with an explicit chain.

6) Lock file enrichment
- OD writes/updates `install.lock.json` including fileCount, totalBytes, and a policy snapshot (`STRICT_INTEGRITY`, `STRICT_CAPABILITIES`, `PLUGIN_ALLOW_RUNTIME_DEPS`).

7) Hot-reload integration for spec plugins
- OD watches each plugin `dist/` and `mcp-plugin.json`.
- On changes, OD triggers `PluginManager.reloadPlugin()`; capability diffs apply to remove prior registrations before re-registering.

## Why schema v2 needed updates

- Added `dependencies[]` to enable deterministic cross-plugin load ordering and surface cycles early.
- Extended `dist` section to allow fileCount/totalBytes and optional `hashes` for future integrity algorithms.
- Added `externalDependencies[]` structure and `dependenciesPolicy` enum to codify external dependency handling.
- Included `signatures[]` with algorithm and keyId to support detached signatures aligned with host verification.
- Tightened types and patterns (semver, names, paths) to improve validation quality and operational safety.

## Marketplace implications (what Copilot should ensure)

- Compute and embed `dist.hash` during packaging; ensure deterministic ordering rules match OD (sorted POSIX paths + file bytes with a trailing "\n" after path in hash stream if applicable to your implementation).
- Emit `manifestVersion: "2"`, ensure `entry` lives under `dist/`, and populate optional integrity extras (fileCount/totalBytes/checksums) when feasible.
- If signatures are produced, sign the literal `dist.hash` string; include signature(s) and algorithm; provide key id when possible.
- If runtime external deps are supported in Marketplace authoring, enforce exact versions and offer an allowlist gate compatible with OD’s global allowlist.
- Support author-provided `dependencies[]`; provide authoring UI checks for simple cycle detection.
- ZIP layout should preserve `dist/` exactly as hashed; don’t mutate file contents after hashing.
- After install, OD will recompute hash and may reject if mismatch or if policy checks fail.

## Reference locations

- Schema: `docs/mcp-od-marketplace/specs/schemas/mcp-plugin.schema.v2.json`
- Packaging Guide: `docs/mcp-od-marketplace/PLUGIN_PACKAGING.md`
- Loader Guide: `docs/mcp-od-marketplace/manifest-loader.md`
- Environment Vars: `docs/ENVIRONMENT_VARIABLES.md`
- Example allowlist: `docs/allowlist-deps.json`

## Minimal compatibility checklist

- [ ] Manifest v2 with required fields: name, version, entry, dist.hash
- [ ] Hash computation matches OD algorithm and ordering
- [ ] Optional: per-file checksums, fileCount/totalBytes
- [ ] Optional: signatures over literal dist.hash, algorithm specified
- [ ] External deps gated by policy and allowlist (if enabled)
- [ ] Dependencies[] supported for topological load
- [ ] ZIP preserves dist fidelity post-hash
- [ ] Hot-reload expectations documented for developers
