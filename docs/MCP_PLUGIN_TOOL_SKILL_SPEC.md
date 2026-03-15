# MCP Plugin Builder Skill Spec

Draft specification for the Marketplace AI skill that generates MCP plugins for end users.

## Objective

Generate a manifest-v2 MCP plugin that can be built, packaged, installed, activated, deactivated, and uninstalled by the server plugin manager without depending on the server root source tree.

## Required Inputs

- Plugin name and human-facing description.
- Tool list with exact behavior, arguments, and expected outputs.
- Runtime permissions needed: `network`, `fsRead`, `fsWrite`, `exec`.
- External dependency expectations, if any.
- Persistence model, if any: file-backed, SQLite-backed, or stateless.
- Preferred output format requirements for read/query tools.

## Skill Workflow

1. Generate `mcp-plugin.json` v2 with explicit capabilities and permissions.
2. Scaffold a standalone package under `plugins/src/<plugin>/` with `package.json`, `tsconfig.json`, `tsconfig.strict.json`, and `src/` modules.
3. Keep `src/index.ts` as a thin MCP adapter and place operational logic into package-local modules.
4. Generate Zod schemas and annotation hints for every tool.
5. Implement structured responses for every tool and `response_format` support for read/query/stat tools.
6. Build the plugin into `dist/`.
7. Vendor runtime dependencies into the packaged artifact under `dist/node_modules`, excluding host-provided packages.
8. Compute `dist.hash` using the server-compatible hash contract over the packaged `dist/` tree.
9. Package the plugin into a zip that includes `mcp-plugin.json` and `dist/`.
10. Validate install, activate, deactivate, and uninstall against the packaged zip from an extraction root outside the workspace.
11. Report any missing dependency bundling or lifecycle validation failures as blocking issues.

## Output Contract

- A standalone plugin package under `plugins/src/<plugin>/`.
- A valid `mcp-plugin.json` v2 manifest.
- Compiled `dist/` output.
- A packaged zip suitable for lifecycle validation.
- A short validation report covering build status, captured tool count, and any packaging caveats.

## Guardrails

- Do not import implementation code from the server root `src/` tree.
- Do not declare tools in the manifest that are not actually registered at runtime.
- Do not assume workspace-level `node_modules` access for Marketplace-ready artifacts.
- Do not skip lifecycle validation after a successful typecheck.
- Do not write persistent data outside configured plugin data paths.
- Do not compute the packaged manifest hash from the unbundled source `dist/` tree.

## Failure Conditions

- Manifest capabilities and captured registrations differ.
- Runtime dependencies are missing from the packaged artifact.
- The plugin requires undeclared permissions.
- The plugin cannot be installed or activated from the packaged zip in an isolated validation environment.
- Temporary validation state leaks into the real workspace database or data directories.

## Reference Patterns

- `net-utils`: network and command execution shape.
- `credentials`: file-backed secure state shape.
- `memory-cmdb`: SQLite-backed CMDB state shape.