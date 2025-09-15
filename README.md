<div align="center">

# MCP Open Discovery v2.0

**Enterprise Multi-Transport MCP Discovery & Automation Platform**

[▶ Executive Overview (One‑Pager)](./docs/Executive-One-Pager.md) • [Website](https://www.linkedin.com/in/toby-schmeling-2200556/) • [Architecture Diagram](./open_mcp_architecture.mmd)

<br/>

**World’s first dynamic Model Context Protocol (MCP) discovery server with hot‑reloadable tool registry, pluggable marketplace, and secure AMQP transport layer.**

</div>
<!-- BEGIN UNIFIED BRAND HEADER (copy/paste to other repos) -->
<div align="center">

  <p>
    <img src="./docs/mcp-open-discovery-logo-white.png" alt="MCP Open Discovery" width="128" height="128" />
    <img src="./docs/CodedwithAI-white-transparent.png" alt="Coded with AI" width="128" height="128" />
  </p>

  <p><em>Forging Intelligent Systems with Purpose</em></p>
  <p><strong>Unified launch: MCP Open Discovery • AMQP Transport • VS Code Bridge</strong></p>
  <p>
    <a href="https://modelcontextprotocol.io/" target="_blank">Model Context Protocol</a>
    ·
    <a href="https://github.com/nagual69/mcp-open-discovery" target="_blank">MCP Open Discovery</a>
    ·
    <a href="https://github.com/nagual69/AMQPConnectorforMCP" target="_blank">AMQP Transport</a>
    ·
    <a href="https://github.com/nagual69/vscode-mcp-open-discovery-amqp-bridge" target="_blank">VS Code AMQP Bridge</a>
    ·
    <a href="https://www.linkedin.com/in/toby-schmeling-2200556/" target="_blank">LinkedIn Profile</a>
  </p>

</div>
<!-- END UNIFIED BRAND HEADER -->

## Why Choose MCP Open Discovery

| Capability | Enterprise Outcome |
| ---------- | ------------------ |
| Multi-Transport (HTTP • Stdio • AMQP) | Integrate AI + infra workflows across IDEs, services, message buses |
| Dynamic Tool Registry & Hot‑Reload | Zero-downtime extension & controlled change windows |
| Signed & Policy-Governed Plugins | Supply‑chain integrity + runtime dependency governance |
| Encrypted Credential & CMDB Layer | Secure operational memory with auditability |
| Capability Diff & Strict Modes | Prevent drift between declared vs. active capabilities |
| Sandbox & Allowlist Enforcement | Runtime risk reduction for third‑party extensions |
| Proxmox • SNMP • Zabbix • Nmap | Unified infrastructure discovery & monitoring fabric |
| Marketplace Analytics | Operational insight (policy distribution, signatures, sandbox adoption) |

---

## AMQP Transport Integration (Enterprise Message Bus Mode)

The AMQP transport enables horizontally scalable, decoupled MCP request/response flows over RabbitMQ. This allows infrastructure discovery, monitoring enrichment, and AI agent orchestration to share a common secure event fabric.

### Architecture Highlights

- Topic-based exchanges for routing (`mcp.notifications`, per‑session routing exchange)
- Per-session ephemeral queues with TTL & auto-delete for isolation
- Structured routing keys: `mcp.request.<category>.<method>` and notification fan-out (`mcp.notification.#`)
- Heartbeat exchange (`mcp.heartbeat`) for liveness & operational dashboards
- Idempotent lifecycle: SDK triggers `start()`; initialize response flows through AMQP channel
- Capability negotiation preserved across transports

### Enterprise Use Cases

| Use Case | Benefit |
| -------- | ------- |
| Cross-Datacenter Discovery | Route tool calls via AMQP without direct network exposure |
| AI Workflow Orchestration | Publish discovery outputs for downstream enrichment pipelines |
| Event-Driven Compliance | Trigger scans upon asset onboarding messages |
| Hybrid Ops Bridge | Link cloud + on‑prem systems using a uniform protocol layer |

### Operational Controls

- Override queue/exchange names via env (`AMQP_EXCHANGE`, `AMQP_QUEUE_PREFIX`)
- Fine-grained subscription patterns for security segmentation
- Supports concurrent transports (e.g., `TRANSPORT_MODE=http,amqp`)
- Health & heartbeat signals consumable by observability stacks

---

## Plugin & Marketplace Architecture

The platform ships with a policy-aware plugin marketplace enabling governed extensibility under strict integrity, signature, and sandbox controls.

### Integrity & Supply Chain

- Deterministic distribution hash (sha256) + per-file checksum coverage
- Lock file v2 enrichment: file counts, total bytes, coverage, policy snapshot, signature metadata
- Automatic migration of legacy lock descriptors

### Dependency Policies (`dependenciesPolicy`)

| Policy | Runtime Behavior | Typical Use |
| ------ | ---------------- | ----------- |
| bundled-only | All code self-contained | High-security zones |
| external-allowed | External requires permitted | Internal trusted extensions |
| external-allowlist | Only declared `externalDependencies` resolved | Controlled partner modules |
| sandbox-required | Allowlist + runtime sandbox (blocks eval/new Function/native addons) | Third-party / marketplace |

### Runtime Governance

- Capability diff with optional `STRICT_CAPABILITIES=1` enforcement
- Signature verification (RSA / Ed25519) via `PLUGIN_REQUIRE_SIGNED=1`
- Allowlisted module load gate + deny native `.node` binaries under sandbox mode
- Eval & dynamic function creation disabled when sandboxed

### Observability & Analytics

- Policy distribution & signature adoption metrics
- Sandbox adoption ratios for risk posture tracking
- On-demand integrity rescans (`tool_store_rescan_integrity`)

### Marketplace Tooling

| Tool | Purpose |
| ---- | ------- |
| `tool_store_list_policies` | Enumerate installed plugins + policy & signature status |
| `tool_store_show` | Detailed plugin manifest + lock metrics |
| `tool_store_rescan_integrity` | Recompute distribution hash & validate coverage |

> Need custom discovery modules or private plugin distribution? Engage **VibeForge Systems** for secure supply-chain onboarding.

---

## Enterprise Feature Matrix

| Domain | Feature | Description |
| ------ | ------- | ----------- |
| Security | Encrypted credentials | AES-256 encrypted store + audit log |
| Security | Policy-governed plugins | Runtime dependency & sandbox enforcement |
| Security | Signature verification | RSA & Ed25519 trusted key model |
| Compliance | Capability diff control | Detect & block undeclared tool exposure |
| Compliance | Audit-ready logs | Credential + plugin lifecycle events |
| Operations | Hot‑reload registry | Zero-downtime module updates |
| Operations | Multi-transport core | HTTP + AMQP + stdio concurrency |
| Operations | Health & heartbeat | /health endpoint + AMQP heartbeat exchange |
| Discovery | Proxmox, SNMP, Nmap, Zabbix | Unified multi-surface infrastructure mapping |
| Extensibility | Marketplace APIs | Install, inspect, rescan, govern plugins |
| Observability | Analytics snapshot | Policy/signature/sandbox adoption metrics |

---

# MCP Open Discovery v2.0 🚀🔥

<div align="left">
  <div align="center">
  <img src="docs/mcp-open-discovery-logo-white.png" alt="MCP Open Discovery Logo" width="200" />
  </div>

Enterprise-grade Model Context Protocol (MCP) server for infrastructure discovery, lightweight CMDB, and tooling orchestration. Designed for security-conscious environments, built on the official MCP SDK, and deployable with containers by default.

  <div align="center">

  <img src="./docs/CodedwithAI-white-transparent.png" alt="Coded with AI" width="160" />

  <br/>
  <sub>This project was substantially coded with AI under human direction and review. Code and architecture decisions were guided, verified, and integrated by humans.</sub>
  </div>

## Overview

MCP Open Discovery provides a single MCP server that exposes a broad set of discovery, monitoring, and CMDB-style capabilities via tools. It uses a centralized tool registry with hot‑reload, an SQLite-backed persistent store for CIs, and a container-first deployment approach.

This README aims to describe current capabilities plainly and avoid over‑claiming. For regulated or large enterprise environments, please evaluate features in a staging environment before production use.

## Highlights

- Single MCP server instance shared by multiple transports
- Central tool registry with hot‑reload and modular categories
- SQLite-backed persistent memory/CMDB with manual and periodic saves
- Credential management with encryption and audit logging
- Structured logging and a health endpoint for basic observability

## Current Transport Support

- HTTP: supported and enabled by default (port 3000)
- Stdio: supported for local/embedded scenarios
- AMQP (RabbitMQ): available; evaluated in practice. Suitable for non-interactive integrations. For IDE integrations, confirm MCP transport compliance in your environment.
- gRPC: not enabled; future consideration

Notes:

- Transport selection can be tailored per deployment. Validate AMQP behavior with your client stack before relying on it.

## Tooling Scope (overview)

The server typically registers 70+ tools across these categories (exact counts can vary by build):

- Memory (CMDB/persistence)
- Credentials
- Network (ping, DNS, HTTP fetch, routes, interfaces, ARP, etc.)
- Nmap scanning (capability-aware)
- SNMP discovery and inspection
- Proxmox cluster inspection
- Zabbix integration (inventory, metrics, events)
- Registry/Hot‑reload management
- Test/Debug utilities

Refer to the code under `tools/` for the authoritative list and schemas.

## Architecture basics

- Server: `mcp_open_discovery_server.js` creates a single MCP server instance and starts available transports.
- Registry: `tools/registry/index.js` centralizes tool loading/registration and hot‑reload management.
- Persistence: `tools/memory_tools_sdk.js` uses SQLite (via `tools/registry/database_layer.js`) to persist CI data.
- Credentials: encrypted storage with audit trails (see `tools/credentials_tools_sdk.js`).

### Architecture diagram

<img src="./docs/mcp_server_architecture.svg" alt="MCP Open Discovery Architecture" width="768"/>

- Full diagram (Mermaid): [open_mcp_architecture.mmd](./open_mcp_architecture.mmd)
- Tip: In VS Code, install a Mermaid preview extension to view it; you can also copy the content into a Markdown ```mermaid block for GitHub rendering.

Design considerations:

- Prefer least privilege (Docker capabilities vs. privileged mode for scans).
- Avoid duplicate registrations via a single server instance.
- Provide stable defaults with clear extension points.

## Quick start

Prerequisites: Docker Desktop (includes Docker Compose), Git

Windows (PowerShell):

```powershell
./rebuild_deploy.ps1
```

Linux/Mac (alternative):

```bash
docker compose -f docker/docker-compose.yml up -d
```

Verify:

```bash
curl http://localhost:3000/health
```

### Runtime paths

- Data: `/home/mcpuser/app/data` (container volume)
- Logs: `/home/mcpuser/app/logs` (container volume)
- Plugins: default `/home/mcpuser/plugins` in containers (mounted volume). When running locally, defaults to `<home>/plugins` then `<cwd>/plugins` if needed. Override with `PLUGINS_ROOT` (must be writable).

### Minimal production compose

For a lean, production-only deployment of the MCP server:

- HTTP only:
  docker compose -f docker/docker-file-mcpod-server.yml up -d
- With AMQP broker (RabbitMQ):
  docker compose -f docker/docker-file-mcpod-server.yml --profile with-amqp up -d
  The prod scripts below auto-set TRANSPORT_MODE; if running manually, set TRANSPORT_MODE=http,amqp.

### Deployment scripts

- Windows (full stack or server-only):
  - Full/dev stack: `./rebuild_deploy.ps1` (uses `docker/docker-compose.yml`)
  - Minimal production server: `./rebuild_deploy_prod.ps1`
    - Transports (choose any): `-Http`, `-Amqp`, `-Stdio` (default `-Http` if none specified)
    - RabbitMQ container: `-WithRabbitMq` (optional; use with `-Amqp` if you want an in-stack broker)
    - Project scoping: `-ProjectName <name>` (overrides `COMPOSE_PROJECT_NAME`; auto-lowercased for Docker)
    - Deprecated: `-WithAmqp` (alias of `-Amqp -WithRabbitMq`)
- Linux/macOS:
  - Full/dev stack: `./rebuild_redeploy.sh` (uses `docker/docker-compose.yml`)
  - Minimal production server: `./rebuild_redeploy_prod.sh`
    - Transports: `--http`, `--amqp`, `--stdio` (default `--http` if none specified)
    - RabbitMQ container: `--with-rabbitmq` (optional)
    - Project scoping: `--project-name <name>` or `COMPOSE_PROJECT_NAME` (will be normalized to lowercase)
    - Deprecated: `--with-amqp` (alias of `--amqp --with-rabbitmq`)

## Security notes

- Credentials are stored encrypted with audit logging; integrate with your secrets management process for production.
- CI persistence uses SQLite; apply host or volume encryption per policy if required.
- Network scanning tools (e.g., nmap) may require extra container capabilities; review `docker/docker-compose.yml` before enabling.

## Operational notes

- Hot‑reload is supported for tool modules; validate in lower environments before promoting changes.
- Tool counts and schemas may evolve; use the MCP `tools/list` method to discover the current interface.
- AMQP usage depends on client compatibility with MCP transports. Test end‑to‑end in your stack if you plan to rely on AMQP.

## Example calls (HTTP)

Network ping:

```bash
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"ping","arguments":{"host":"127.0.0.1","count":2}}}'
```

SNMP device inventory:

```bash
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"snmp_device_inventory","arguments":{"host":"192.168.1.10","version":"2c","community":"public"}}}'
```

Zabbix host discovery:

```bash
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"zabbix_host_discover","arguments":{"baseUrl":"http://localhost:8080","username":"Admin","password":"zabbix"}}}'
```

## Roadmap (selected)

- Harden AMQP transport for broader client compatibility
- Expanded observability (metrics, tracing integration points)
- Optional at-rest encryption for CI persistence
- Additional enterprise connectors and discovery modules

## License

Mozilla Public License 2.0 (MPL-2.0). See `LICENSE` for details.

## Plugin Dependency Policies & Integrity (v2)

This deployment includes an advanced plugin marketplace with integrity, policy, and sandbox controls.

Policies (`dependenciesPolicy`):
| Policy | Purpose | Env Requirements |
| ------ | ------- | ---------------- |
| bundled-only | All code bundled in dist; no runtime external requires | None |
| external-allowed | Runtime external requires permitted | PLUGIN_ALLOW_RUNTIME_DEPS=1 |
| external-allowlist | Only modules in `externalDependencies` allowed at runtime | PLUGIN_ALLOW_RUNTIME_DEPS=1 |
| sandbox-required | Allowlist + hardened sandbox (blocks eval/new Function/native addons) | SANDBOX_AVAILABLE=1 (+PLUGIN_ALLOW_RUNTIME_DEPS=1 if externals used) |

Integrity & Security:
- Dist hash (sha256) verification + optional per-file checksums with coverage.
- Capability diff (declared vs registered) with STRICT_CAPABILITIES=1 enforcement.
- Signature verification (RSA / Ed25519) via PLUGIN_REQUIRE_SIGNED=1 or REQUIRE_SIGNATURES=1.
- Auto-migrated and enriched lock file (`install.lock.json`) with metrics & policy snapshot.
- Runtime sandbox (sandbox-required) denies eval, new Function, and native addon loading.

Feature Flags Summary: SCHEMA_PATH, STRICT_CAPABILITIES, PLUGIN_ALLOW_RUNTIME_DEPS, PLUGIN_REQUIRE_SIGNED / REQUIRE_SIGNATURES, SANDBOX_AVAILABLE.

Marketplace Tools Added:
- tool_store_list_policies
- tool_store_show
- tool_store_rescan_integrity

Use these to audit plugin state and verify dist integrity post-installation.

````

### **🔐 Unified Credential Management**

The platform uses a unified credential system supporting multiple credential types. Here's how to set up credentials for different systems:

```bash
# Add Proxmox credentials
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "method": "tools/call",
    "params": {
      "name": "credentials_add",
      "arguments": {
        "id": "proxmox-main",
        "type": "password",
        "username": "admin@pam",
        "password": "your-password",
        "url": "https://pve.example.com:8006",
        "notes": "Proxmox VE cluster primary, realm:pam, verify_ssl:true"
      }
    }
  }'

