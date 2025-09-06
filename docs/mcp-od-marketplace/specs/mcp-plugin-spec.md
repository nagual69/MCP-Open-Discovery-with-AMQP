# MCP OD Marketplace Plugin Specification

This document defines a standardized plugin specification for MCP Open Discovery-compatible modules that bundle Tools, Resources, and Prompts using the official MCP TypeScript SDK.

Goal: Provide a manifest and package layout that the Marketplace can validate, render, and export; and the MCP Open Discovery Registry can ingest and register.

## Manifest: mcp-plugin.json

- name: unique plugin id (slug)
- version: semver
- sdk: required MCP SDK version range
- entry: path to the compiled entry module exporting a factory
- capabilities: list of items exported (tools/resources/prompts)
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

## Runtime integration contract

Entry module must export createPlugin(server: McpServer): Promise<void> | void that registers all declared capabilities. The registry should validate the manifest against the schemas, load the module, and call createPlugin(server).

## Packaging

- Node package with package.json and built JS (ES modules) compatible with Node >=18
- Include mcp-plugin.json at the package root
- Use @modelcontextprotocol/sdk as a dependency

## Error model

- Registration failures should throw errors caught by the host registry. Tools should return CallToolResult with isError true and human-readable text.

## Versioning

- Follow semver for the plugin. The sdk field pins the MCP SDK range.

## Security hints

- permissions array is non-authoritative, UI-only hints. Do not trust; enforce sandboxing at host level.
