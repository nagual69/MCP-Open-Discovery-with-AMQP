# HTTP Client Compatibility

This document describes the compatibility surface of the extracted 3.0 HTTP transport as it exists today.

It is intentionally narrower than the legacy repository's broader MCP compatibility narrative. The goal here is accuracy for the typed runtime, not parity by documentation alone.

## What The 3.0 HTTP Transport Supports Today

The typed HTTP transport under `src/transports/core/streamable-http-transport.ts` currently supports:

- `POST /mcp` initialization with MCP session creation
- `GET /mcp` and `DELETE /mcp` for an existing `mcp-session-id`
- stateless JSON-RPC POST requests by auto-initializing a temporary transport when the caller omits a session ID
- a root endpoint at `/`
- a health endpoint at `/health`
- optional OAuth middleware around `/mcp`

## Practical Client Modes

### Session-Based Clients

This is the normal mode for IDEs or long-lived integrations.

1. `POST /mcp` with `initialize`
2. read the returned `mcp-session-id`
3. reuse that header on later `POST`, `GET`, and `DELETE` requests

### Stateless Clients

The extracted runtime still supports one-off JSON-RPC POST requests without an explicit initialize step.

When the request body is valid JSON-RPC and no session ID is provided, the HTTP transport creates a temporary transport, performs an internal initialize, and then handles the requested method.

That makes simple clients and ad hoc smoke tests easier to run.

## Current Limitations Compared With Legacy Root Docs

The extracted 3.0 runtime does not yet advertise the following as active typed-runtime features.

- configurable HTTP session TTL
- Last-Event-ID resumability guidance documented as a repo-local contract
- Origin allowlist validation as a documented environment-controlled behavior

Those topics existed in the legacy root documentation, but they should remain deferred from the standalone 3.0 source-of-truth docs until the typed runtime exposes them directly.

## Compatibility Guidance

### Good Fit For The Current 3.0 HTTP Transport

- local development via `npm run start:http`
- repo-local Docker usage via `npm run docker:up`
- IDE or agent integrations that keep and reuse `mcp-session-id`
- simple JSON-RPC POST clients that only need one-off calls

### Do Not Assume Yet

- automatic session expiry behavior driven by env vars
- strict Origin validation controls from the legacy doc set
- that the legacy HTTP compatibility documents are fully accurate for this extracted repo

## Recommended Next Step For Feature Parity

If full parity with the legacy HTTP compatibility surface matters for the standalone repository, port the session and Origin settings into the typed runtime first, then expand this document and the env sample together.