# Add Zabbix credentials
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "method": "tools/call",
    "params": {
      "name": "credentials_add",
      "arguments": {
        "id": "zabbix-main",
        "type": "password",
        "username": "Admin",
        "password": "OpenMCPD1sc0v3ry!",
        "url": "http://172.20.0.22:8080",
        "notes": "Zabbix server main admin"
      }
    }
  }'

# List all credentials (secure - only metadata shown)
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -d '{"method": "tools/call", "params": {"name": "credentials_list"}}'

# Use credentials with tools (auto-detected or specify creds_id)
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -d '{"method": "tools/call", "params": {"name": "zabbix_host_discover", "arguments": {"creds_id": "zabbix-main"}}}'
````

---

## 🔧 **Complete Tool Reference**

### 🌐 **Network Discovery Tools** (8/8 ✅ 100%)

- **`ping`** - ICMP echo requests with configurable count and timeout
- **`wget`** - HTTP/HTTPS content retrieval with headers and retry logic
- **`nslookup`** - DNS resolution with multiple record type support
- **`netstat`** - Network connections and routing table analysis
- **`telnet`** - TCP connectivity testing to specific ports
- **`route`** - Display and manipulate IP routing table
- **`ifconfig`** - Network interface configuration display
- **`arp`** - ARP cache display for network troubleshooting

