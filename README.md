# MCP Open Discovery

<div align="left">
  <img src="./mcp-open-discovery-logo.png" width="125" style="float: left; margin-left: 15px;" alt="MCP Open Discovery Logo">
</div>
<p>A comprehensive networking and infrastructure discovery platform that exposes 53 powerful tools through the official Model Context Protocol (MCP) SDK. Designed for AI assistants, automation systems, and infrastructure discovery with full MCP compliance.</p>
<br>

## Architecture Overview

- **Main Server:** `mcp_server_modular_sdk.js` - Full MCP SDK implementation
- **Tool Registry:** Centralized SDK-compatible tool registration with Zod schemas
- **In-Memory CMDB:** Hierarchical, queryable configuration database for discovered infrastructure
- **53 Tools Available:** BusyBox networking, Nmap scanning, SNMP discovery, Proxmox API, Nagios XI monitoring, credential management, and memory management
- **Full SDK Compliance:** Uses official `@modelcontextprotocol/sdk` with proper type safety
- **Security Enhanced:** Advanced input sanitization, rate limiting, and error handling
- **Dockerized:** Easy deployment with health monitoring and graceful shutdown

## Features

- **🎯 Full MCP SDK Compliance:** Built with official `@modelcontextprotocol/sdk` for complete protocol compatibility
- **🔧 53 Powerful Tools:** Comprehensive networking, scanning, discovery, and management capabilities
- **🏗️ Proxmox Cluster Discovery:** Complete API integration for nodes, VMs, containers, storage, and networks
- **🌐 SNMP-based Network Discovery:** Advanced device inventory, interface discovery, service mapping, and topology analysis
- **🔐 Secure Credential Management:** Encrypted storage for Proxmox API credentials with multi-cluster support
- **📊 In-Memory CMDB:** Hierarchical storage for discovered infrastructure with query capabilities
- **🛡️ Enhanced Security:** Advanced input sanitization, request timeouts, and structured error handling
- **📈 Performance Monitoring:** Request timing, structured logging, and comprehensive health checks
- **🐳 Production Ready:** Dockerized deployment with graceful shutdown and non-root execution

## 🧩 MCP Tools vs Resources: Best Practices for Monitoring & Discovery Data

This project follows a hybrid approach for modeling monitoring and discovery data, based on a detailed analysis of the Model Context Protocol (MCP) concepts of Tools, Resources, and Prompts:

- **MCP Tools**: Used for dynamic, parameterized queries and actions (e.g., fetch host/service status, query events, trigger checks). Tools are ideal for API integrations where input parameters are required and results are generated on demand.
- **MCP Resources**: Used for exposing static or streamable data (e.g., event logs, inventory/config snapshots) that can be read or subscribed to by clients. Resources are ideal for logs, bulk exports, and data streams.
- **MCP Prompts**: Used to guide users/LLMs through common workflows, optionally embedding resources for context.

### Example Mapping for Monitoring/Discovery (Nagios, SNMP, etc.)

| Data/Functionality               | MCP Tool? | MCP Resource? | Rationale                                 |
| -------------------------------- | --------- | ------------- | ----------------------------------------- |
| Get status for a specific host   | Yes       | No            | Needs parameters, dynamic query           |
| Get all host statuses (snapshot) | Maybe     | Yes           | Can be a resource (snapshot), or a tool   |
| Fetch recent event log entries   | Yes       | Yes           | Tool for filtered query, resource for log |
| Stream event log                 | No        | Yes           | Resource with subscription                |
| Get full config dump             | No        | Yes           | Resource (text or JSON)                   |
| Acknowledge alert                | Yes       | No            | Action, needs parameters                  |

### Why This Matters

- **Tools** provide flexible, on-demand queries and actions for LLMs and automation.
- **Resources** enable efficient, discoverable data streams and snapshots for CMDB/event ingestion.
- **Prompts** support guided workflows and user/LLM interaction.

