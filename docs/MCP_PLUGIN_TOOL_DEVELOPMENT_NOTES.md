# MCP Plugin Tool Development Notes

Verified findings to use later for a best-practices guide and Marketplace build skill.

## Artifact Contract

- Plugin packaging and server verification must use the same dist hash contract. In this repo that is currently `relativePath + '\n' + fileBytes` over all sorted `dist/` files.
- A plugin package should be buildable as a standalone unit. Avoid imports from the server's root `src/` tree inside `plugins/src/<plugin>/src/*`.
- Validation needs to happen against the compiled plugin entry and the packaged zip, not just editor diagnostics.

## Runtime And Lifecycle

- Install order matters in the plugin manager: insert the plugin row before saving extraction records or SQLite foreign keys will fail.
- Compiled runtime paths need non-code assets resolved explicitly. `schema.sql` must be reachable from compiled DB code, not only source paths.
- Validation scripts should set temp environment variables before importing DB or plugin-manager modules, otherwise module-level env reads will point at the real workspace DB.
- SQLite-backed validation needs explicit DB teardown before deleting temp directories on Windows.

## Packaging Risks

- Current blessed plugin zips are not fully self-contained for external dependency resolution. The rebuilt `net-utils` zip still required workspace-local `node_modules` access for `zod` during activation.
- That means the current blessed-plugin path is good for typed lifecycle validation inside the workspace, but it does not yet satisfy the stronger marketplace requirement that frontend-built plugins ship with needed dependencies.

## Authoring Pattern

- Keep a thin MCP SDK adapter boundary in `src/index.ts`; keep tool logic and response helpers in package-local modules.
- Prefer package-local shared helpers such as `shared.ts`, `types.ts`, and feature-specific tool/store modules.
- Treat `mcp-plugin.json` capability declarations as part of the runtime contract. Build outputs should be checked against them during activation and packaging.
- The first two verified standalone typed-package migrations are `net-utils` and `credentials`. That gives two reusable reference shapes: command/network-heavy tools and file/encryption-backed stateful tools.