### 🧠 **Memory CMDB Tools** (9/9 ✅ 100%)

**🗄️ Enterprise SQLite-Based Persistent Memory System**

- **`memory_get`** - Retrieve CI objects by key with automatic decryption
- **`memory_set`** - Store CI objects with hierarchical relationships
- **`memory_merge`** - Merge new data into existing CIs with validation
- **`memory_query`** - Pattern-based CI queries with wildcard support
- **`memory_clear`** - Clear all memory data (in-memory and SQLite database)
- **`memory_stats`** - Comprehensive memory usage and storage statistics
- **`memory_save`** - Manual persistence triggers for batch operations
- **`memory_rotate_key`** - Encryption key rotation with data re-encryption
- **`memory_migrate_from_filesystem`** - Legacy JSON format migration

**🎯 Testing Achievements:**

- ✅ **100% Tool Success Rate** - All 9 tools comprehensively tested
- ✅ **Enterprise Security** - AES-256-CBC encryption with key rotation
- ✅ **Data Integrity** - 100% data recovery across container restarts
- ✅ **Performance** - Auto-save every 30 seconds with SQLite backend
- ✅ **Migration Support** - Seamless legacy data migration capability

### 🏗️ **Proxmox Cluster Management** (10/10 ✅ 100%)

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

### 📡 **SNMP Discovery Tools** (12/12 ✅ 100%)