This approach is especially important for integrating with systems like Nagios XI, where both real-time queries (Tools) and bulk/streaming data (Resources) are needed for ITSM, CMDB, and event management use cases.

For more details, see the planning documentation in `docs/MCP_SDK_MIGRATION_PLAN.md`.

## Available Tools (53 Total)

### 🌐 Network Tools (8 tools)

- **`ping`**: Send ICMP echo requests to network hosts
- **`wget`**: Download files from web servers
- **`nslookup`**: Query DNS servers for domain name resolution
- **`netstat`**: Display network connections and routing tables
- **`telnet`**: Test TCP connectivity to specific ports
- **`route`**: Display or manipulate IP routing table
- **`ifconfig`**: Display network interface configuration
- **`arp`**: Display or manipulate ARP cache

### 🧠 Memory/CMDB Tools (4 tools)

- **`memory_get`**: Get a CI object from MCP memory by key
- **`memory_set`**: Set a CI object in MCP memory by key
- **`memory_merge`**: Merge new data into an existing CI in MCP memory
- **`memory_query`**: Query MCP memory for CIs matching a pattern

### 🔍 NMAP Scanning Tools (5 tools)

- **`nmap_ping_scan`**: Discover online hosts without port scanning
- **`nmap_tcp_syn_scan`**: Stealthy TCP port scanning (requires root)
- **`nmap_tcp_connect_scan`**: TCP connect scan (no special privileges)
- **`nmap_udp_scan`**: UDP port scanning (can be slow)
- **`nmap_version_scan`**: Service and version detection

### 🖥️ Proxmox Tools (13 tools)

- **`proxmox_list_nodes`**: Returns all nodes in the Proxmox cluster
- **`proxmox_get_node_details`**: Returns details for a given Proxmox node
- **`proxmox_list_vms`**: Returns all VMs for a Proxmox node
- **`proxmox_get_vm_details`**: Returns config/details for a given VM
- **`proxmox_list_containers`**: Returns all LXC containers for a Proxmox node
- **`proxmox_get_container_details`**: Returns config/details for a given container
- **`proxmox_list_storage`**: Returns storage resources for a Proxmox node
- **`proxmox_list_networks`**: Returns network config for a Proxmox node
- **`proxmox_cluster_resources`**: Returns a summary of all cluster resources
- **`proxmox_get_metrics`**: Returns metrics for a node or VM
- **`proxmox_creds_add`**: Add a new Proxmox credential (encrypted at rest)
- **`proxmox_creds_list`**: Lists stored Proxmox API credentials
- **`proxmox_creds_remove`**: Removes stored Proxmox API credentials

### 📡 SNMP Discovery Tools (12 tools)

- **`snmp_create_session`**: Creates an SNMP session with a target device
- **`snmp_close_session`**: Closes an SNMP session
- **`snmp_get`**: Performs SNMP GET operation to retrieve specific OID values
- **`snmp_get_next`**: Performs SNMP GETNEXT operation for OIDs
- **`snmp_walk`**: Performs SNMP WALK operation to retrieve OID subtrees
- **`snmp_table`**: Retrieves SNMP tables
- **`snmp_discover`**: Discovers SNMP-enabled devices in network ranges
- **`snmp_device_inventory`**: Comprehensive device inventory via SNMP
- **`snmp_interface_discovery`**: Discovers and details network interfaces
- **`snmp_system_health`**: Checks system health metrics via SNMP
- **`snmp_service_discovery`**: Discovers running services and listening ports
- **`snmp_network_topology`**: Maps network topology using CDP/LLDP protocols

### 📋 Credential Management Tools (5 tools)

- **`credentials_add`**: Add encrypted credentials (password, apiKey, sshKey, oauthToken, certificate)
- **`credentials_get`**: Retrieve and decrypt stored credentials
- **`credentials_list`**: List all stored credentials (safe - no sensitive data exposed)
- **`credentials_remove`**: Remove credentials from secure store
- **`credentials_rotate_key`**: Rotate encryption key and re-encrypt all credentials

