# Plugin Packaging & Integrity Guide

Authoritative reference for MCP OD plugin distribution (manifest v2) covering hashing, integrity verification, external dependency policy, environment flags, and tooling.

## Goals

- Deterministic, tamper-evident distribution
- Bundled-by-default runtime (no surprise installs)
- Explicit, auditable opt-in for external runtime dependencies
- Forward-compatible integrity primitives (whole dist hash + optional per-file checksums)

## Manifest v2 Fields (Supplement)

| Field | Purpose |
|-------|---------|
| manifestVersion | Must be `"2"` for v2 documents |
| dist.hash | SHA256 of ordered dist/ contents (`sha256:<64hex>`) |
| dist.checksums.files[] | Optional per-file SHA256 entries for granular verification |
| externalDependencies[] | Optional, gated list of runtime packages (exact versions) |
| dependenciesPolicy | `bundled-only` (default), `external-allowed` (advisory), `external-allowlist`, or `sandbox-required` |
| dependencies[] | Optional list of other plugin names to load before this plugin |

## Computing dist.hash

Algorithm:
1. Collect all regular files under `dist/` (exclude dotfiles & directories)
2. Sort lexicographically by relative POSIX path
3. For each file append to hash stream:
   - `PATH\n` (UTF-8)
   - file bytes
4. SHA256 digest → hex → prefix with `sha256:`

Pseudocode:
```ts
for (const path of sortedDistFiles) {
  hasher.update(path + "\n");
  hasher.update(fs.readFileSync(path));
}
const distHash = `sha256:${hasher.digest("hex")}`;
```

## Per-File Checksums

Optional structure:
```json
"dist": {
  "hash": "sha256:...",
  "checksums": {
    "files": [ { "path": "dist/index.js", "sha256": "<64hex>" } ]
  }
}
```
Duplicate `path` entries MUST fail validation. Checksums enable selective verification or incremental diff strategies later.

## External Dependencies Policy

Baseline (Option A): distribution must be self-contained.

- Allowed runtime imports: Node core allowlist + `@modelcontextprotocol/sdk`.
- Any import outside these sets is considered external.
- External runtime dependencies only permitted when host sets `PLUGIN_ALLOW_RUNTIME_DEPS=1`.

`externalDependencies[]` entries:
```json
{ "name": "lodash", "version": "4.17.21", "integrity": "sha512-..." }
```
Rules:
- Exact versions only (no ranges ^ ~ > < *).
- Optional integrity field (SRI-style) for future cross-check.
- Host cross-validates entries against allowlist `tools/plugins/allowlist-deps.json`.
- Example allowlist file is provided at `docs/allowlist-deps.json` (copy or adapt into `tools/plugins/allowlist-deps.json` on the server).
- Policies:
  - `bundled-only`: no externals permitted.
  - `external-allowed`: externals permitted if `PLUGIN_ALLOW_RUNTIME_DEPS=1`; allowlist usage emits warnings.
  - `external-allowlist`: externals require both `PLUGIN_ALLOW_RUNTIME_DEPS=1` and allowlist inclusion.
  - `sandbox-required`: same as allowlist when externals present, and may also require sandbox availability.

## Rejection Conditions

| Condition | Error Type |
|-----------|-----------|
| Missing or malformed `dist.hash` | integrityError |
| Hash mismatch (recomputed != manifest) | integrityError |
| Signature required but missing/unverified | signatureError |
| External import with flag disabled | policyError |
| Undeclared external import with flag enabled | policyError |
| Version range in externalDependencies.version | validationError |
| Duplicate checksum path | validationError |
| Native addon (.node) w/out PLUGIN_ALLOW_NATIVE | policyError |

## Environment Flags

| Flag | Default | Effect |
|------|---------|--------|
| PLUGIN_ALLOW_RUNTIME_DEPS | false | Enable processing of `externalDependencies` + allowlist install |
| PLUGIN_ALLOW_NATIVE | false (future) | Permit native addons when sandbox isolation present |
| REQUIRE_SIGNATURES | false | Enforce signature presence during install |
| STRICT_CAPABILITIES | false | Fail when declared capabilities not registered |
| STRICT_TOOLS | false | Fail on invalid tools during validation |

## Tooling

Scripts (repo root):

| Script | Purpose |
|--------|---------|
| `scripts/validate-plugin.js` | Compute & verify dist hash (fails on mismatch) |
| `scripts/quality-gate-packaging.js` | Scan fixtures / plugin dirs for unbundled imports |

Recommended CI Steps:
1. Build plugin (produce `dist/`)
2. Run validate script → embed `dist.hash`
3. Run quality gate script
4. Generate or update lock file
5. (Optional) Sign artifact → attach signature alongside bundle

## install.lock.json

Example (v2 enriched):
```json
{
  "name": "net-utils",
  "version": "1.1.0",
  "sourceUrl": "https://marketplace.example.com/plugins/net-utils-1.1.0.zip",
  "sha256": "<64hex>",
  "installedAt": "2025-09-09T12:00:00Z",
  "signature": "<base64-optional>",
  "fileCount": 12,
  "totalBytes": 81234,
  "policy": {
    "STRICT_INTEGRITY": true,
    "STRICT_CAPABILITIES": false,
    "PLUGIN_ALLOW_RUNTIME_DEPS": false
  }
}
```
Used for provenance, audit, and possible offline revalidation.

## Verification Flow (Host Loader)

1. Load and parse manifest
2. Determine schema generation (v2 if `manifestVersion=2`)
3. Recompute dist hash (v2)
4. Compare to manifest `dist.hash`
5. Verify checksums (if provided)
6. Scan imports; apply policy rules
7. Enforce externalDependencies allowlist (policy-aware, with global allowlist)
8. Verify signature(s) when required; signed payload is manifest `dist.hash` string and algorithm is honored
9. Continue capability capture / reconciliation only if integrity passes

## Sandbox Roadmap (Summary)

| Tier | Capabilities | Status |
|------|--------------|--------|
| 1 | Allowlist require, integrity hash, optional signature | Implemented |
| 2 | vm.Context isolation, frozen intrinsics, heap sampling | Planned |
| 3 | Worker isolation, resource quotas, native gating | Planned |

## FAQ

**Q: Why include both a global dist hash and per-file checksums?**  
A: Global hash detects any change efficiently; per-file checksums allow future partial verification, caching, and diff distribution.

**Q: Can I skip per-file checksums?**  
A: Yes. They are optional and primarily for future optimization layers.

**Q: How do I regenerate the hash after edits?**  
A: Re-run `scripts/validate-plugin.js` (it recomputes and can print/emit the correct value).

**Q: What if I need a large dependency (e.g., axios)?**  
A: Bundle it; only use runtime external deps if unavoidable and approved for allowlisting.

**Q: Are signatures required?**  
A: Only when `REQUIRE_SIGNATURES=true`. They are recommended for production distribution channels.

## References

- `docs/specs/mcp-plugin-spec.md`
- `docs/manifest-loader.md`
- `docs/integration/mcp-open-discovery-registry-integration.md`
- `docs/ARCHITECTURE.md`

---

This guide supersedes earlier draft notes referencing commit hash synchronization.