- **`snmp_create_session`** - Create SNMP session with target device
- **`snmp_close_session`** - Close an active SNMP session
- **`snmp_get`** - GET operation for specific OID values
- **`snmp_get_next`** - GETNEXT operation for OID traversal
- **`snmp_walk`** - WALK operation for OID subtrees
- **`snmp_table`** - Retrieve complete SNMP tables
- **`snmp_discover`** - Discover SNMP-enabled devices in network range
- **`snmp_device_inventory`** - Comprehensive device inventory via SNMP
- **`snmp_interface_discovery`** - Network interface discovery and analysis
- **`snmp_system_health`** - System health and performance metrics
- **`snmp_service_discovery`** - Running services and listening ports via SNMP
- **`snmp_network_topology`** - Network topology mapping using CDP/LLDP

### 🔐 **Enterprise Credential Management** (6/6 ✅ 100%)

- **`credentials_add`** - Add encrypted credentials (multiple types supported)
- **`credentials_get`** - Retrieve and decrypt stored credentials
- **`credentials_list`** - List all credentials (metadata only, secure)
- **`credentials_remove`** - Remove credentials from secure store
- **`credentials_rotate_key`** - Rotate encryption keys with re-encryption
- **Credential Audit Log** - Comprehensive audit trail for all credential operations

