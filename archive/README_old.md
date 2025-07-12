# MCP Open Discovery v2.0 🚀

<div align="left">
  <img src="./mcp-open-discovery-logo.png" width="125" style="float: left; margin-left: 15px;" alt="MCP Open Discovery Logo">
</div>

**A production-ready infrastructure discovery and CMDB platform delivering 53 powerful tools through the official Model Context Protocol (MCP) SDK. Built for AI assistants, automation systems, and enterprise infrastructure management with 91% tool success rate and full MCP compliance.**

<br clear="left">

[![Release Ready](https://img.shields.io/badge/Release-Ready-brightgreen)](./archive/LIVE_TESTING_REPORT.md)
[![Tools Available](https://img.shields.io/badge/Tools-53-blue)](#-tool-categories)
[![Success Rate](https://img.shields.io/badge/Success%20Rate-91%25-success)](#-live-testing-results)
[![MCP SDK](https://img.shields.io/badge/MCP-SDK%20v0.5.2-orange)](https://modelcontextprotocol.io)
[![Docker](https://img.shields.io/badge/Docker-Ready-blue)](./Dockerfile)

---

## 🎯 **Key Achievements**

- **✅ 91% Tool Success Rate** - Extensively tested against live production infrastructure
- **✅ Production Validated** - Successfully tested with 6-node Proxmox cluster
- **✅ Enterprise Grade** - Secure credential management, ITIL v4 CMDB standards
- **✅ Zero-Downtime Deployment** - Complete Docker containerization with health monitoring
- **✅ AI-Ready Infrastructure Analysis** - Professional prompts for infrastructure assessment

---

## 🏗️ **Architecture Overview**

```
┌─────────────────────────────────────────────────────────────┐
│                MCP Open Discovery v2.0                     │
├─────────────────────────────────────────────────────────────┤
│  🔧 53 Tools    📊 In-Memory CMDB    🔐 Secure Credentials │
│  � Multi-Transport   📈 Health Monitoring   🛡️ Enterprise Security │
└─────────────────────────────────────────────────────────────┘
                               │
                    ┌──────────┼──────────┐
                    │          │          │
            ┌───────▼────┐ ┌───▼────┐ ┌───▼─────┐
            │ Network    │ │ SNMP   │ │ Proxmox │
            │ Discovery  │ │ Device │ │ Cluster │
            │ (BusyBox)  │ │ Mgmt   │ │ API     │
            └────────────┘ └────────┘ └─────────┘
```

### **Core Components:**

- **🎯 Main Server:** `mcp_server_multi_transport_sdk.js` - Full MCP SDK implementation
- **🔧 Tool Registry:** Centralized SDK-compatible tool registration with Zod schemas  
- **🏗️ In-Memory CMDB:** Hierarchical, queryable configuration database for discovered CIs
- **� Credential Manager:** Enterprise-grade encrypted credential storage with audit trails
- **� Health Monitoring:** Comprehensive health checks, request timing, and structured logging
- **🐳 Container-First:** Production-ready Docker deployment with non-root execution

---

## 🎯 **Tool Categories & Success Rates**

| Category | Tools | Success Rate | Status | Capabilities |
|----------|-------|--------------|--------|--------------|
| **Memory CMDB** | 4/4 | ✅ **100%** | Perfect | CI storage, relationships, querying |
| **Proxmox Integration** | 13/13 | ✅ **100%** | Perfect | Full cluster management, VMs, storage |
| **Credential Management** | 5/5 | ✅ **100%** | Perfect | Encrypted storage, audit trails |
| **Network Tools** | 7/8 | ✅ **87.5%** | Excellent | Ping, traceroute, port scanning |
| **SNMP Discovery** | 10/12 | ✅ **83.3%** | Excellent | Device inventory, topology analysis |
| **Nagios Monitoring** | 6/6 | ✅ **100%*** | Perfect | Status monitoring, alerting |
| **NMAP Scanning** | 3/5 | ⚠️ **60%** | Good | Basic network scanning |

**Total: 48/53 tools working (91% success rate)** | *\*Partial results as expected*

---

## 🚀 **Quick Start**

### **Prerequisites**
- Docker & Docker Compose
- Git

### **Launch in 30 Seconds**

```bash
# Clone the repository
git clone https://github.com/nagual69/mcp-open-discovery.git
cd mcp-open-discovery

# Deploy with one command
./rebuild_deploy.ps1  # Windows PowerShell
# OR
docker-compose up -d  # Linux/Mac

# Verify deployment
curl http://localhost:3000/health
```

### **🎯 Instant Testing**

```bash
# Test network discovery
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -d '{"method": "tools/call", "params": {"name": "ping", "arguments": {"host": "google.com"}}}'

# Test SNMP device discovery  
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -d '{"method": "tools/call", "params": {"name": "snmp_device_inventory", "arguments": {"host": "192.168.1.1"}}}'
```

---

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

## 🔧 **Complete Tool Reference**

### 🌐 **Network Discovery Tools** (7/8 ✅ 87.5%)
- **`ping`** - ICMP echo requests with configurable count and timeout
- **`traceroute`** - Network path tracing with hop analysis  
- **`nslookup`** - DNS resolution with record type support
- **`telnet`** - TCP connectivity testing to specific ports
- **`wget`** - HTTP/HTTPS content retrieval with retry logic
- **`netstat`** - Network connections and routing table analysis
- **`arp`** - ARP cache display for network troubleshooting

### 📊 **In-Memory CMDB Tools** (4/4 ✅ 100%)
- **`memory_set`** - Store Configuration Items with structured data
- **`memory_get`** - Retrieve CI objects with relationship mapping
- **`memory_query`** - Query CIs using pattern matching and filters
- **`memory_merge`** - Update existing CIs with partial data

### 🔍 **NMAP Scanning Tools** (3/5 ⚠️ 60%)
- **`nmap_ping_scan`** - Host discovery without port scanning (-sn)
- **`nmap_tcp_connect_scan`** - TCP Connect scan for open ports (-sT)
- **`nmap_tcp_syn_scan`** - Stealth SYN scan (requires root) (-sS)
- **`nmap_udp_scan`** - UDP port scanning (-sU) *[Partial]*
- **`nmap_version_scan`** - Service version detection (-sV) *[Partial]*

### 🏗️ **Proxmox Cluster Management** (13/13 ✅ 100%)
- **`proxmox_list_nodes`** - Returns all nodes in Proxmox cluster
- **`proxmox_get_node_details`** - Detailed node information and metrics
- **`proxmox_list_vms`** - All virtual machines for a node
- **`proxmox_get_vm_details`** - VM configuration and status details
- **`proxmox_list_containers`** - All LXC containers for a node  
- **`proxmox_get_container_details`** - Container configuration details
- **`proxmox_list_storage`** - Storage resources and utilization
- **`proxmox_list_networks`** - Network configuration and VLANs
- **`proxmox_cluster_resources`** - Complete cluster resource summary
- **`proxmox_get_metrics`** - Performance metrics for nodes/VMs
- **`proxmox_creds_add`** - Add encrypted Proxmox API credentials
- **`proxmox_creds_list`** - List stored credentials (secure)
- **`proxmox_creds_remove`** - Remove stored credentials

### 📡 **SNMP Device Discovery** (10/12 ✅ 83.3%)
- **`snmp_create_session`** - Create SNMP session with authentication
- **`snmp_close_session`** - Close SNMP session and cleanup
- **`snmp_get`** - Retrieve specific OID values
- **`snmp_get_next`** - GETNEXT operation for OID traversal
- **`snmp_walk`** - Walk OID subtrees for bulk data
- **`snmp_table`** - Retrieve structured SNMP tables
- **`snmp_discover`** - Network-wide SNMP device discovery
- **`snmp_device_inventory`** - Complete device hardware/software inventory
- **`snmp_interface_discovery`** - Network interface discovery and analysis
- **`snmp_system_health`** - System health and performance metrics

### 🔐 **Enterprise Credential Management** (5/5 ✅ 100%)
- **`credentials_add`** - Add encrypted credentials (multiple types supported)
- **`credentials_get`** - Retrieve and decrypt stored credentials
- **`credentials_list`** - List all credentials (metadata only, secure)
- **`credentials_remove`** - Remove credentials from secure store
- **`credentials_rotate_key`** - Rotate encryption keys with re-encryption

### 🏥 **Nagios XI Monitoring** (6/6 ✅ 100%*)
- **`nagios_get_host_status`** - Host status with filtering and pagination
- **`nagios_get_service_status`** - Service status monitoring
- **`nagios_get_event_log`** - Event log analysis with time filtering
- **`nagios_get_host_config`** - Host configuration inventory
- **`nagios_get_service_config`** - Service configuration details
- **`nagios_acknowledge_alert`** - Acknowledge alerts and incidents

*\*Returns partial results as expected for monitoring integration*

---

## 📊 **MCP Resources & Prompts**

### **📋 Available Resources** (5 resources)
- **Nagios Event Logs** - Real-time monitoring event streams
- **Host/Service Configurations** - Complete infrastructure inventory
- **Audit Trails** - Security and compliance logging
- **Credential Audit Logs** - Encrypted credential access logs

### **🧠 Infrastructure Analysis Prompts** (5 prompts)
- **`cmdb_ci_classification`** - ITIL v4 compliant CI classification guidance
- **`network_topology_analysis`** - Expert network topology analysis and recommendations
- **`infrastructure_health_assessment`** - Performance and capacity planning analysis
- **`compliance_gap_analysis`** - Security and compliance framework assessment
- **`incident_analysis_guidance`** - Structured incident response frameworks

---

## 🚀 **Production Deployment**

### **🐳 Docker Deployment**

```bash
# Production deployment with all components
docker-compose up -d

# Scale for high availability
docker-compose up -d --scale mcp-server=3

# Monitor health and logs
docker-compose logs -f mcp-server
curl http://localhost:3000/health
```

### **🔧 Configuration Options**

```javascript
// Environment variables for production
MCP_TRANSPORT_MODE=http          # Transport: http, stdio, websocket
MCP_SERVER_PORT=3000            # HTTP server port
MCP_LOG_LEVEL=info              # Logging: debug, info, warn, error
MCP_MAX_CONNECTIONS=100         # Connection limits
MCP_REQUEST_TIMEOUT=30000       # Request timeout (ms)
MCP_RATE_LIMITING=true          # Enable rate limiting
MCP_SECURITY_MODE=standard      # Security level
```

### **📈 Health Monitoring**

```bash
# Health endpoint
GET /health
{
  "status": "healthy",
  "uptime": "2h 15m 30s",
  "tools": { "total": 53, "loaded": 53 },
  "memory": { "used": "45MB", "available": "955MB" }
}

# Metrics endpoint
GET /metrics
# Prometheus-compatible metrics for monitoring
```

---

## 🎯 **Live Testing Results**

Our comprehensive testing against **real production infrastructure** achieved:

### **🏆 Overall Results**
- **✅ 91% Success Rate** (48/53 tools working)
- **✅ Production Validated** - Tested against live 6-node Proxmox cluster  
- **✅ Zero Critical Failures** - All core infrastructure tools working
- **✅ Enterprise Ready** - Full credential management and audit trails

### **🔬 Testing Environment**
- **Production Proxmox Cluster**: 6 nodes, 45+ VMs, multiple storage backends
- **Live Network Infrastructure**: SNMP-enabled devices, switches, routers
- **Nagios Core Integration**: Real monitoring data and alerting
- **Security Testing**: Credential encryption, audit trails, input validation

### **📊 Detailed Results by Category**

| **Perfect Categories (100%)** | **Excellent Categories (80%+)** | **Good Categories (60%+)** |
|-------------------------------|----------------------------------|----------------------------|
| ✅ Memory CMDB (4/4)          | ✅ Network Tools (7/8 - 87.5%)   | ⚠️ NMAP Tools (3/5 - 60%)  |
| ✅ Proxmox Integration (13/13) | ✅ SNMP Discovery (10/12 - 83.3%) |                            |
| ✅ Credentials (5/5)          |                                 |                            |
| ✅ Nagios Monitoring (6/6*)   |                                 |                            |

**[View Complete Testing Report →](./archive/LIVE_TESTING_REPORT.md)**

---

## 🎯 **Real-World Use Cases**

### **🏢 Enterprise Infrastructure Discovery**
```bash
# Discover complete Proxmox cluster
curl -X POST localhost:3000/mcp -d '{
  "method": "tools/call",
  "params": {"name": "proxmox_cluster_resources"}
}'

# SNMP device inventory across network
curl -X POST localhost:3000/mcp -d '{
  "method": "tools/call", 
  "params": {"name": "snmp_discover", "arguments": {"targetRange": "192.168.1.0/24"}}
}'
```

### **🔍 AI-Powered Infrastructure Analysis**
```bash
# Get expert network topology analysis
curl -X POST localhost:3000/mcp -d '{
  "method": "prompts/get",
  "params": {"name": "network_topology_analysis", "arguments": {
    "networkData": "...", "subnet": "192.168.1.0/24"
  }}
}'

# ITIL v4 compliant CI classification
curl -X POST localhost:3000/mcp -d '{
  "method": "prompts/get", 
  "params": {"name": "cmdb_ci_classification", "arguments": {
    "deviceType": "server", "discoveredData": "..."
  }}
}'
```

### **📊 Centralized CMDB Management**
```bash
# Store discovered infrastructure in CMDB
curl -X POST localhost:3000/mcp -d '{
  "method": "tools/call",
  "params": {"name": "memory_set", "arguments": {
    "key": "ci:server:web01",
    "value": {"type": "server", "role": "web", "status": "active"}
  }}
}'
```

---

## 🛡️ **Security & Compliance**

### **🔐 Enterprise-Grade Security**
- **Encrypted Credential Storage** - AES-256 encryption for all stored credentials
- **Audit Trails** - Complete logging of all credential access and modifications  
- **Input Sanitization** - Advanced validation for all tool parameters
- **Rate Limiting** - DDoS protection and resource management
- **Non-Root Execution** - Container security best practices

### **📋 Compliance Features**
- **ITIL v4 Standards** - Built-in CMDB classification and CI management
- **SOX/PCI/HIPAA Ready** - Compliance gap analysis prompts
- **Change Management** - Structured incident response frameworks
- **Access Controls** - Role-based credential management

---

## 📚 **Documentation**

### **📖 Complete Documentation**
- **[Architecture Guide](./docs/DEVELOPER.md)** - System architecture and design patterns
- **[Deployment Guide](./docs/DEPLOYMENT.md)** - Production deployment instructions
- **[Testing Guide](./docs/TESTING.md)** - Comprehensive testing procedures
- **[MCP Compliance](./docs/MCP_COMPLIANCE.md)** - MCP protocol implementation details

### **📋 Development Resources**
- **[Migration Guide](./docs/MCP_SDK_MIGRATION_PLAN.md)** - Upgrading from legacy versions
- **[Live Testing Report](./archive/LIVE_TESTING_REPORT.md)** - Complete testing results
- **[VS Code Integration](./docs/VSCODE_MCP_INTEGRATION.md)** - IDE integration guide

---

## 🤝 **Contributing**

We welcome contributions! This project represents the culmination of extensive development and testing to create a production-ready MCP server.

### **Development Setup**
```bash
git clone https://github.com/nagual69/mcp-open-discovery.git
cd mcp-open-discovery
npm install
npm run dev
```

### **Testing**
```bash
# Run comprehensive test suite
npm test

# Live infrastructure testing
npm run test:live

# MCP compliance testing  
npm run test:mcp
```

---

## 📄 **License**

MIT License - See [LICENSE](./LICENSE) for details.

---

## 🙏 **Acknowledgments**

- **Anthropic** - For the Model Context Protocol specification
- **MCP SDK Team** - For the excellent official SDK
- **Community** - For testing, feedback, and contributions

---

<div align="center">

**🚀 Ready for Production • 91% Success Rate • Enterprise Grade 🚀**

*Built with ❤️ for the infrastructure automation community*

</div>

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
