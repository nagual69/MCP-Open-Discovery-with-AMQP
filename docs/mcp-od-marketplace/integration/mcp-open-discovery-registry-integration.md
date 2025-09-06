# MCP Open Discovery - Registry Integration Guide

This guide shows how to integrate the MCP OD Marketplace plugin spec into the MCP Open Discovery Registry Plugin Module manager.

## Objectives

- Accept a packaged plugin containing `mcp-plugin.json` and `dist/index.js`
- Validate manifest (JSON Schema or zod)
- Load the entry module and invoke `createPlugin(server)`
- Register tools/resources/prompts against the host McpServer instance
- Respect optional `dependencies` for load ordering

## Steps

1. Validate Manifest

- Read mcp-plugin.json and validate against `docs/specs/schemas/mcp-plugin.schema.json`
- Enforce required fields: name, version, sdk, entry, capabilities
- Optional fields: permissions, metadata, dependencies (string[] of plugin IDs)

2. Resolve Entry

- Resolve `<pluginRoot>/<entry>` to a file path
- Use Node's dynamic import to load the ES module

3. Expect Runtime Contract

- The module must export `createPlugin(server)`
- Call with host McpServer instance so it can call `registerTool/registerResource/registerPrompt`

4. Optional Preflight

- Compare capabilities.\* entries to actual registrations after createPlugin completes
- Emit warnings for declared but not registered items
- If `dependencies` are declared, ensure dependents load after their dependencies; detect cycles and report errors

5. Error Handling

- Catch and report manifest errors and dynamic import failures
- Wrap createPlugin in try/catch and surface readable errors

## Example Loader (TypeScript)

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

## Registration Mapping

- Tools: call `server.registerTool(name, { title, description, inputSchema, outputSchema, annotations }, handler)`
- Resources: for fixed URIs use `registerResource(name, uri, metadata, readCb)`, for templates use `registerResource(name, new ResourceTemplate(uriTemplate, { list, complete }), metadata, readTemplateCb)`
- Prompts: `server.registerPrompt(name, { title, description, argsSchema }, cb)`

## Notes

- Title precedence for tools: config.title > annotations.title > name
- Use outputSchema for tools that return structuredContent; otherwise return content blocks
- Send list changed events are handled by server when using register\* helpers
- When using dependencies, load order should be a topological sort based on the declared `dependencies` graph

## Testing Plan

1. Unit-test manifest validation (both zod and JSON Schema) with valid/invalid samples.
2. Unit-test topo-sort on a set of manifests with dependencies and with a cycle.
3. Integration-test loading the provided `docs/examples/all-capabilities-plugin` and asserting:

- `echo` tool callable and returns echoed text
- `mcp://docs/{id}` resource returns content
- `summarize` prompt produces messages array

## Security Considerations

- The permissions section is a hint only; enforce sandboxing/allowlists in host runtime
- Consider executing plugins in isolated processes if untrusted

## Next Steps

- Wire this loader into the Registry manager
- Add tests loading a sample plugin with all three capability types
- Add signature checks if distributing from untrusted sources