### 🖥️ **Zabbix Monitoring Tools** (7/7 ✅ 100%)

- **`zabbix_host_discover`** - List all monitored hosts
- **`zabbix_get_metrics`** - Retrieve host performance metrics
- **`zabbix_get_alerts`** - Retrieve active alerts and problems
- **`zabbix_get_inventory`** - Get detailed host inventory
- **`zabbix_get_problems`** - Retrieve current active problems
- **`zabbix_get_events`** - Retrieve historical events for audit/analysis
- **`zabbix_get_triggers`** - Retrieve and manage trigger configurations

#### Example: Discover Zabbix Hosts

```bash
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -d '{"method": "tools/call", "params": {"name": "zabbix_host_discover", "arguments": {"baseUrl": "http://localhost:8080", "username": "Admin", "password": "zabbix"}}}'
```

#### Example: Get Zabbix Host Metrics

```bash
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -d '{"method": "tools/call", "params": {"name": "zabbix_get_metrics", "arguments": {"baseUrl": "http://localhost:8080", "username": "Admin", "password": "zabbix", "hostName": "Zabbix server"}}}'
```

#### Example: Get Zabbix Alerts

```bash
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -d '{"method": "tools/call", "params": {"name": "zabbix_get_alerts", "arguments": {"baseUrl": "http://localhost:8080", "username": "Admin", "password": "zabbix"}}}'
```

