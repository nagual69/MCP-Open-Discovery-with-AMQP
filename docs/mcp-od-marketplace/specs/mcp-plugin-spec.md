# MCP OD Marketplace Plugin Specification

Standardized packaging for MCP Open Discovery–compatible plugins bundling Tools, Resources, and Prompts via the official MCP SDK. Provides a manifest‑first, integrity‑enforced, bundled‑by‑default distribution model.

Goal: Marketplace validates & renders metadata; Registry ingests & registers capabilities deterministically and safely.

See also: `./mcp-spec-tools.md`, `./mcp-spec-resources.md`, `./mcp-spec-prompts.md`.

## Manifest: mcp-plugin.json (Schema Generations)

| Field | v1 | v2 |
|-------|----|----|
| manifestVersion | (absent) | "2" (required) |
| name | slug | same |
| version | semver | semver (exact required for external deps) |
| sdk | required range | informational (host pins SDK) |
| entry | path | must live under `dist/` (ESM) |
| capabilities | declared lists | same |
| permissions | array of `{id,reason}` | object booleans (network, fsRead, fsWrite, exec) |
| metadata | nested display object | flattened top-level (description, author, license, homepage, repository, keywords) |
| dist | — | REQUIRED `{ hash: "sha256:<64hex>", checksums? }` |
| externalDependencies | — | optional (feature-flagged) |
| dependenciesPolicy | — | `bundled-only` (default) or `external-allowed` |
| dependencies | — | optional array of other plugin names to load first |

### v2 Example (abridged)
```json
{
	"manifestVersion": "2",
	"name": "net-utils",
	"version": "1.1.0",
	"entry": "dist/index.js",
	"description": "Network tooling bundle",
	"author": "Acme",
	"dist": { "hash": "sha256:0123abcd..." },
	"permissions": { "network": true },
	"capabilities": { "tools": [{ "name": "ping" }] },
	"externalDependencies": [],
	"dependenciesPolicy": "bundled-only"
}
```

## Runtime Integration Contract

Entry must export `createPlugin(server: McpServer): Promise<void> | void` registering all declared capabilities.

Load sequence:
1. Ajv validate manifest (v1 or v2).
2. Dynamic import entry (ESM) & locate `createPlugin`.
3. Execute inside capture proxy – record attempted registrations.
4. Reconcile captured vs declared capabilities (STRICT_CAPABILITIES optional failure).
5. Validate tools (STRICT_TOOLS) before commit.
6. Forward captured items to live server.
7. Emit structured summary & (installer) persist lock data.

Blocking failures (invalid schema, missing createPlugin, dependency cycle, strict mismatch) abort atomically.

## Packaging & Distribution Policy

Baseline (Option A – enforced):
1. Fully bundled: only allowlisted Node core modules + `@modelcontextprotocol/sdk` imported at runtime.
2. No dynamic install unless `PLUGIN_ALLOW_RUNTIME_DEPS=1`.
3. Deterministic hash: ordered `dist/` file list + content → SHA256 stored in `dist.hash`.
4. Optional per‑file checksums for future selective verification.
5. Lock file `install.lock.json` (provenance + integrity) always written; v2 lock includes fileCount, totalBytes, and host policy snapshot.

Controlled External Dependency Mode (`PLUGIN_ALLOW_RUNTIME_DEPS=1`):
* Validate each `externalDependencies[]` package@version against allowlist `tools/plugins/allowlist-deps.json`.
* Only exact versions permitted (no ^ ~ ranges).
* Future: isolated `vendor/node_modules` + integrity map (roadmap).
* Policy nuances: `external-allowed` (advisory), `external-allowlist` (strict allowlist), `sandbox-required` (allowlist + sandbox availability when externals present).

Reject Criteria:
* Non‑allowlisted external import when runtime deps disabled.
* Semver ranges (^, ~, *, >, <) in external dependency versions.
* Native addons (`.node`) unless `PLUGIN_ALLOW_NATIVE=1` (future flag).

## Dependency Graph

Optional `dependencies: string[]` referencing other plugin names. Loader performs topological sort; cycles (`A -> B -> C -> A`) abort with explicit chain.

## Error Model

Registration failures throw; tools may return structured `CallToolResult` with `isError=true` & descriptive message.

## Structured Summary (Loader Output)

```
{
	loaded:  [ { name, version, tools, resources, prompts, path } ],
	skipped: [ { name, reason } ],
	failed:  [ { name, error } ],
	timings: { totalMs, validationMs, importMs, reconcileMs, registerMs },
	stats: { toolsRegistered, resourcesRegistered, promptsRegistered, invalidTools, warnings }
}
```
Forward compatible – unknown keys must be ignored.

## Lock File

`install.lock.json` stores `{ name, version, sourceUrl?, sha256, signature?, installedAt, fileCount?, totalBytes?, policy? }` enabling audit, integrity, and reproducibility metadata.

## Versioning

Semantic versioning; host may gate downgrades & major changes. `sdk` field advisory in v2 (host pins SDK runtime).

## Security & Sandbox Roadmap

Tier 1 (Now): allowlist require, integrity hash, optional signature, no postinstall scripts.
Tier 2 (Planned): vm context + frozen intrinsics + heap sampling.
Tier 3 (Planned): worker isolation + resource quotas + termination on violation.

Permissions metadata is advisory; enforcement occurs in host runtime.
Signatures: when required, verification uses the literal `dist.hash` string as payload and honors per-signature algorithms and trusted key resolution via credentials.
## Hot Reload Behavior (Host)

Hosts may watch spec plugin directories. In MCP Open Discovery, changes to a plugin `dist/` or its `mcp-plugin.json` trigger automatic reload via `PluginManager.reloadPlugin()`. The registry applies capability diffs so removed tools/resources/prompts are unregistered before re-registration.

Integrity and dependency policies here supersede earlier drafts with commit hash placeholders.