### 🏥 Nagios XI Integration Tools (6 tools)

- **`nagios_get_host_status`**: Fetch host status with filtering and pagination
- **`nagios_get_service_status`**: Fetch service status with filtering and pagination
- **`nagios_get_event_log`**: Fetch event log entries with time-based filtering
- **`nagios_get_host_config`**: Fetch host configuration (inventory)
- **`nagios_get_service_config`**: Fetch service configuration (inventory)
- **`nagios_acknowledge_alert`**: Acknowledge host/service problems

### 📊 MCP Resources

- **Nagios Resources:**
  - `nagios://eventlog/recent` - Recent event log entries
  - `nagios://inventory/hosts` - Host inventory snapshot
  - `nagios://config/hosts` - Host configuration
  - `nagios://config/services` - Service configuration
- **Credential Resources:**
  - `credentials://audit/log` - Credential operation audit log

## SDK Architecture

The MCP Open Discovery server v2.0 uses a modern SDK-based architecture with full MCP compliance:

- **Main Server** (`mcp_server_modular_sdk.js`): Official MCP SDK implementation
- **Tool Registry** (`tools/sdk_tool_registry.js`): Centralized SDK tool registration
- **SDK Tool Modules**: All tools converted to SDK format with Zod schemas:
  - `tools/network_tools_sdk.js` - Network utilities (8 tools)
  - `tools/memory_tools_sdk.js` - CMDB memory tools (4 tools)
  - `tools/nmap_tools_sdk.js` - Network scanning (5 tools)
  - `tools/proxmox_tools_sdk.js` - Proxmox VE integration (13 tools)
  - `tools/snmp_tools_sdk.js` - SNMP discovery (12 tools)
- **Legacy Support**: Original servers maintained for compatibility
- **SNMP Tools** (`tools/snmp_module.js`): SNMP discovery and monitoring

Each module exports a `getTools()` function that returns tool definitions. The module loader (`tools/module_loader.js`) dynamically loads all modules at startup.

## Docker Deployment

The Docker container **defaults to HTTP transport** for web-based usage and API access.

### Quick Start

1.  **Build and start the container:**

    ```bash
    docker build -t mcp-open-discovery .
    docker run -d --name mcp-open-discovery -p 3000:3000 mcp-open-discovery
    ```

2.  **Check container health:**

    ```bash
    curl http://localhost:3000/health
    ```

3.  **Test with MCP Inspector:**
    ```bash
    npx @modelcontextprotocol/inspector http://localhost:3000/mcp
    ```

### Using Docker Compose (Recommended)

1.  **Build and start all services (includes 3 SNMP test servers):**

    ```bash
    docker-compose up -d --build
    ```

2.  **Check MCP server health:**

    ```bash
    curl http://localhost:3000/health
    ```

3.  **Test SNMP discovery with the test servers:**

    ```bash
    # The compose setup includes 3 SNMP agents for testing:
    # - snmp-agent-1: 172.20.0.10 (port 1161)
    # - snmp-agent-2: 172.20.0.11 (port 2161)
    # - snmp-agent-3: 172.20.0.12 (port 3161)

    # Test SNMP discovery against the test network
    # Use MCP Inspector to call snmp_discover with target: "172.20.0.0/24"
    ```

### Container Configuration

The Docker Compose setup includes:

- **MCP Server**: HTTP transport on port 3000 with all 53 tools
- **3 SNMP Test Agents**: Alpine-based SNMP servers for testing discovery tools
  - **snmp-agent-1**: Basic SNMP agent (172.20.0.10:1161)
  - **snmp-agent-2**: Second test agent (172.20.0.11:2161)
  - **snmp-agent-3**: Agent with multiple communities (172.20.0.12:3161)
- **Custom Network**: Isolated bridge network (172.20.0.0/16)
- **Health Checks**: Automatic monitoring and restart capabilities