#### Example: Get Zabbix Host Inventory

```bash
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -d '{"method": "tools/call", "params": {"name": "zabbix_get_inventory", "arguments": {"baseUrl": "http://localhost:8080", "username": "Admin", "password": "zabbix"}}}'
```

### 🔍 **NMAP Scanning Tools** (5/5 ✅ 100%)

- **`nmap_ping_scan`** - Host discovery without port scanning (-sn)
- **`nmap_tcp_connect_scan`** - TCP Connect scan for open ports (-sT)
- **`nmap_tcp_syn_scan`** - Stealth SYN scan with capability-based privileges (-sS)
- **`nmap_udp_scan`** - UDP port scanning with privilege escalation (-sU)
- **`nmap_version_scan`** - Service version detection with comprehensive probing (-sV)

#### 🛡️ **Advanced Security Implementation**

Our NMAP tools implement **capability-based security** for privileged network operations while maintaining non-root execution:

**Security Features:**

- ✅ **Linux Capabilities**: `NET_RAW`, `NET_ADMIN`, `NET_BIND_SERVICE` for minimal privilege escalation
- ✅ **Non-Root Execution**: All tools run as `mcpuser` with restricted capabilities
- ✅ **Container Security**: Docker capability model prevents privilege escalation attacks
- ✅ **Automatic Privilege Detection**: Tools automatically detect and use appropriate scan methods

#### 🎯 **NMAP Usage Examples**

```bash
# Host discovery (ping scan) - No privileges required
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -d '{"method": "tools/call", "params": {"name": "nmap_ping_scan", "arguments": {"target": "192.168.1.0/24"}}}'

# TCP Connect scan - Standard user privileges
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -d '{"method": "tools/call", "params": {"name": "nmap_tcp_connect_scan", "arguments": {"target": "scanme.nmap.org", "ports": "22,80,443"}}}'

# Stealth SYN scan - Uses capability-based privileges
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -d '{"method": "tools/call", "params": {"name": "nmap_tcp_syn_scan", "arguments": {"target": "172.20.0.22", "ports": "22,80,443,8080", "timing_template": 4}}}'

# UDP scan - Privileged operation with capability escalation
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -d '{"method": "tools/call", "params": {"name": "nmap_udp_scan", "arguments": {"target": "172.20.0.22", "ports": "53,161,514", "top_ports": 100}}}'

# Service version detection - Comprehensive probing
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -d '{"method": "tools/call", "params": {"name": "nmap_version_scan", "arguments": {"target": "172.20.0.22", "ports": "8080", "intensity": 7}}}'
```

#### 📊 **NMAP Scan Results**

Recent validation testing achieved 100% success across all scan types:

