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

- MCP_SESSION_TTL_MS
  - What: Session time-to-live in milliseconds for HTTP transport (optional). When set, sessions automatically expire after inactivity. Supports 2025-11-25 SSE resumability with Last-Event-ID reconnection.
  - Default: -1 (disabled; sessions persist until explicit DELETE, per MCP 2025-03-26 spec)
  - Set to: 600000 for 10-minute TTL, 300000 for 5-minute TTL, etc.
  - Example: `MCP_SESSION_TTL_MS=600000` (enables 10-minute TTL for 2025-11-25 compliance)
  - Backward Compatibility: Defaults to -1 to match 2025-03-26 spec (ServiceNow, legacy clients). ServiceNow can keep sessions alive indefinitely until explicit DELETE.
  - 2025-11-25 Mode: Set `MCP_SESSION_TTL_MS=600000` for automatic expiration + SSE resumability.

- MCP_SSE_RETRY_MS
  - What: Retry interval in milliseconds sent to clients via SSE retry field. Clients should wait this duration before attempting reconnection.
  - Default: 3000 (3 seconds).
  - Example: `MCP_SSE_RETRY_MS=5000`
  - Compliance: MCP 2025-11-25 transport spec requirement for SSE polling.

- MCP_VALIDATE_ORIGIN
  - What: Enable Origin header validation for HTTP transport (DNS rebinding attack prevention).
  - Default: true.
  - Security: MUST respond with 403 Forbidden for invalid Origin headers per MCP 2025-11-25 specification.
  - Example: `MCP_VALIDATE_ORIGIN=false` (not recommended for production)

- MCP_ALLOWED_ORIGINS
  - What: Comma-separated list of allowed Origin values when MCP_VALIDATE_ORIGIN is true.
  - Default: `http://localhost,http://127.0.0.1`.
  - Example: `MCP_ALLOWED_ORIGINS=http://localhost,https://app.example.com,https://studio.example.com`
  - Security: Protects against DNS rebinding attacks; always bind to localhost in development.

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

- PLUGIN_ALLOW_NATIVE
  - What: Allow native addon (`.node`) requires in plugins.
  - Default: false. When false, native requires are blocked during createPlugin() and flagged by static scan.

- PLUGINS_ROOT
  - What: Root directory for plugin store. In containers, the default writable location is `/home/mcpuser/plugins`.
  - Layout: Categorized installs under `<PLUGINS_ROOT>/{tools,resources,prompts}`. Default category for installs is `tools`.
  - Default resolution order: `PLUGINS_ROOT` (if set) → internal default at `tools/plugins`.

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
  - Format: simple array `["axios", "ws"]`, or `{ "dependencies": [ ... ] }`, or legacy `{ "allow": [ ... ] }`.
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
- HTTP transport (session TTL, Origin validation): `tools/transports/core/http-transport.js`
- AMQP integration: `tools/transports/amqp-transport-integration.js`
- Plugin loader: `tools/registry/plugin_loader.js`
- Plugin manager: `tools/registry/plugin_manager.js`
- Env flags parser: `tools/registry/env_flags.js`
- OAuth integration (HTTP transport): `tools/transports/core/http-transport.js` (middleware optional)

## MCP 2025-11-25 Compliance

The HTTP transport implements the following requirements from the [MCP specification 2025-11-25](https://modelcontextprotocol.io/specification/2025-11-25):

- **Session Management** (Section 2.5): Session IDs in `MCP-Session-Id` header; 404 response for expired sessions
- **SSE Resumability** (Section 2.4): Event IDs and `Last-Event-ID` header support for reconnection
- **SSE Polling** (SEP-1699): Server-initiated disconnection with `retry` field; clients reconnect within TTL
- **Origin Validation** (Security Warning 2.0.1): MUST respond 403 Forbidden for invalid Origin headers
- **Protocol Version Header** (Section 2.7): `MCP-Protocol-Version` header tracked per session
- **Stateless Requests**: One-off requests without session management for simple clients