### Local Development

Run the SDK-based server locally with multiple transport options:

```bash
# Install dependencies
npm install

# Start the main SDK server (default: stdio transport)
npm start

# Or choose specific transport modes:
npm run start-stdio      # Stdio transport only (for CLI clients)
npm run start-http       # HTTP transport only (for web clients)
npm run start-both       # Both transports simultaneously

# Test HTTP transport health
npm run health           # Check server status via HTTP

# Environment variable control:
set TRANSPORT_MODE=stdio && npm start    # Windows
set TRANSPORT_MODE=http && npm start     # Windows
set TRANSPORT_MODE=both && npm start     # Windows
```

#### Transport Modes

**📡 Stdio Transport (Default)**

- **Purpose**: CLI tools, desktop MCP clients, development
- **Protocol**: JSON-RPC over stdin/stdout
- **Usage**: Default mode for most MCP integrations
- **Port**: None (stdin/stdout)

**🌐 HTTP Transport**

- **Purpose**: Web applications, REST API, browser integration
- **Protocol**: JSON-RPC over HTTP with Server-Sent Events (SSE)
- **Features**: Session management, CORS support, streaming
- **Endpoints**:
  - `http://localhost:3000/mcp` - MCP protocol endpoint
  - `http://localhost:3000/health` - Server health check
- **Port**: 3000 (configurable via `HTTP_PORT` environment variable)

**🔄 Multi-Transport Mode**

- **Purpose**: Development, testing, hybrid deployments
- **Features**: Simultaneous stdio and HTTP support
- **Use Case**: Support both CLI tools and web clients

#### Testing the HTTP Transport

```bash
# 1. Start HTTP transport
npm run start-http

# 2. Check health
curl http://localhost:3000/health

# 3. Initialize MCP session
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{"tools":{}},"clientInfo":{"name":"test-client","version":"1.0.0"}}}'

# 4. Run comprehensive tests
node test_http_transport.js
```

#### Using with MCP Inspector

