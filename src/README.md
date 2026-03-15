# TypeScript Migration Workspace

This tree is the portable TypeScript refactor workspace for MCP Open Discovery.

Scope for this phase:
- keep new work isolated under `src/`
- align contracts with the current server runtime and plugin schema
- preserve portability so the tree can be moved into a new repository later

Alignment notes from the marketplace review:
- `nagual69/mcp-od-marketplace` already uses TypeScript on the frontend and defines a v2 plugin manifest type in `src/types/mcp-plugin.ts`
- the marketplace builder validates and emits `mcp-plugin.json` v2 with `dist.hash`, checksums, external dependency policy, and declared capabilities
- the marketplace backend is still JavaScript, so shared contract alignment currently depends on duplicated or vendored types rather than a published package

Runtime notes from this repository:
- the local JSON schema at `docs/mcp-od-marketplace/specs/schemas/mcp-plugin.schema.v2.json` is the source of truth for field shapes and limits
- the current loader in `tools/registry/plugin_loader.js` already hard-requires `manifestVersion === "2"` even though the schema does not list it in `required`
- the new TypeScript contracts therefore follow the runtime expectation for `manifestVersion`, while keeping the rest of the shape aligned with the schema and marketplace types

Initial deliverable in this phase:
- `src/types/` contains the foundational contracts for manifests, lifecycle, signing, marketplace integration, transports, health, and tool responses
- `src/config.ts` and `src/index.ts` establish a portable entry surface for subsequent migration work