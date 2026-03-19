# Transport Architecture

This document describes the transport model used by the extracted TypeScript-first runtime in this repository.

The source of truth is:

- `src/server.ts`
- `src/transports/core/transport-manager.ts`
- `src/transports/core/streamable-http-transport.ts`
- `src/transports/amqp/amqp-transport.ts`

## Design Summary

The runtime creates one MCP server instance and starts one or more transports around it.

- one server instance
- multiple transport adapters
- shared plugin registry and capabilities
- shared logging and shutdown handling

That avoids the legacy failure mode where each transport effectively behaved like its own server host.

## Startup Flow

1. `src/main.ts` builds the app config and calls `runServerAsMain()`.
2. `src/server.ts` parses environment variables and creates the `McpServer` instance once.
3. The typed plugin registry initializes and bootstraps built-in plugins.
4. `startConfiguredTransports()` starts the enabled transports around that same server.
5. Process handlers manage graceful shutdown for `SIGINT`, `SIGTERM`, uncaught exceptions, and unhandled rejections.

## Transport Modes

### stdio

Used for CLI-style integrations and local agent workflows.

### HTTP

Uses the streamable HTTP transport from the MCP SDK and exposes:

- `/`
- `/health`
- `/mcp`

The current implementation supports session-based MCP calls and stateless JSON-RPC POST auto-initialization.

### AMQP

Uses the typed AMQP runtime adapter and participates in the same server lifecycle as the other transports.

The transport is configured from the same app config object built in `src/server.ts`.

## Transport Auto-Selection

If `TRANSPORT_MODE` is unset, the runtime chooses a default based on the environment.

- container: `http,amqp`
- interactive shell: `stdio`
- otherwise: `stdio,http`

## Health Model

The HTTP health endpoint is assembled by the transport manager and includes:

- service status
- runtime version string
- plugin registry stats
- uptime and timestamp
- OAuth config snapshot
- AMQP status snapshot when available

## OAuth Integration

OAuth is optional and applied at the HTTP transport boundary.

When enabled, the runtime wires:

- middleware around `/mcp`
- protected resource metadata endpoints
- authorization-server discovery redirect support when configured

## Current Boundaries

The extracted transport stack is intentionally narrower than the broader legacy documentation set.

Current 3.0 docs should assume:

- typed HTTP transport is the source of truth for HTTP behavior
- typed AMQP transport is the source of truth for AMQP behavior
- repo-local package scripts and Docker files are the deployment contract

Do not treat legacy-root transport narratives as authoritative unless the same behavior is visible in the typed source tree.