```bash
# SYN Scan Results - Zabbix Server
Target: 172.20.0.22 (ports 22,80,443,8080)
Results: 1 open (8080/tcp), 3 closed
Service: nginx 1.26.2 on port 8080

# UDP Scan Results - Network Services
Target: 172.20.0.22 (ports 53,161,514)
Results: All ports filtered/closed
Scan completed in 3.08 seconds

# Version Detection Results
Port 8080/tcp: nginx 1.26.2
Confidence: 100%
Method: probe response analysis
```

### 🏗️ **Proxmox Cluster Management** (10/10 ✅ 100%)

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

### 📡 **SNMP Device Discovery** (12/12 ✅ 100%)

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
- **`snmp_service_discovery`** - Discover running services and listening ports
- **`snmp_network_topology`** - Map network topology using CDP/LLDP protocols

### 🔐 **Enterprise Credential Management** (5/5 ✅ 100%)

- **`credentials_add`** - Add encrypted credentials (multiple types supported)
- **`credentials_get`** - Retrieve and decrypt stored credentials
- **`credentials_list`** - List all credentials (metadata only, secure)
- **`credentials_remove`** - Remove credentials from secure store
- **`credentials_rotate_key`** - Rotate encryption keys with re-encryption

---

## 📊 **MCP Resources & Prompts**

### **📋 Available Resources** (1 resource)

- **Credential Store** - Unified encrypted credential management and access

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
# Production deployment with all components (from repo root)
docker compose -f docker/docker-compose.yml up -d

# Scale for high availability
docker compose -f docker/docker-compose.yml up -d --scale mcp-server=3

# Monitor health and logs
docker compose -f docker/docker-compose.yml logs -f mcp-server
curl http://localhost:3000/health
```

### **🔧 Configuration Options**

```javascript
// Environment variables for production
MCP_TRANSPORT_MODE = http; // Transport: http, stdio, websocket
MCP_SERVER_PORT = 3000; // HTTP server port
MCP_LOG_LEVEL = info; // Logging: debug, info, warn, error
MCP_MAX_CONNECTIONS = 100; // Connection limits
MCP_REQUEST_TIMEOUT = 30000; // Request timeout (ms)
MCP_RATE_LIMITING = true; // Enable rate limiting
MCP_SECURITY_MODE = standard; // Security level
```

### **📈 Health Monitoring**

```bash
# Health endpoint
GET /health
{
  "status": "healthy",
  "uptime": "2h 15m 30s",
  "tools": { "total": 61, "loaded": 61, "dynamic": true },
  "memory": { "used": "45MB", "available": "955MB" },
  "hot_reload": { "enabled": true, "modules": 7 }
}

# Metrics endpoint
GET /metrics
# Prometheus-compatible metrics for monitoring
```

---

## 🎯 **Live Testing Results**

Our comprehensive testing against **real production infrastructure** achieved:

### **🏆 Overall Results**

- **✅ 100% Success Rate** (61/61 tools working including dynamic management)
- **✅ Production Validated** - Tested against live 6-node Proxmox cluster with hot-reload capabilities
- **✅ Zero Critical Failures** - All core infrastructure tools working including privileged operations
- **✅ Enterprise Ready** - Full credential management, hot-reload, and secure privilege escalation
- **🔥 Revolutionary Features** - World's first dynamic MCP registry with runtime module management

### **🔬 Testing Environment**

- **Production Proxmox Cluster**: 6 nodes, 45+ VMs, multiple storage backends
- **Live Network Infrastructure**: SNMP-enabled devices, switches, routers
- **Zabbix Test Environment**: Docker-based test server with sample data
- **Security Testing**: Credential encryption, audit trails, input validation
- **Hot-Reload Testing**: Runtime module loading, file watchers, database persistence

### **📊 Detailed Results by Category**

| **Perfect Categories (100%)**         | **Revolutionary Features**             |
| ------------------------------------- | -------------------------------------- |
| ✅ Registry Management (5/5) **NEW!** | 🔥 Runtime module loading              |
| ✅ Memory CMDB (8/8)                  | 🔥 Hot-reload with file watchers       |
| ✅ Proxmox Integration (10/10)        | 🔥 SQLite registry database            |
| ✅ Network Tools (9/9)                | 🔥 Self-managing tools                 |
| ✅ SNMP Discovery (12/12)             | 🔥 Zero-downtime updates               |
| ✅ Zabbix Monitoring (7/7)            | 🔥 Real-time analytics                 |
| ✅ NMAP Scanning (5/5)                | 🔥 Enterprise security with hot-reload |
| ✅ Credentials (5/5)                  |                                        |

**[View Complete Testing Report →](./docs/theincrediblejourney/LIVE_TESTING_REPORT.md)**

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
- **Non-Root Execution** - Container security best practices with capability-based privilege escalation
- **Linux Capabilities** - Minimal privilege model for network operations (NET_RAW, NET_ADMIN, NET_BIND_SERVICE)

### **⚡ Capability-Based Security Model**

Our innovative security approach provides enterprise-grade functionality while maintaining strict security boundaries:

```dockerfile
# Dockerfile - Minimal privilege escalation
RUN setcap cap_net_raw,cap_net_admin,cap_net_bind_service+eip /usr/bin/nmap
USER mcpuser  # Non-root execution
```

```yaml
# docker-compose.yml - Container capabilities
services:
  mcp-server:
    cap_add:
      - NET_RAW # Raw socket access for SYN/UDP scans
      - NET_ADMIN # Network admin for advanced operations
      - NET_BIND_SERVICE # Bind to privileged ports
