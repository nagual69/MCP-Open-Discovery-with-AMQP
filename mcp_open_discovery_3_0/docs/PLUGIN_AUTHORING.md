# Plugin Authoring And Packaging

This guide covers the authoring model that the standalone 3.0 repository expects for typed built-in or marketplace-ready plugins.

The emphasis is the same as the rest of the extraction: package plugins as self-contained typed units that do not depend on the legacy JS host.

## Source Layout

Use a package-local layout under `plugins/src/<plugin>/`.

Recommended structure:

- `plugins/src/<plugin>/package.json`
- `plugins/src/<plugin>/tsconfig.json`
- `plugins/src/<plugin>/tsconfig.strict.json`
- `plugins/src/<plugin>/mcp-plugin.json`
- `plugins/src/<plugin>/src/index.ts`
- package-local helper modules under `src/`

## Authoring Rules

- keep `src/index.ts` thin
- register the final tool, resource, or prompt names directly from the typed package
- keep operational logic package-local
- do not import server-root implementation code into plugin business logic
- if a plugin is intentionally host-coupled, isolate that dependency behind one adapter module
- return structured content for tool calls
- support `response_format` for read-oriented tools when practical

## Packaging Rules

- build the plugin before packaging
- compute and maintain `dist.hash` against the packaged `dist/` tree
- vendor runtime dependencies into the packaged artifact when the plugin needs them
- keep the manifest capabilities aligned with what the plugin actually registers
- validate the packaged artifact, not only the source tree

The repo-local packaging helper is:

- `plugins/scripts/build-blessed-plugins.js`

The schema contract lives at:

- `docs/mcp-od-marketplace/specs/schemas/mcp-plugin.schema.v2.json`

## Validation Expectations

Use the repo-local validation commands to verify lifecycle behavior.

- `npm run validate:typed-plugin-manager`
- `npm run validate:typed-plugin:<plugin>`

Validation should cover:

- install
- activate
- deactivate
- uninstall
- capability capture
- packaged dependency resolution

## Policy Flags That Matter

These flags shape the runtime acceptance rules for packaged plugins.

- `PLUGIN_ALLOW_RUNTIME_DEPS`
- `REQUIRE_SIGNATURES`
- `PLUGIN_REQUIRE_SIGNED`
- `STRICT_CAPABILITIES`
- `STRICT_INTEGRITY`
- `STRICT_SBOM`
- `SANDBOX_AVAILABLE`
- `PLUGIN_ALLOW_NATIVE`

See `docs/ENVIRONMENT_VARIABLES.md` for the current 3.0 runtime view of those settings.

## Current Reference Shapes

The extracted repository already contains several verified typed plugin shapes under `plugins/src/`.

- command and network-backed tools
- credential-backed API plugins
- SQLite-backed stateful plugins
- prompt-only plugins
- host-coupled administrative plugins

Use those existing plugin packages as the first reference point before adding new patterns.

## What Not To Copy Forward

Do not write new 3.0 plugins against the old `tools/*.js` host shape as a default path.

Compatibility shims may still exist during extraction, but new plugin work should treat the typed plugin packages and typed plugin manager as the primary target.