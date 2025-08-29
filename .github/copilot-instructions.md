# MCP Open Discovery v2.0 — AI Agent Guide (Current)

Use this to get productive fast in this repo. It reflects the code that’s here now.

## Architecture at a glance

- Server: `mcp_open_discovery_server.js` creates a single `McpServer`, registers tools/resources/prompts, then starts transports via `tools/transports/core/transport-manager.js`.
- Registry & hot‑reload: `tools/registry/index.js` (CoreRegistry + HotReloadManager + mcp‑types adapter). Modules export `{ tools, handleToolCall }`; the registry calls `server.registerTool(...)` for you.
- Transports:
  - stdio: `tools/transports/core/stdio-transport.js`
  - HTTP: `tools/transports/core/http-transport.js` (health endpoint, optional OAuth)
  - AMQP: `tools/transports/amqp-transport-integration.js` (server wrapper using AMQP; base in `tools/transports/base-amqp-transport.js`)
- Data & security:
  - CMDB/Memory (SQLite + encryption): `tools/memory_tools_sdk.js`
  - Credentials (encrypted + audit): `tools/credentials_tools_sdk.js`, `tools/credentials_manager.js`
  - Discovery tools: `tools/{network,nmap,snmp,proxmox,zabbix}_tools_sdk.js`

## Run & test (Windows/PowerShell)

- Docker (preferred): `./rebuild_deploy.ps1`
- Local dev (Node >= 23): `npm start` (defaults via `TRANSPORT_MODE`).
  - Scripts: `start-stdio`, `start-http`, `start-amqp`, `start-http-amqp`, `start-all`
- Health: `npm run health` → http://localhost:3000/health
- Useful tests/examples (see `testing/`):
  - `node testing/test_container_health.js`
  - `node testing/audit_mcp_compliance.js`
  - `node testing/test_mcp_bidirectional_routing.js`
  - `node testing/test_direct_sdk_registration.js`

## Tool module pattern (what to implement)

- File: `tools/<category>_tools_sdk.js`
- Export:
  - `tools: [{ name, description, inputSchema, annotations? }]` (Zod or JSON Schema supported)
  - `async function handleToolCall(name, args)` — switch by `name` and return a structured object
- Do NOT call `server.registerTool` in modules. Registration is centralized in `tools/registry/index.js`.
- Return plain objects when convenient; the registry wraps to MCP `content` when needed.

## Registry & hot‑reload controls

- Manage at runtime via `tools/registry_tools_sdk.js`:
  - `registry_get_status`, `registry_list_modules`, `registry_load_module`, `registry_reload_module`, `registry_toggle_hotreload`, `registry_reregister_module`
- Schema adapter: `tools/registry/mcp_types_adapter.js` converts Zod/JSON Schema into SDK‑compatible shapes.

## Conventions that matter

- CMDB keys: `ci:type:identifier` (e.g., `ci:host:192.168.1.10`).
- Credentials: use `credentials_*` tools; many discovery tools accept optional `creds_id`.
- Transports: integrate via `transport-manager.js` only; don’t couple transports directly to the server.

## Integration notes

- Nmap runs with capability‑based security in Docker (no root). Review caps in `docker-compose.yml`.
- SNMP via `net-snmp`; Proxmox/Zabbix via HTTP APIs. See respective `*_tools_sdk.js` files for parameter shapes.
- AMQP transport lives behind `amqp-transport-integration.js`. If you adjust it, keep lifecycle SDK‑compatible (idempotent `start()`, proper `send()`, and message callbacks wired).

## Key files quick list

- Server: `mcp_open_discovery_server.js` (see `createMcpServer`, `startAllTransports`)
- Transport manager: `tools/transports/core/transport-manager.js`
- Registry internals: `tools/registry/{index.js,core_registry.js,hot_reload_manager.js,tool_validation_manager.js,mcp_types_adapter.js}`
- Tool modules: `tools/*.js` ending with `_tools_sdk.js`

If anything here seems off (e.g., a script path or transport behavior), flag it and we’ll tighten this guide.

# MCP Open Discovery v2.0 - AI Coding Agent Instructions

## 🏆 Project Overview

**MCP Open Discovery v2.0** is a production-ready infrastructure discovery platform built on the official Model Context Protocol (MCP) SDK with **93% tool success rate** across 57 enterprise-grade tools. This system provides comprehensive network discovery, SNMP monitoring, Proxmox virtualization management, and CMDB functionality.

**Critical Architecture Facts:**

