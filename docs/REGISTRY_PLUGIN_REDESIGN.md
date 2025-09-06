# Registry Plugin Architecture — Spec-Aligned Redesign

This document defines how MCP Open Discovery loads and validates plugins produced by the MCP‑OD Marketplace, aligning with docs/mcp-od-marketplace specs and integration guide.

## Goals

- Support spec plugins with `mcp-plugin.json` + `entry` exporting `createPlugin(server)`
- Preserve legacy “tool-module” plugins (`tools[]` + `handleToolCall`)
- Enforce preflight validation (manifest, capabilities, tool schemas) before registration
- Enable secure installs: checksum/signature checks, staged zip/js validation
- Respect `dependencies` with topological sorting

## Components

- PluginManager: lifecycle, discovery, install, load, unload
- PluginLoader (new):
  - Validates manifests with AJV (`docs/mcp-od-marketplace/specs/schemas/mcp-plugin.schema.json`)
  - Imports `entry` (ESM) and calls `createPlugin(server)` using a server proxy to capture registrations
  - Optional strict capability match
- ToolValidationManager: batch validation for legacy tool-modules and for staged install sanity checks

## Lifecycle

1. Install

- From URL/file → checksum/signature verify → stage (temp dir/file)
- If zip: extract, ensure `index.js` exists, read `mcp-plugin.json`
- Prevalidate (manifest via AJV, load entry and run `createPlugin` against proxy OR legacy module tools via validation manager)
- Finalize to plugins directory only if prevalidation passes

2. Discover

- Scan plugin dirs for either:
  - Spec plugin root (directory with `mcp-plugin.json`), or
  - Single `.js` legacy plugin file

3. Load

- If spec plugin: call `loadSpecPlugin(server, root, manifest)`
- If legacy: require module, prevalidate tools, run optional `initialize()`, then set LOADED

4. Hot Reload

- Existing HotReloadManager continues to re-register legacy tools; spec plugins rely on server‑side re‑registration via `createPlugin`

## Validation

- Manifest: AJV against official schema
- Capabilities: warning if declared but not registered; optional strict mode
- Tools: use ToolValidationManager for legacy tools and staged JS plugins

## Dependency Ordering

- `dependencies` supported for spec plugins
- PluginLoader exposes `topoSortByDependencies(manifests)`; planned orchestration in PluginManager for batch loads

## Security

- Checksum/Signature verification for downloads
- Fail‑fast staging (never persist broken packages)
- Hooks available for future sandboxing/allowlist enforcement via `permissions`

## Server Integration

- Registry exposes `getServerInstance()`; PluginManager passes it to PluginLoader
- Server proxy records registered tools/resources/prompts for capability reconciliation

## Compatibility

- No breaking changes to existing registry modules or legacy plugins
- New spec path is additive and becomes the preferred plugin format

## Next Steps

- Add unit tests for manifest validation and dependencies sorting
- Add marketplace install tool flow (tool_store_install to pass checksum/signature)
- Extend Management UI to show spec vs legacy plugin types and capability summaries
