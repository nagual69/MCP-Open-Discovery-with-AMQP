# MCP Open Discovery - Registry Integration Guide

This guide shows how to integrate the MCP OD Marketplace plugin spec into the MCP Open Discovery Registry Plugin Module manager.

Related docs:

- `docs/manifest-loader.md` — developer guide for the manifest-first loader (flags, installer, troubleshooting)
- `docs/security/plugin-signing.md` — checksum and optional signature verification

## Objectives (Updated)

- Accept packaged plugin with `mcp-plugin.json` + built entry file
- Validate manifest (Ajv JSON Schema Draft‑07; optional zod mirror)
- Capture registrations via proxy during createPlugin (preflight stage)
- Reconcile declared vs actual capabilities; optionally enforce strictness
- Batch validate tools (ToolValidationManager) when available
- Register tools/resources/prompts only after successful preflight
- Support dependency graph topology (cycle diagnostics)
- Emit structured summary for observability & CI

## Directory layout alignment

Two complementary layouts are in play. Both are supported; choose one consistently per environment.

- Marketplace storage (this repo; for packaging/export and backups):

  - tools/plugins/tools/
  - tools/plugins/prompts/
  - tools/plugins/resources/
  - tools/plugins/tmp/
  - Env: PLUGINS_BASE_DIR points to tools/plugins (default: <repo>/tools/plugins)

- Open Discovery server install dir (external repo):
  - plugins/<pluginId>@<version>/
  - Env: PLUGIN_INSTALL_DIR (default: ./plugins)

Recommended: keep Marketplace storage separate. When installing to Open Discovery, write to PLUGIN_INSTALL_DIR; do not mirror the per-type subfolders.

Schema source of truth: Marketplace `docs/specs/schemas/mcp-plugin.schema.json`.
The Open Discovery loader either vendors a copy (default path under `docs/mcp-od-marketplace/specs/schemas/`) or respects an override `SCHEMA_PATH`.

### Feature Flags (Open Discovery)

| Flag | Default | Effect |
|------|---------|--------|
| MANIFEST_LOADER_ENABLED | true | Enables manifest-first discovery path |
| PLUGIN_INSTALL_DIR | ./plugins | Root for installed plugins |
| REQUIRE_SIGNATURES | false | Enforce presence + verification of signatures |
| STRICT_CAPABILITIES | false | Throw if declared capabilities not all registered |
| STRICT_TOOLS | false | Block registration on invalid tools (validator) |
| MARKETPLACE_TOKEN | (unset) | Auth header for private Marketplace fetches |
| SCHEMA_PATH | (auto) | Custom schema JSON path |
| DEBUG_REGISTRY | false | Verbose registry logging |

Marketplace API server env (this repo):

- PLUGIN_INSTALL_DIR or PLUGINS_BASE_DIR supported for directory creation (server uses the first present)

## Loader Steps

1. Validate Manifest

- Read mcp-plugin.json and validate against `docs/specs/schemas/mcp-plugin.schema.json`
- Enforce required fields: name, version, sdk, entry, capabilities
- Optional fields: permissions, metadata, dependencies (string[] of plugin IDs)

Feature flags affecting behavior:

- `MANIFEST_LOADER_ENABLED` (default true)
- `STRICT_CAPABILITIES` and `STRICT_TOOLS` (default false) to enforce stricter checks
- `REQUIRE_SIGNATURES` (default false) for remote installer signature verification

2. Resolve Entry

- Resolve `<pluginRoot>/<entry>` to a file path
- Use Node's dynamic import to load the ES module

3. Expect Runtime Contract

- The module must export `createPlugin(server)`
- Call with host McpServer instance so it can call `registerTool/registerResource/registerPrompt`

4. Preflight Capture & Reconciliation

- Compare capabilities.\* entries to actual registrations after createPlugin completes
- Emit warnings for declared but not registered items
- If `dependencies` are declared, ensure dependents load after their dependencies; detect cycles and report errors

5. Tool Validation (Optional)

- If ToolValidationManager is configured, run batch validation on captured tools prior to final registration.
- With STRICT_TOOLS=true, invalid tools abort the plugin load.

6. Error Handling

- Catch and report manifest errors and dynamic import failures
- Wrap createPlugin in try/catch and surface readable errors

## Example Loader (TypeScript) – Simplified

```ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { MCPPluginManifest } from "./types";

export async function loadPlugin(
  server: McpServer,
  rootDir: string,
  manifest: MCPPluginManifest
) {
  const entryPath = new URL(
    `file://${rootDir.replace(/\\/g, "/")}/${manifest.entry}`
  );
  const mod = await import(entryPath.href);
  if (typeof mod.createPlugin !== "function") {
    throw new Error(`Entry does not export createPlugin(): ${manifest.entry}`);
  }
  await mod.createPlugin(server);
}

// Loading multiple manifests with dependencies
export async function loadAll(
  server: McpServer,
  rootDir: string,
  manifests: MCPPluginManifest[]
) {
  // topo sort by dependencies
  const idToManifest = new Map(manifests.map((m) => [m.name, m]));
  const tempMark = new Set<string>();
  const permMark = new Set<string>();
  const order: MCPPluginManifest[] = [];

  function visit(id: string, stack: string[] = []) {
    if (permMark.has(id)) return;
    if (tempMark.has(id)) {
      throw new Error(`Dependency cycle: ${[...stack, id].join(" -> ")}`);
    }
    tempMark.add(id);
    const m = idToManifest.get(id);
    if (!m) throw new Error(`Missing manifest for dependency: ${id}`);
    for (const dep of m.dependencies ?? []) visit(dep, [...stack, id]);
    permMark.add(id);
    tempMark.delete(id);
    order.push(m);
  }

  for (const m of manifests) visit(m.name);
  for (const m of order) await loadPlugin(server, rootDir, m);
}
```

## Registration Mapping (Final Forward Phase)

- Tools: call `server.registerTool(name, { title, description, inputSchema, outputSchema, annotations }, handler)`
- Resources: for fixed URIs use `registerResource(name, uri, metadata, readCb)`, for templates use `registerResource(name, new ResourceTemplate(uriTemplate, { list, complete }), metadata, readTemplateCb)`
- Prompts: `server.registerPrompt(name, { title, description, argsSchema }, cb)`

## Notes & Behavior

- Title precedence for tools: config.title > annotations.title > name
- Use outputSchema for tools that return structuredContent; otherwise return content blocks
- Send list changed events are handled by server when using register\* helpers
- When using dependencies, load order should be a topological sort based on the declared `dependencies` graph

## Testing Plan (Expanded)

1. Unit-test manifest validation (both zod and JSON Schema) with valid/invalid samples.
2. Unit-test topo-sort on a set of manifests with dependencies and with a cycle.
3. Integration-test loading the provided `docs/examples/all-capabilities-plugin` and asserting:

- `echo` tool callable and returns echoed text
- `mcp://docs/{id}` resource returns content
- `summarize` prompt produces messages array

## Security Considerations (Updated)

- Checksums required for remote installs (lock file persists SHA256)
- Signatures optional now; recommended for production with REQUIRE_SIGNATURES
- No postinstall execution; only ESM import & controlled registration calls
- Potential future: isolated process or VM sandbox for untrusted plugins

- The permissions section is a hint only; enforce sandboxing/allowlists in host runtime
- Consider executing plugins in isolated processes if untrusted

## Structured Summary

Example summary object returned by loader / installer:

```
{
  "loaded": [ { "name": "net-utils", "version": "1.1.0", "tools": 5, "resources": 2, "prompts": 1 } ],
  "skipped": [],
  "failed": [],
  "timings": { "totalMs": 182, "validationMs": 12, "importMs": 25, "reconcileMs": 3, "registerMs": 90 },
  "stats": { "toolsRegistered": 5, "resourcesRegistered": 2, "promptsRegistered": 1, "invalidTools": 0, "warnings": 1 }
}
```

## Dynamic Operations

- `dynamicLoadModule()` remains for legacy modules; spec plugins should prefer installer pathway.
- Hot reload manager re-invokes loader and replays registrations.
- Unload currently deactivates without full deregistration (SDK limitation).

## Next Steps

- Wire this loader into the Registry manager
- Add tests loading a sample plugin with all three capability types
- Add signature checks if distributing from untrusted sources

## End-to-End Install from Marketplace (Flow)

1. Author builds a plugin package (includes mcp-plugin.json and entry file) and publishes in Marketplace.
2. Marketplace provides a ZIP (optionally with checksum/signature) for download.
3. Open Discovery installer:

- Verifies checksum (and signature if required)
- Extracts to PLUGIN_INSTALL_DIR/<name>@<version>/
- Runs manifest loader (Ajv validate → import entry → createPlugin(server) via proxy → reconcile capabilities → register)

4. Hot-reload watches entry + manifest; on change: revalidate → reconcile → re-register.

_Synced with Open Discovery commit: <ADD_COMMIT_HASH_HERE>_