- **Main Entry Point**: `mcp_server_multi_transport_sdk.js` - Multi-transport MCP server supporting both stdio and HTTP
- **Tool Registry**: `tools/sdk_tool_registry.js` - Centralized tool registration with category-based organization
- **SQLite CMDB**: Enterprise-grade encrypted persistent memory system with automatic backups
- **Container-First**: Production Docker deployment with capability-based security (no root required)

## 🎯 Core Architecture Patterns

### Multi-Transport MCP Server Architecture

The main server (`mcp_server_multi_transport_sdk.js`) implements multi-transport support using the official MCP SDK:

```javascript
// Core pattern for transport detection
const CONFIG = {
  transports: {
    stdio: { enabled: true },
    http: { enabled: isRunningInContainer(), port: 3000 },
  },
};

// Tool registration pattern
await registerAllTools(server);
await server.connect(transport);
```

**Key Implementation Rules:**

- Always use official MCP SDK (`@modelcontextprotocol/sdk`)
- Support both stdio and HTTP transports
- Auto-detect container environment for transport selection
- Use centralized tool registry pattern

### Tool Development Patterns

All tools follow the SDK-compatible pattern in `tools/*_sdk.js`:

```javascript
/**
 * Tool Category: [Network|Memory|SNMP|Proxmox|NMAP] Tools SDK
 * MCP SDK Compatible Tool Implementation
 */

const tools = [
  {
    name: "tool_name",
    description: "Clear, actionable description",
    inputSchema: {
      type: "object",
      properties: {
        /* Zod-compatible schema */
      },
      required: ["required_param"],
    },
  },
];

async function handleToolCall(name, args) {
  switch (name) {
    case "tool_name":
      return await executeToolLogic(args);
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

module.exports = { tools, handleToolCall };
```

**Tool Development Rules:**

- Use descriptive names with category prefixes (e.g., `snmp_device_inventory`)
- Include comprehensive Zod schemas for all parameters
- Implement proper error handling with descriptive messages
- Return structured data objects, not raw strings
- Follow the modular pattern with tools array and handleToolCall function

### Tool Registry System

Central registration in `tools/sdk_tool_registry.js`:

```javascript
const toolModules = [
  { module: require("./memory_tools_sdk"), category: "Memory" },
  { module: require("./network_tools_sdk"), category: "Network" },
  // ... other modules
];

async function registerAllTools(server) {
  for (const { module, category } of toolModules) {
    registerToolsFromModule(server, module, category);
  }
}
```

**Registration Rules:**

- Always register new tools through the central registry
- Use category-based organization
- Ensure proper error handling during registration
- Maintain alphabetical order in tool modules array

### SQLite Memory Persistence

The memory system (`tools/memory_tools_sdk.js`) uses SQLite with encryption:

```javascript
// Enterprise-grade CMDB with relationships
const memorySchema = {
  ci_items: "id, key, value, parent_key, created_at, updated_at",
  ci_relationships: "parent_key, child_key, relationship_type, created_at",
};

// Auto-save pattern for persistence
setInterval(async () => {
  await saveMemoryToDatabase();
}, 30000); // Every 30 seconds
```

**Memory System Rules:**

- Use hierarchical CI (Configuration Item) keys: `ci:type:identifier`
- Implement parent-child relationships for infrastructure mapping
- Enable encryption for sensitive data storage
- Provide both in-memory and persistent storage options
- Support incremental updates and merging

## 🔧 Development Workflows

### Adding New Tool Categories

1. **Create SDK Tool Module** (`tools/new_category_tools_sdk.js`):

   ```javascript
   const tools = [
     /* tool definitions */
   ];
   async function handleToolCall(name, args) {
     /* implementation */
   }
   module.exports = { tools, handleToolCall };
   ```

2. **Register in Tool Registry** (`tools/sdk_tool_registry.js`):

   ```javascript
   { module: require('./new_category_tools_sdk'), category: 'NewCategory' }
   ```

3. **Update Documentation**:
   - Add to README.md tool count and categories
   - Document in appropriate docs/ files
   - Update testing documentation

### Docker Deployment Pattern

Use the standardized `rebuild_deploy.ps1` PowerShell script:

```powershell
# Always use this script for deployments
.\rebuild_deploy.ps1
```

**Deployment Rules:**

# MCP Open Discovery v2.0 — AI Agent Instructions (Concise)

Use this guide to be productive immediately in this repo. It reflects the current code, not aspirations.

## Architecture map (what matters)

