# MCP OD Marketplace Plugin Specification

This document defines a standardized plugin packaging for MCP Open Discovery-compatible modules that can bundle Tools, Resources, and Prompts using the official MCP TypeScript SDK.

Goal: Provide a manifest and package layout that the Marketplace can validate, render, and export; and the MCP Open Discovery Registry can ingest and register.

See also:

- Tools: ./mcp-spec-tools.md
- Prompts: ./mcp-spec-prompts.md
- Resources: ./mcp-spec-resources.md

## Manifest: mcp-plugin.json

- name: unique plugin id (slug)
- version: semver
- sdk: required MCP SDK version range
- entry: path to the compiled entry module exporting a factory
- capabilities: declarative list of items exported (tools/resources/prompts) used for preflight reconciliation
- permissions: hints for client review
- metadata: display data

Example:
{
"name": "net-utils",
"version": "1.0.0",
"sdk": "^1.2.0",
"entry": "dist/index.js",
"capabilities": {
"tools": [
{
"name": "ping",
"title": "Ping Host",
"description": "ICMP-like ping via child process or dns",
"inputSchema": {
"host": { "type": "string" },
"count": { "type": "number", "minimum": 1, "maximum": 10 }
},
"outputSchema": {
"rttMs": { "type": "number" },
"loss": { "type": "number" }
},
"annotations": { "readOnlyHint": true, "openWorldHint": true }
}
],
"resources": [
{
"name": "dns-record",
"title": "DNS Record",
"uriTemplate": "dns://{domain}",
"metadata": { "description": "DNS records as resources" }
}
],
"prompts": [
{
"name": "net-diagnose",
"title": "Network Diagnosis",
"description": "Create a diagnostic prompt"
}
]
},
"permissions": [
{ "id": "network", "reason": "Performs DNS/HTTP lookups" }
],
"metadata": {
"displayName": "Network Utilities",
"author": "Acme",
"homepage": "https://example.com"
}
}

## Runtime Integration Contract

Entry module MUST export `createPlugin(server: McpServer): Promise<void> | void` that registers all declared capabilities.

Load sequence:
1. Validate manifest via Marketplace JSON Schema (Ajv).
2. Import entry module (ESM) and locate `createPlugin` (named or default.createPlugin).
3. Execute with a proxy server to CAPTURE registrations (tools/resources/prompts) without committing.
4. Reconcile captured vs manifest.capabilities.* (warn or throw with STRICT_CAPABILITIES).
5. Optional: batch tool validation (STRICT_TOOLS) via validation manager.
6. Forward (final register) each captured item to the real server instance.
7. Emit structured summary for logs / API.

If any blocking errors occur (schema invalid, missing createPlugin, dependency cycle, strict mismatch) the plugin load fails atomically.

## Packaging

- Node package with package.json and built JS (ES modules) compatible with Node >=18
- Include `mcp-plugin.json` at the package root
- Use @modelcontextprotocol/sdk as a dependency

## Dependency Graph

Optional `dependencies: string[]` referencing other plugin names. Loader performs topological sort and aborts with a cycle chain (`A -> B -> C -> A`).

## Error Model

- Registration failures should throw errors caught by the host registry. Tools should return CallToolResult with isError true and human-readable text.

## Structured Summary (Loader Output)

```
{
	loaded: [ { name, version, tools, resources, prompts, path } ],
	skipped: [ { name, reason } ],
	failed:  [ { name, error } ],
	timings: { totalMs, validationMs, importMs, reconcileMs, registerMs },
	stats: { toolsRegistered, resourcesRegistered, promptsRegistered, invalidTools, warnings }
}
```

Fields may expand; consumers should treat unknown keys as forward-compatible.

## Lock File

Installers persist `install.lock.json` with `{ name, version, sourceUrl?, sha256, signature?, installedAt }` enabling audit & integrity checks.

## Versioning

- Follow semver for the plugin. The sdk field pins the MCP SDK range.

## Security Hints

- `permissions` array is non-authoritative; enforce sandboxing and allowlists separately.
- Checksums required; signatures optional unless `REQUIRE_SIGNATURES=true`.
- No postinstall scripts executed; only ESM import + controlled registration API.

_Spec synchronized with Open Discovery commit: <ADD_COMMIT_HASH_HERE>_
