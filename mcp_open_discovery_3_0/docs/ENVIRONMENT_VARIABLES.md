# Environment Variables

This reference lists the environment variables that matter for the extracted 3.0 runtime as it exists in this repository.

The source of truth for core runtime parsing is `src/server.ts`. Plugin and packaging policy flags are also consumed by the typed plugin loader and plugin manager under `src/plugins/`.

## Core Runtime

- `NODE_ENV`
  - Default: `development`
  - Used for runtime mode selection and OAuth HTTPS expectations.

- `TRANSPORT_MODE`
  - Default: auto-detected.
  - Values: comma-separated `stdio`, `http`, `amqp`.
  - Auto-detection:
    - container: `http,amqp`
    - interactive local shell: `stdio`
    - otherwise: `stdio,http`

- `HTTP_PORT`
- `PORT`
  - Default: `6270`
  - `HTTP_PORT` wins over `PORT`.

- `HTTP_HOST`
  - Default: `0.0.0.0`

- `LOG_LEVEL`
  - Default: `info`

- `DATA_DIR`
  - Default: `data`
  - Used by the typed plugin database and other local state.

- `PLUGINS_ROOT`
  - Default: `plugins`
  - Runtime plugin root. In Docker this is typically mounted at `/home/mcpuser/plugins`.

## HTTP And OAuth

The extracted 3.0 HTTP transport exposes streamable MCP over `/mcp`, plus `/` and `/health`.

- `OAUTH_ENABLED`
  - Default: `false`

- `OAUTH_REALM`
  - Default: `mcp-open-discovery-3`

- `OAUTH_PROTECTED_ENDPOINTS`
  - Default: `/mcp`
  - Comma-separated list.

- `OAUTH_SUPPORTED_SCOPES`
  - Default: `mcp:read mcp:tools mcp:resources`
  - Space-separated list.

- `OAUTH_AUTHORIZATION_SERVER`
  - Default: unset

- `OAUTH_INTROSPECTION_ENDPOINT`
  - Default: unset

- `OAUTH_CLIENT_ID`
  - Default: unset

- `OAUTH_CLIENT_SECRET`
  - Default: unset

- `OAUTH_RESOURCE_SERVER_URI`
  - Default: `http://localhost:<HTTP_PORT>`

- `OAUTH_TOKEN_CACHE_TTL`
  - Default: `300`
  - Seconds.

## AMQP Transport

- `AMQP_ENABLED`
  - Default: `true`
  - Set to `false` to disable the AMQP transport even when selected.

- `AMQP_URL`
  - Default: `amqp://guest:guest@localhost:5672`

- `AMQP_EXCHANGE`
  - Default: `mcp-open-discovery-3.notifications`

- `AMQP_QUEUE_PREFIX`
  - Default: `mcp-open-discovery-3.discovery`

- `AMQP_PREFETCH_COUNT`
  - Default: `1`

- `AMQP_RECONNECT_DELAY`
  - Default: `5000`
  - Milliseconds.

- `AMQP_MAX_RETRY_ATTEMPTS`
  - Default: `10`

- `AMQP_MESSAGE_TTL`
  - Default: `3600000`
  - Milliseconds.

- `AMQP_QUEUE_TTL`
  - Default: `7200000`
  - Milliseconds.

- `AMQP_AUTO_RECOVERY`
  - Default: `true`

- `AMQP_RECOVERY_RETRY_INTERVAL`
- `AMQP_RETRY_INTERVAL`
  - Default: `30000`
  - `AMQP_RECOVERY_RETRY_INTERVAL` is preferred; `AMQP_RETRY_INTERVAL` is the fallback alias.

- `AMQP_RECOVERY_MAX_RETRIES`
  - Default: `-1`
  - `-1` means unlimited retries.

- `AMQP_RECOVERY_BACKOFF_MULTIPLIER`
  - Default: `1.5`

- `AMQP_EXPONENTIAL_BACKOFF`
  - Default: enabled behavior.
  - Set to `false` to force a multiplier of `1`.

- `AMQP_RECOVERY_MAX_RETRY_INTERVAL`
- `AMQP_MAX_RETRY_INTERVAL`
  - Default: `300000`
  - `AMQP_RECOVERY_MAX_RETRY_INTERVAL` is preferred; `AMQP_MAX_RETRY_INTERVAL` is the fallback alias.

## Plugin Policy And Packaging

- `REQUIRE_SIGNATURES`
- `PLUGIN_REQUIRE_SIGNED`
  - Default: `false`

- `PLUGIN_ALLOW_RUNTIME_DEPS`
  - Default: `false`

- `STRICT_CAPABILITIES`
  - Default: `false`

- `STRICT_INTEGRITY`
  - Default: `false`

- `STRICT_SBOM`
  - Default: `false`
  - This remains a policy flag for packaging workflows even though the extracted repo keeps the default suite narrow.

- `SANDBOX_AVAILABLE`
  - Default: `false`
  - Required by `sandbox-required` dependency policy.

- `PLUGIN_ALLOW_NATIVE`
  - Default: `false`
  - Allows native addon requires only when explicitly enabled.

- `SCHEMA_PATH`
  - Optional override for manifest-schema resolution.
  - Default runtime path is the repo-local schema under `docs/mcp-od-marketplace/specs/schemas/`.

- `DEBUG_REGISTRY`
  - Default: off

- `PLUGIN_TRUSTED_KEY_IDS`
  - Optional list of trusted signing-key identifiers.

- `VIBEFORGE_PUBLIC_KEY_PEM`
  - Optional public key used by plugin DB verification paths.

## Plugin Database And Marketplace

- `PLUGIN_DB_PATH`
  - Default: `<DATA_DIR>/plugin_store.db`
  - Often used by validation or isolated test runs.

- `MARKETPLACE_URL`
  - Default: unset
  - Used by marketplace-related plugin manager operations.

- `MARKETPLACE_TOKEN`
  - Default: unset

## Local Service Integration Variables

The extracted repo still includes built-in plugins that may rely on service-specific environment variables or credential-backed configuration. Keep those values repo-local and environment-specific.

Common examples used by the local Docker lab include:

- `ZABBIX_BASE_URL`
- `ZABBIX_USERNAME`
- `ZABBIX_PASSWORD`

Additional Proxmox, SNMP, or other integration-specific values should be treated as deployment-local settings, not repository defaults.

## Not Yet Carried Forward From Legacy Docs

The legacy top-level repo documented additional HTTP variables such as session TTL and Origin allowlists. Those are intentionally not listed here because the extracted 3.0 typed HTTP transport does not currently parse or enforce them as first-class runtime settings.

When that functionality is ported into `src/transports/core/streamable-http-transport.ts` and wired through `src/server.ts`, this reference should be expanded.