- Main server: `mcp_open_discovery_server.js` creates a single `McpServer`, registers tools/resources/prompts, then starts transports via `tools/transports/core/transport-manager.js`.
- Tool registry & hot‑reload: `tools/registry/index.js` (CoreRegistry + HotReloadManager). All tool modules export `{ tools, handleToolCall }` and are registered via SDK `server.registerTool(...)` with a Zod/raw-shape adapter.
- Transport layer:
  - HTTP: `tools/transports/core/http-transport.js` (health endpoint, optional OAuth).
  - stdio: `tools/transports/core/stdio-transport.js`.
  - AMQP: `tools/transports/amqp-transport-integration.js` (wraps server transport). Critical compliance notes below.
- Data & security:
  - Memory/CMDB (SQLite, encrypted): `tools/memory_tools_sdk.js`.
  - Credentials (encrypted + audit): `tools/credentials_tools_sdk.js` and `tools/credentials_manager.js`.
  - Discovery integrations: `tools/{network,nmap,snmp,proxmox,zabbix}_tools_sdk.js`.

## Run, build, test (Windows/PowerShell)

- Docker deploy (preferred): always use `./rebuild_deploy.ps1`.
- Local dev (Node >= 23):
  - `npm start` (uses `mcp_open_discovery_server.js`).
  - Transport selection via `TRANSPORT_MODE=stdio|http|amqp` or comma‑separated. Scripts: `start-stdio`, `start-http`, `start-amqp`, `start-all`.
- Health: `npm run health` → http://localhost:3000/health.
- Tests/examples (see `testing/`): `node testing/test_container_health.js`, `testing/audit_mcp_compliance.js`, `testing/test_mcp_bidirectional_routing.js`, `testing/test_direct_sdk_registration.js`.

## Tool module pattern (do this)

- File name: `tools/<category>_tools_sdk.js`.
- Export:
  - `tools: [{ name, description, inputSchema, annotations? }]` where `inputSchema` can be Zod or plain JSON Schema.
  - `async function handleToolCall(name, args)` switch by name and return an object; the registry wraps plain objects into MCP `content` when needed.
- Registration is centralized by `registerAllTools(server)` in `tools/registry/index.js`; do not register directly in modules.
- Use descriptive names with category prefixes (e.g., `snmp_device_inventory`, `nmap_tcp_connect_scan`).

## Registry & hot‑reload ops (at runtime)

- Tools for dynamic control live in `tools/registry_tools_sdk.js`:
  - `registry_get_status`, `registry_list_modules`, `registry_load_module`, `registry_reload_module`, `registry_toggle_hotreload`, `registry_reregister_module`.
- The registry converts Zod/JSON schemas to SDK‑compatible shapes (`tools/registry/mcp_types_adapter.js`) for spec compliance.

## Integration specifics

- Nmap: capability‑based security in Docker (no root). Review `docker-compose.yml` caps for NET\_\*.
- SNMP (`net-snmp`), Proxmox (HTTP API), Zabbix (HTTP API). Credentials come from the encrypted store; many tools accept optional `creds_id`.

## AMQP transport caveat (keep it compliant)

- Problem: initialize responses not sent because transport lifecycle violates MCP SDK contract.
- Fix scope/files: `tools/transports/amqp-server-transport.js`, `tools/transports/amqp-transport-integration.js`, `tools/transports/base-amqp-transport.js`.
- Requirements:
  - Let SDK call `transport.start()` (idempotent); remove manual pre‑start.
  - Ensure callbacks (`onmessage|onerror|onclose`) are wired so SDK processes messages.
  - `send(message)` must transmit JSON‑RPC responses; verify initialize goes out.
- Success check: VS Code connects over AMQP → receives `initialize` response → `tools/list` and `tools/call` work end‑to‑end.

### AMQP exchanges, queues, and routing keys (actual names)

