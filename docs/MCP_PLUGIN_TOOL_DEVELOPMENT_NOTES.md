# MCP Plugin Tool Development Best Practices

Draft guide for Marketplace-facing plugin authors and for the AI workflow that generates MCP plugins.

## Scope

This guide targets plugins that are authored under `plugins/src/<plugin>/`, compiled into `dist/`, described by `mcp-plugin.json` v2, then packaged and installed through the same lifecycle used by the server plugin manager.

## Required Artifact Contract

- Treat `mcp-plugin.json` as a runtime contract, not just packaging metadata. Declared tool names must match the tools registered by `createPlugin(server)`.
- Package each plugin as a standalone unit. Do not import implementation code from the server root `src/` tree inside `plugins/src/<plugin>/src/*`.
- Keep the entrypoint thin. `src/index.ts` should only translate MCP registrations into package-local handlers.
- Preserve a stable `dist.hash` contract. In this repo the hash is computed over every sorted `dist/` file as `relativePath + '\n' + fileBytes`.

## Recommended Package Layout

- `package.json`: local build and typecheck scripts for the plugin only.
- `tsconfig.json` and `tsconfig.strict.json`: plugin-local compiler settings.
- `mcp-plugin.json`: manifest v2 declaration with permissions, capabilities, and `dist` metadata.
- `src/index.ts`: MCP SDK adapter boundary.
- `src/shared.ts`: response helpers and shared output formatting.
- `src/types.ts`: schemas, tool annotations, and typed result contracts.
- `src/<feature>.ts`: isolated operational logic such as network calls, persistence, or filesystem access.

## Tool Authoring Rules

- Register the final Marketplace/server-visible tool names directly in the typed package.
- Keep read tools and write tools explicit through annotation hints.
- Return structured content for every tool, even when the primary text output is markdown.
- Support `response_format` for read/query/statistics tools so clients can choose markdown or JSON.
- Keep response helpers package-local so the plugin remains portable.
- When integrating with external APIs, map user-visible health and status fields from the authoritative object in the response model rather than a convenient top-level shortcut. For example, Zabbix host discovery should derive availability from the primary agent interface when that is what the API actually updates.
- Preserve external identifier types exactly as declared in the tool schema and backing API contract. If an API uses numeric-looking string identifiers, keep them as strings end to end. For example, Proxmox `vmid` is intentionally a string in the schema, and callers should not coerce it to a number before detail or metrics calls.
- If prompt or resource plugins still use older SDK registration forms, keep the loader compatibility layer at the boundary instead of leaking that complexity into package-local business logic.
- If a plugin is intentionally host-coupled, isolate that dependency in a single adapter module instead of importing plugin-manager or DB code throughout the package.

## Runtime And Lifecycle Requirements

- Validate the compiled plugin through install, activate, deactivate, and uninstall. Editor diagnostics are not enough.
- Insert the plugin row before extraction records in SQLite-backed lifecycle flows; otherwise foreign keys fail.
- Resolve non-code runtime assets from compiled output, not only from source paths.
- Set temporary environment variables before importing DB or plugin-manager modules in validation scripts, or module-level environment reads will point at the real workspace state.
- Close SQLite handles before deleting temporary directories on Windows.
- Any background timers created by a plugin module must be `unref()`'d or explicitly disposed during teardown, or isolated validation can print success and still hang at process exit.

## Packaging And Dependency Rules

- Compile the plugin before packaging and verify the packaged zip, not only the source tree.
- Capabilities declared in the manifest should be compared to captured registrations during activation.
- Packaged artifacts should vendor runtime dependencies under `dist/node_modules` so the extracted plugin can resolve them without workspace-level `node_modules` fallback.
- Keep source manifests and packaged manifests conceptually separate when necessary. In this repo, source manifests continue to reflect the source `dist/` tree, while the ZIP manifest is emitted from a staged, dependency-vendored `dist/` tree.
- Validate packaged plugins from an extraction root outside the workspace so module resolution cannot silently fall back to the repo root.

## Current Reference Implementations

- `net-utils`: command and network-heavy tools with structured read responses.
- `credentials`: file-backed and encryption-backed stateful tools.
- `memory-cmdb`: SQLite-backed stateful tools and CMDB query patterns.
- `prompts`: prompt-only plugin shape with no tools and capability-aware lifecycle validation.
- `nmap`: external-command execution plugin shape with packaging-safe runtime dependencies.
- `proxmox`: credential-backed HTTPS API plugin shape with package-local credential decryption and read-only cluster discovery tools.
- `zabbix`: env-backed JSON-RPC API plugin shape with package-local client/session reuse.
- `marketplace`: host-coupled administrative plugin shape with a package-local adapter for plugin-manager and plugin-db access.
- `registry-tools`: host-coupled lifecycle-control plugin shape with package-local adapters for activation, update, audit, and trusted-key operations.

## Validation Checklist

- Build the plugin package locally.
- Rebuild blessed plugin zips so `dist.hash` and zip contents stay aligned.
- Run lifecycle validation against the packaged zip.
- Confirm the captured tools, resources, and prompts match `mcp-plugin.json` capabilities.
- Verify any persistent state is created only inside the intended temp or data directory.
- Validate representative live data shapes from the backing API, not just happy-path field names. Interface-level or nested status fields can differ from host-level summaries and silently skew MCP output.
- Validate argument types with live calls, especially when identifiers look numeric. A schema can correctly require `string` while ad hoc tests accidentally send a number and misdiagnose the plugin.

## Known Gaps

- The current builder vendors whole dependency trees, which is correct but not yet size-efficient.
- Source-root development and direct directory installs still assume workspace dependencies are available unless a packaged artifact is used.
- A Marketplace publishing pipeline should eventually produce a more explicit bundled dependency manifest instead of relying only on import scanning and recursive package copying.
- Credential-backed API plugins still need a cleaner reusable package-local auth/client pattern so future conversions do not keep re-implementing secure store adapters.
- The typed host plugin manager still does not expose install-time checksum or signature override inputs that the legacy marketplace surface advertised.