[MCP Inspector](https://github.com/modelcontextprotocol/inspector) is Claude's official debugging tool for MCP servers. To connect:

1. **Start the HTTP transport**:

   ```bash
   npm run start-http
   ```

2. **Configure MCP Inspector**:

   - Transport: **Streamable HTTP**
   - URL: `http://localhost:3000/mcp`
   - ✅ Successfully tested - can list tools and execute them

3. **Alternative: Use stdio transport** (if you prefer command-line setup):
   - Command: `node mcp_server_multi_transport_sdk.js`
   - Working Directory: `/path/to/mcp-open-discovery`

```bash
# Install dependencies
npm install

# Start the main SDK server (default: stdio transport)
npm start

# Or run specific versions
npm run start-sdk # Simple SDK server
npm run start-legacy # Original legacy server
npm run start-legacy-modular # Legacy modular server

# Run tests
npm test # Test SDK server
npm run test-legacy # Test legacy server
```

### Security & Capabilities

The Docker container runs with specific capabilities required for network tools:

- **NET_RAW**: Required for ping and SYN scans
- **NET_ADMIN**: Required for network administration tools
- **Read-only filesystem**: Prevents container modifications
- **Memory limits**: 512MB limit with swap disabled

## MCP Protocol Compliance

This server implements the Model Context Protocol (MCP) specification with full SDK compatibility:

- **Official SDK**: Built with `@modelcontextprotocol/sdk` v1.12.1+
- **JSON-RPC 2.0**: Standard request/response format
- **Core Methods**: `initialize`, `tools/list`, `tools/call`
- **Type Safety**: Zod schemas for all tool parameters
- **Error Handling**: Proper error codes and structured messages

## SNMP Testing Environment

For comprehensive SNMP testing, use the provided Docker test environment:

```bash
# Start SNMP test containers
docker-compose -f testing/docker-compose-snmp-testing.yml up -d

# Test SNMP connectivity
docker exec busybox-network-mcp snmpget -v2c -c public 172.20.0.10:161 1.3.6.1.2.1.1.1.0
```

**Available Test Targets:**

- `172.20.0.10` - Basic SNMP simulator
- `172.20.0.11` - Full-featured SNMP agent
- `172.20.0.12` - SNMP lab with custom MIBs

## VS Code Integration

To use with VS Code MCP extension:

1. **Configure VS Code settings.json:**

   ```json
   {
     "mcp.servers": {
       "mcp-open-discovery": {
         "command": "node",
         "args": ["mcp_server_modular.js"],
         "cwd": "/path/to/mcp-open-discovery"
       }
     }
   }
   ```

2. **Use MCP tools in VS Code:**
   - Execute tools via Command Palette: "MCP: Execute Tool"
   - Browse available tools: "MCP: List Tools"
   - Manage Proxmox credentials directly in VS Code

## Testing

### SDK Server Testing (Default)

```bash
# Test the main SDK server with all 53 tools
npm test

# Test specific SDK components
node test_sdk_server.js
node test_memory_tools.js
```

### Legacy Testing

```bash
# Test legacy servers
npm run test-legacy

# Comprehensive testing suite
cd testing && node test_runner.js

# Specific test suites
node test_runner.js --snmp --proxmox

# Verbose output
node test_runner.js --verbose
```

For detailed testing information, see [TESTING.md](./TESTING.md).

## Development

To add new tool modules:

1. **Create a new module** in `tools/` directory
2. **Export getTools() function** returning tool definitions
3. **Follow MCP tool schema format**
4. **Add comprehensive tests**

For detailed development guidelines, see [DEVELOPER.md](./DEVELOPER.md).

## Proxmox API Usage Examples (MCP JSON-RPC)

All requests are `POST` requests to `http://localhost:3000` with `Content-Type: application/json`.

### Example: List Proxmox Nodes (with Credentials)

```json
{
  "jsonrpc": "2.0",
  "method": "tools/call",
  "params": {
    "name": "proxmox_list_nodes",
    "arguments": { "creds_id": "proxmox1" }
  },
  "id": "proxmox-nodes-1"
}
```

### Example: Get Proxmox Node Details (with Credentials)

```json
{
  "jsonrpc": "2.0",
  "method": "tools/call",
  "params": {
    "name": "proxmox_get_node_details",
    "arguments": { "node": "ccctc16gb01", "creds_id": "proxmox1" }
  },
  "id": "proxmox-node-details-1"
}
```

### Example: List VMs for a Node (with Credentials)

```json
{
  "jsonrpc": "2.0",
  "method": "tools/call",
  "params": {
    "name": "proxmox_list_vms",
    "arguments": { "node": "ccctc16gb01", "creds_id": "proxmox1" }
  },
  "id": "proxmox-vms-1"
}
```

### Example: Add Proxmox Credentials

```json
{
  "jsonrpc": "2.0",
  "method": "tools/call",
  "params": {
    "name": "proxmox_creds_add",
    "arguments": {
      "id": "proxmox1",
      "hostname": "proxmox.example.com",
      "username": "root@pam",
      "password": "yourpassword"
    }
  },
  "id": "proxmox-creds-add-1"
}
```

### Example: List Proxmox Credentials

```json
{
  "jsonrpc": "2.0",
  "method": "tools/call",
  "params": {
    "name": "proxmox_creds_list",
    "arguments": {}
  },
  "id": "proxmox-creds-list-1"
}
```

## API Usage Examples (MCP JSON-RPC)

All requests are `POST` requests to `http://localhost:3000` with `Content-Type: application/json`.

### Example: Ping a Host

```json
{
  "jsonrpc": "2.0",
  "method": "tools/call",
  "params": {
    "name": "ping",
    "arguments": {
      "host": "google.com",
      "count": 3
    }
  },
  "id": "ping-test-1"
}
```

### Example: Nmap TCP SYN Scan

```json
{
  "jsonrpc": "2.0",
  "method": "tools/call",
  "params": {
    "name": "nmap_tcp_syn_scan",
    "arguments": {
      "target": "scanme.nmap.org",
      "ports": "80,443",
      "reason": true
    }
  },
  "id": "nmap-syn-test-1"
}
```

### Example: Nmap Version Detection

```json
{
  "jsonrpc": "2.0",
  "method": "tools/call",
  "params": {
    "name": "nmap_version_scan",
    "arguments": {
      "target": "scanme.nmap.org",
      "ports": "22,80,443",
      "intensity": 5,
      "open_only": true
    }
  },
  "id": "nmap-version-test-1"
}
```

_(See `mcp_server.js` for the full schema of each tool.)_

## Advanced Nmap Usage

With the full Nmap Scripting Engine (NSE) enabled, you can use advanced scans for service discovery, vulnerability checks, and more.

### Example: Nmap with Default Scripts

```json
{
  "jsonrpc": "2.0",
  "method": "tools/call",
  "params": {
    "name": "nmap_version_scan",
    "arguments": {
      "target": "scanme.nmap.org",
      "ports": "80,443",
      "reason": true
    }
  },
  "id": "nmap-default-scripts"
}
```

_Note: For custom scripts or script arguments, see the Nmap documentation and consider extending the tool schema._

## Scan Timeouts

- The server allows up to 5 minutes for each scan by default, supporting heavy or comprehensive scans.
- If you encounter timeouts in your client (e.g., MCP Inspector), increase the client-side timeout to match your scan needs.

## Troubleshooting

- If you see errors like `could not locate nse_main.lua`, ensure the container is rebuilt with the full Nmap scripts as described in the Dockerfile.
- For long-running scans, check both server and client timeouts.

## Example: Using Nmap Output for CMDB Population

The output from `nmap_version_scan` includes service banners and device info, which can be parsed and ingested into a CMDB. Example output:

```
PORT    STATE SERVICE  VERSION
53/tcp  open  domain   TP-LINK router dnsd
80/tcp  open  http     OpenWrt uHTTPd (TP-LINK router http config)
443/tcp open  ssl/http OpenWrt uHTTPd (TP-LINK router http config)
Service Info: OS: Linux; Device: broadband router; CPE: cpe:/o:linux:linux_kernel
```

You can automate extraction of:

- Open ports and services
- Detected software versions
- Device type and OS
- CPE identifiers

## Advanced: Incremental CI Discovery and MCP Memory Integration

To build a robust, intelligent, and automated CMDB population process, you can leverage the MCP memory/context service as a staging and enrichment area for Configuration Items (CIs):

- **Incremental Discovery:** As each tool (Nmap, BusyBox, etc.) discovers new facts about a CI (e.g., IP, hostname, OS, services), store or update a partial CI record in the MCP memory service, keyed by a unique identifier (IP, MAC, hostname, etc.).
- **Collation & Enrichment:** As more data is gathered, merge new facts into existing CI stubs. Enrichment agents can trigger additional scans or lookups to fill missing fields.
- **Type Inference & Hierarchy:** Use accumulated facts to infer CI type (e.g., server, router, printer) and build relationships (e.g., parent/child, network topology) in memory before committing to the CMDB.
- **Validation & Commit:** When a CI is "complete enough" (meets a profile or confidence threshold), commit it to the persistent CMDB (e.g., Neo4j). Use memory to deduplicate and validate before writing.

**Example Workflow:**

1. `ping` discovers IP → memory: `{ip: "192.168.1.10"}`
2. `nmap_version_scan` adds OS/services → memory: `{ip: "192.168.1.10", os: "Linux", services: [...]}`
3. `nslookup` adds hostname → memory: `{ip: "192.168.1.10", hostname: "server1.local", ...}`
4. Enrichment agent triggers more scans if needed.
5. When enough data is present, CI is written to the CMDB and cleared from memory.

**Benefits:**

- Resilient to partial/incomplete data
- Supports asynchronous, multi-tool, multi-pass discovery
- Reduces duplication and errors in the CMDB
- Enables advanced logic (confidence scoring, enrichment, deduplication) before commit

This approach is modular, extensible, and aligns with modern discovery and asset management best practices. See the project plan below for implementation steps.

## Local Development

### Prerequisites

- Node.js (version specified in `.nvmrc` or latest LTS)
- Docker (for building/running the containerized version)
- Nmap (if running the server locally outside Docker and want to test Nmap tools)
- BusyBox (if running the server locally outside Docker and want to test BusyBox tools)

### Setup & Running Locally

```bash
# Install dependencies
npm install

# Start the server
# The server will attempt to use system 'nmap' and 'busybox' if available.
# For full functionality, running in Docker is recommended.
npm start
```

## Testing

The project includes a test client that validates MCP protocol compliance and basic tool functionality.

```bash
# Ensure the server is running (either locally or in Docker)
npm test
```

For more detailed test information, see [TEST_README.md](TEST_README.md).

## MCP Protocol Compliance

This server implements the Model Context Protocol (MCP). For more details on the specific MCP features and compliance, see [MCP_COMPLIANCE.md](MCP_COMPLIANCE.md).

## VS Code Integration

For instructions on how to connect this MCP server to VS Code, refer to [VSCODE_MCP_INTEGRATION.md](VSCODE_MCP_INTEGRATION.md).

## Security Considerations

- The Docker container is configured to run with minimal privileges.
- Nmap scans, especially `-sS` (SYN scan), might require root privileges or `CAP_NET_RAW` capability, which is provided in the Docker setup. Running `mcp_server.js` directly without Docker might limit Nmap's capabilities if not run as root.
- Input sanitization is performed for tool arguments, but always be cautious with network tools.
- The `telnet` tool will only function if the `telnet` client is available in the execution environment (it is not installed by default in the Docker image to keep it minimal).

## License

MIT License

## Project Structure

- **`mcp_server_multi_transport_sdk.js`**: ⭐ **Current MCP server implementation** (SDK-based with HTTP/SSE support)
- **`tools/`**: SDK-based tool implementations (\*\_sdk.js files)
  - `network_tools_sdk.js`: Network discovery and diagnostics
  - `nmap_tools_sdk.js`: Nmap scanning capabilities
  - `proxmox_tools_sdk.js`: Proxmox virtualization management
  - `snmp_tools_sdk.js`: SNMP discovery and monitoring
  - `memory_tools_sdk.js`: In-memory CI database
  - `sdk_tool_registry.js`: Tool registration and management
  - `module_loader.js`: Dynamic module loading utilities
- **`testing/`**: Test suites for SDK-based tools
- **`docs/`**: Comprehensive documentation (deployment, testing, integration guides)
- **`docker-compose.yml`**: Docker configuration for container deployment
- **`archive/`**: Deprecated files from pre-SDK implementations
- **`reference/`**: Reference materials and examples

## Test Scripts

- **Current Testing System:**

  - **`testing/test_snmp_sdk.js`**: SDK-based SNMP tools testing
  - **`testing/test_proxmox_sdk.js`**: Proxmox SDK integration tests
  - **`testing/test_memory_tools.js`**: Memory/CI database tests
  - **`testing/test_http_transport.js`**: HTTP/SSE transport testing
  - **`testing/test_container_health.js`**: Container health checks
  - **`testing/audit_mcp_compliance.js`**: MCP standard compliance validation

- **Documentation:**

  - **`docs/TESTING.md`**: Complete testing procedures and guidelines
  - **`docs/DEPLOYMENT.md`**: Container deployment instructions
  - **`docs/VSCODE_MCP_INTEGRATION.md`**: VS Code integration guide

- **Legacy/Archived:**
  - **`archive/mcp_server_original.js`**: Original monolithic server (preserved for reference)
  - Various obsolete test files and SNMP tool variants (see `TESTING.md` for cleanup details)

For more information on the testing system, see [TESTING.md](./TESTING.md).

## Archived Files Reference

**📁 Original Monolithic Server**: The original `mcp_server.js` has been preserved as `archive/mcp_server_original.js` for historical reference and comparison with the new modular architecture.

As of June 5, 2025, legacy test scripts and test result files have been moved to the `archive/` directory. See `archive/test_tools_cleanup_2025-06-05.txt` for details. These scripts are no longer maintained in the main project.

## Nagios XI Integration

### Configuration

- Add your Nagios XI instances to `vscode-mcp-config.json` under the `nagiosInstances` array:

```json
"nagiosInstances": [
  {
    "id": "nagios1",
    "baseUrl": "http://your-nagios-xi-instance-1",
    "credentialId": "nagios1-creds"
  },
  {
    "id": "nagios2",
    "baseUrl": "http://your-nagios-xi-instance-2",
    "credentialId": "nagios2-creds"
  }
]
```

- Store credentials securely using the new `tools/credentials_manager.js` (see below).

### Tools and Resources

Nagios integration exposes the following MCP tools and resources:

- **Tools:**
  - `nagios_get_host_status`
  - `nagios_get_service_status`
  - `nagios_get_event_log`
  - `nagios_get_host_config`
  - `nagios_get_service_config`
  - `nagios_acknowledge_alert`
- **Resources:**
  - `nagios://eventlog/recent`
  - `nagios://inventory/hosts`
  - `nagios://config/hosts`
  - `nagios://config/services`

All tools/resources support robust filtering, pagination, and MCP-compliant error handling.

### Credential Management

#### Using MCP Tools

All credential operations are available as MCP tools:

- `credentials_add` - Add encrypted credentials
- `credentials_get` - Retrieve credentials
- `credentials_list` - List stored credentials
- `credentials_remove` - Remove credentials
- `credentials_rotate_key` - Rotate encryption key

#### Using CLI Scripts

For convenience, CLI scripts are provided in `tools/cli/`:

```bash
# Add a Nagios XI API credential
node tools/cli/add_credential.js --type apiKey --id nagios1-creds --apiKey YOUR_API_KEY --url http://nagios-xi

# Add SSH credentials
node tools/cli/add_credential.js --type sshKey --id server1-ssh --username root --sshKey "$(cat ~/.ssh/id_rsa)"

# List all credentials
node tools/cli/list_credentials.js

# List credentials by type
node tools/cli/list_credentials.js --type apiKey

# Remove a credential
node tools/cli/remove_credential.js --id nagios1-creds

# Rotate encryption key
node tools/cli/rotate_key.js
```

#### Environment Variables

For enhanced security, you can provide the encryption key via environment variable:

```bash
export MCP_CREDS_KEY=$(openssl rand -base64 32)
```

#### Security Best Practices

- Store credentials using encrypted storage (never in plain text files)
- Use environment variables or secure mounts for encryption keys in production
- Regularly rotate credentials and encryption keys
- Monitor the audit log for unauthorized access
- Use principle of least privilege for credential access

## Testing Resources

You can test the newly implemented MCP resources:

```bash
# Test resource registration and functionality
node testing/test_resources.js

# Or test via HTTP transport
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"resources/list","params":{}}'
```

## Available Resources (5 Total)

Resources provide static or streamable data that can be read by MCP clients:

### 🏥 Nagios XI Resources (4 resources)

- **`nagios://eventlog/recent`** - Recent event log entries with filtering support
- **`nagios://inventory/hosts`** - Complete host inventory snapshot
- **`nagios://config/hosts`** - Current host configuration data
- **`nagios://config/services`** - Current service configuration data

### 📋 Credential Management Resources (1 resource)

- **`credentials://audit/log`** - Audit log of all credential operations

All resources support real-time data retrieval with MCP-compliant error handling and content delivery.

```

```