- Env defaults:
  - `AMQP_URL` (e.g., amqp://mcp:discovery@rabbitmq:5672)
  - `AMQP_QUEUE_PREFIX` = `mcp.discovery`
  - `AMQP_EXCHANGE` = `mcp.notifications`
- Exchanges:
  - Base notifications: `AMQP_EXCHANGE` (topic, durable)
  - MCP bidirectional routing: `${AMQP_EXCHANGE}.mcp.routing` (topic, durable)
  - Heartbeat: `mcp.heartbeat` (fanout, non‑durable) — used by integration health checks
- Queues:
  - Legacy requests: `${AMQP_QUEUE_PREFIX}.requests`
  - Server per‑session request: `${AMQP_QUEUE_PREFIX}.requests.${sessionId}` (exclusive, autoDelete; x-message-ttl=messageTTL; x-expires=queueTTL)
  - Server per‑session response: `${AMQP_QUEUE_PREFIX}.responses.${sessionId}` (exclusive, autoDelete)
  - Client response queue: auto‑generated exclusive queue (assertQueue(''))
- Routing keys & bindings:
  - Client publish (requests): `mcp.request.<category>.<method>` — category from method prefix (nmap|snmp|proxmox|zabbix|network|memory|credentials|registry|general)
  - Server request bindings: `${sessionId}.*`, `mcp.request.#`, `mcp.tools.#`, `mcp.resources.#`, `mcp.prompts.#`, and direct `${sessionId}.${streamId}.requests`
  - Client notification subscriptions: `mcp.notification.#`, `mcp.event.#`, `discovery.notification.#`, `discovery.event.#`
  - Server notification routing (producer): `discovery.<category>` where category is derived from method (`nmap|snmp|proxmox|zabbix|network|memory|credentials|general`)

### Override AMQP names via environment (Windows/PowerShell)

- Local run overrides:

```powershell
$env:AMQP_EXCHANGE = "my.notifications"
$env:AMQP_QUEUE_PREFIX = "my.discovery"
$env:TRANSPORT_MODE = "http,amqp"
npm start
```

- Container deploy (preferred): update env in `docker/docker-compose-amqp.yml` (or a `.env` file) and run:

```powershell
./rebuild_deploy.ps1
```

### Enable OAuth on HTTP transport (overrides)

- Quick start (uses existing npm script):

```powershell
npm run start-oauth
```

- Manual overrides for local runs:

```powershell
$env:TRANSPORT_MODE = "http"
$env:OAUTH_ENABLED = "true"
$env:OAUTH_REALM = "mcp-open-discovery"
$env:OAUTH_PROTECTED_ENDPOINTS = "/mcp"   # comma-separated if multiple
# Optional extras consumed by transport manager
$env:OAUTH_SUPPORTED_SCOPES = "mcp:read,mcp:tools,mcp:resources"
$env:OAUTH_AUTHORIZATION_SERVER = "https://auth.example.com/realms/mcp"
npm start
```

- Container deploy: set the same env vars in `docker/docker-compose-amqp.yml` (or a `.env`), then run:

```powershell
./rebuild_deploy.ps1
```

Notes:

- If `tools/transports/core/oauth-middleware` isn’t available, the server logs “OAuth middleware not available” and continues without OAuth.
- Protected endpoints default to `/mcp`. Keep `/health` public for liveness checks.

## File references you’ll use most

- Server: `mcp_open_discovery_server.js` (see `createMcpServer`, `startAllTransports`).
- Transport manager: `tools/transports/core/transport-manager.js` (env detection, mode parsing, startup/shutdown orchestration).
- Tool modules: `tools/*.js` ending with `_sdk.js` (network, nmap, snmp, proxmox, zabbix, memory, credentials, registry, prompts).
- Registry internals: `tools/registry/{index.js,core_registry.js,hot_reload_manager.js,tool_validation_manager.js,mcp_types_adapter.js}`.

## Conventions

- Return structured objects; simple objects are wrapped to MCP `content` automatically in the registry handler.
- Use hierarchical CMDB keys like `ci:type:identifier` in memory tools.
- Keep new transports integrated via the transport manager; don’t couple transports directly to the server.

Feedback: If anything here is unclear or you find a mismatch (e.g., missing test script), call it out so we can tighten these instructions.

- Session management with correlation IDs
- Tool registry integration (57 tools available)
- Container deployment infrastructure

### **Broken Components** ❌:

- Transport interface contract compliance
- SDK integration and lifecycle management
- Initialize response transmission
- VSCode client integration
- Capability negotiation flow

### **Immediate Next Action**:

**Start with Task 1.1**: Fix AMQP server transport interface to be SDK-compatible. This is the critical blocking issue preventing VSCode integration.

---

## �💡 Quick Reference

**Start Development**: `npm start` or `.\rebuild_deploy.ps1`
**Test Tools**: `npm run test` or individual test files
**Check Health**: `npm run health` or `http://localhost:3000/health`
**View Logs**: `docker-compose logs -f mcp-server`
**Debug Tools**: Use `testing/test_container_tools.js` for tool validation

Remember: This is a production-ready infrastructure discovery platform. Maintain the high quality standards and comprehensive testing that have achieved 93% success rate across 57 enterprise tools.
