# Environment variables and settings

This document lists all environment variables used across MCP Open Discovery v2.0, grouped by subsystem, with purpose, default behavior, and quick examples.

Note: Booleans accept 1/true/yes/on (case-insensitive). Strings are used as-is.

## Core server and transports

- TRANSPORT_MODE
  - What: Comma-separated transports to start (e.g., `stdio`, `http`, `amqp`, `http,amqp`).
  - Default: Determined by runtime environment; see `tools/transports/core/transport-manager.js`.
  - Example: `TRANSPORT_MODE=http,amqp`

- HTTP_PORT / PORT
  - What: Port for HTTP transport.
  - Default: 3000 if unspecified.
  - Example: `HTTP_PORT=3000`

- OAUTH_ENABLED
  - What: Enable OAuth middleware for HTTP transport.
  - Default: false.
  - Example: `OAUTH_ENABLED=true`

- OAUTH_REALM
  - What: Realm label used by OAuth middleware.
  - Default: `mcp-open-discovery`.

- OAUTH_SUPPORTED_SCOPES
  - What: CSV list of scopes accepted by OAuth middleware.
  - Default: `mcp:read,mcp:tools,mcp:resources`.

- OAUTH_AUTHORIZATION_SERVER
  - What: Authorization server base URL (OIDC/OAuth provider).
  - Default: none; middleware skips if missing.

## AMQP transport

- AMQP_URL
  - What: AMQP broker URL (user:pass@host:port).
  - Default: `amqp://mcp:discovery@localhost:5672`.

- AMQP_QUEUE_PREFIX
  - What: Queue prefix for server/client routing.
  - Default: `mcp.discovery`.

- AMQP_EXCHANGE
  - What: Exchange base for notifications/routing.
  - Default: `mcp.notifications`.

## Registry, plugins, and security policies

Centralized boolean flags (parsed in `tools/registry/env_flags.js`):

- PLUGIN_ALLOW_RUNTIME_DEPS
  - What: Permit plugins to declare/use externalDependencies.
  - Default: false.
  - Interactions: Required for `dependenciesPolicy` of `external-allowed` or `external-allowlist` and when `sandbox-required` has externals.

- STRICT_CAPABILITIES / PLUGIN_STRICT_CAPABILITIES
  - What: Enforce declared capabilities (if schema supports) vs. captured registrations.
  - Default: false. (Note: current v2 manifest schema prohibits extra root properties; capabilities diff is logged when available.)

- STRICT_INTEGRITY
  - What: Enforce dist.checksums coverage-all semantics (error if any missing) and treat checksum issues as failures.
  - Default: false (warnings only).

- STRICT_SBOM
  - What: Require SBOM presence when declared and persist hash in lock v2; advisory otherwise.
  - Default: false.

- REQUIRE_SIGNATURES / PLUGIN_REQUIRE_SIGNED
  - What: Require plugin signature to verify against trusted keys (`mcp-plugin.sig` or `manifest.signatures[]`).
  - Default: false.
  - Details: Signed payload is the manifest v2 `dist.hash` string (e.g., `sha256:<64hex>`). The verification algorithm is taken from the signature entry; trusted keys are resolved from credentials (see PLUGIN_TRUSTED_KEY_IDS) or fallback file.

- SCHEMA_PATH
  - What: Override path to `mcp-plugin.schema.v2.json` for development/testing.
  - Default: internal bundled spec path under `docs/mcp-od-marketplace/specs/schemas/`.

- SANDBOX_AVAILABLE
  - What: Hint to sandbox detector for `sandbox-required` policy (tests and local runs).
  - Default: false; real detector may check runtime.

- PLUGINS_ROOT
  - What: Root directory for plugin store. In containers, the default writable location is `/home/mcpuser/plugins`.
  - Default resolution order: `PLUGINS_ROOT` (if set and writable) → `<home>/plugins` → `<cwd>/plugins`.

- DEBUG_REGISTRY
  - What: Enable extra registry/loader debug summaries.
  - Default: off.

Trusted signing keys:

- PLUGIN_TRUSTED_KEY_IDS
  - What: Comma/space separated credential IDs to load signing keys via credentials manager.
  - Default: none. Fallback file `tools/plugins/trusted_keys.json` is used if present.

Global allowlist:

- tools/plugins/allowlist-deps.json (file, not env)
  - What: Ops-controlled list of allowed external modules for plugins.
  - Format: `{ "dependencies": ["axios", "ws", ...] }` or simple array.
  - Enforcement: Required when `dependenciesPolicy` is `external-allowlist` or `sandbox-required` with externals; advisory warnings for `external-allowed`.

## Credentials and persistence

- MCP_CREDS_KEY
  - What: Base64 key to encrypt credentials store.
  - Default: internal key file in `data/mcp_creds_key` when running in container; unset for local dev.

## Discovery integrations

Zabbix:
- ZABBIX_BASE_URL
- ZABBIX_USERNAME
- ZABBIX_PASSWORD
  - Defaults: `http://localhost:8080`, `Admin`, `zabbix`.

SNMP/Proxmox/Nmap/etc. may have their own tool-specific vars (see respective `tools/*_tools_sdk.js`).

## Docker and deployment notes

- Always use `./rebuild_deploy.ps1` for Windows deployments.
- Container images mount a persistent volume at `/home/mcpuser/plugins`:
  - Downloads/staging at `/home/mcpuser/plugins/temp`
  - Installed plugins categorized under `/home/mcpuser/plugins/tools`, `/home/mcpuser/plugins/resources`, `/home/mcpuser/plugins/prompts`.
  - Hot reload: spec plugins are watched – changes under `<root>/dist/` or `mcp-plugin.json` trigger automatic reload via `PluginManager.reloadPlugin()`.

## Quick examples

- Enforce strict integrity and signatures with HTTP+AMQP:

  TRANSPORT_MODE=http,amqp
  HTTP_PORT=3000
  STRICT_INTEGRITY=true
  REQUIRE_SIGNATURES=true
  PLUGIN_TRUSTED_KEY_IDS=prod-signing-key-1,prod-signing-key-2

- Allow external deps with allowlist and sandbox hint:

  PLUGIN_ALLOW_RUNTIME_DEPS=true
  SANDBOX_AVAILABLE=true

- Override schema path for dev:

  SCHEMA_PATH=d:\work\schemas\mcp-plugin.schema.v2.json

## Source references

- Transport manager: `tools/transports/core/transport-manager.js`
- AMQP integration: `tools/transports/amqp-transport-integration.js`
- Plugin loader: `tools/registry/plugin_loader.js`
- Plugin manager: `tools/registry/plugin_manager.js`
- Env flags parser: `tools/registry/env_flags.js`
- OAuth integration (HTTP transport): `tools/transports/core/http-transport.js` (middleware optional)