```

**Security Benefits:**

- ✅ **Principle of Least Privilege**: Only necessary capabilities granted
- ✅ **Attack Surface Minimization**: No full root access required
- ✅ **Container Security**: Docker security model maintained
- ✅ **Audit Compliance**: All privileged operations logged and traceable

### **📋 Compliance Features**

- **ITIL v4 Standards** - Built-in CMDB classification and CI management
- **SOX/PCI/HIPAA Ready** - Compliance gap analysis prompts
- **Change Management** - Structured incident response frameworks
- **Access Controls** - Role-based credential management

---

## 📚 **Documentation**

### **The Incredible Journey**

**[Vibe-Coding Journey](./docs/theincrediblejourney/THE_INCREDIBLE_JOURNEY.md)** - The Incredible Vibe Coding Journey

### **📖 Complete Documentation**

- **[Architecture Guide](./docs/theincrediblejourney/DEVELOPER.md)** - System architecture and design patterns
- **[Deployment Guide](./docs/theincrediblejourney/DEPLOYMENT.md)** - Production deployment with capability-based security
- **[Testing Guide](./docs/theincrediblejourney/TESTING.md)** - Comprehensive testing procedures and NMAP validation
- **[Security Implementation](./docs/theincrediblejourney/SECURITY_IMPLEMENTATION.md)** - Detailed capability-based security model
- **[Usage Examples](./docs/theincrediblejourney/USAGE_EXAMPLES.md)** - Complete NMAP scanning examples and workflows
- **[MCP Compliance](./docs/theincrediblejourney/MCP_COMPLIANCE.md)** - MCP protocol implementation details
 - **[Environment Variables & Settings](./docs/ENVIRONMENT_VARIABLES.md)** - Comprehensive list of environment variables, defaults, and usage examples

### **📋 Development Resources**

- **[Migration Guide](./docs/theincrediblejourney/MCP_SDK_MIGRATION_PLAN.md)** - Upgrading from legacy versions
- **[Live Testing Report](./docs/theincrediblejourney/LIVE_TESTING_REPORT.md)** - Complete testing results
- **[VS Code Integration](./docs/theincrediblejourney/VSCODE_MCP_INTEGRATION.md)** - IDE integration guide

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

Mozilla Public License 2.0 (MPL-2.0) — see [LICENSE](./LICENSE) for details.

---

## 🙏 **Acknowledgments**

- **Anthropic** - For the Model Context Protocol specification
- **MCP SDK Team** - For the excellent official SDK
- **Community** - For testing, feedback, and contributions

---

<div align="center">

**� Revolutionary Dynamic Registry • 100% Success Rate • World's First Hot-Reload MCP Server �**

_Built with ❤️ for the future of AI capability management_

</div>
