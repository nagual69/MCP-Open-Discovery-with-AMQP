# MCP Open Discovery v2.0 🚀

<div align="left">
  <img src="./mcp-open-discovery-logo.png" width="125" style="float: left; margin-left: 15px;" alt="MCP Open Discovery Logo">
</div>

**A production-ready infrastructure discovery and CMDB platform delivering 50 powerful tools through the official Model Context Protocol (MCP) SDK. Built for AI assistants, automation systems, and enterprise infrastructure management with 91% tool success rate and full MCP compliance.**

<br clear="left">

[![Release Ready](https://img.shields.io/badge/Release-Ready-brightgreen)](./archive/LIVE_TESTING_REPORT.md)
[![Tools Available](https://img.shields.io/badge/Tools-50-blue)](#-tool-categories)
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
│  🔧 50 Tools    📊 In-Memory CMDB    🔐 Secure Credentials │
│  🌐 Multi-Transport   📈 Health Monitoring   🛡️ Enterprise Security │
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
- **🔐 Credential Manager:** Enterprise-grade encrypted credential storage with audit trails
- **📈 Health Monitoring:** Comprehensive health checks, request timing, and structured logging
- **🐳 Container-First:** Production-ready Docker deployment with non-root execution

---

## 🎯 **Tool Categories & Success Rates**

| Category                  | Tools | Success Rate  | Status    | Capabilities                          |
| ------------------------- | ----- | ------------- | --------- | ------------------------------------- |
| **Memory CMDB**           | 4/4   | ✅ **100%**   | Perfect   | CI storage, relationships, querying   |
| **Proxmox Integration**   | 10/10 | ✅ **100%**   | Perfect   | Full cluster management, VMs, storage |
| **Credential Management** | 5/5   | ✅ **100%**   | Perfect   | Encrypted storage, audit trails       |
| **Network Tools**         | 7/8   | ✅ **87.5%**  | Excellent | Ping, traceroute, port scanning       |
| **SNMP Discovery**        | 10/12 | ✅ **83.3%**  | Excellent | Device inventory, topology analysis   |
| **Nagios Monitoring**     | 6/6   | ✅ **100%\*** | Perfect   | Status monitoring, alerting           |
| **NMAP Scanning**         | 3/5   | ⚠️ **60%**    | Good      | Basic network scanning                |

**Total: 45/50 tools working (90% success rate)** | _\*Partial results as expected_

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
        "username": "root",
        "password": "your-password",
        "url": "https://pve.example.com:8006",
        "notes": "Proxmox VE cluster primary, realm:pam, verify_ssl:true"
      }
    }
  }'

# Add Nagios credentials
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "method": "tools/call",
    "params": {
      "name": "credentials_add",
      "arguments": {
        "id": "nagios-xi",
        "type": "apiKey",
        "apiKey": "your-api-key",
        "url": "https://nagios.example.com/nagiosxi"
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
  -d '{"method": "tools/call", "params": {"name": "proxmox_cluster_resources", "arguments": {"creds_id": "proxmox-main"}}}'
```

---

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
- **`nmap_udp_scan`** - UDP port scanning (-sU) _[Partial]_
- **`nmap_version_scan`** - Service version detection (-sV) _[Partial]_

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

**Note:** Proxmox credential management is now handled by the unified credential system:

- Use **`credentials_add`** (with `type="password"`) to add Proxmox credentials
- Use **`credentials_list`** to manage all credential types including Proxmox
- Use **`credentials_remove`** to remove stored credentials

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

### 🏥 **Nagios XI Monitoring** (6/6 ✅ 100%\*)

- **`nagios_get_host_status`** - Host status with filtering and pagination
- **`nagios_get_service_status`** - Service status monitoring
- **`nagios_get_event_log`** - Event log analysis with time filtering
- **`nagios_get_host_config`** - Host configuration inventory
- **`nagios_get_service_config`** - Service configuration details
- **`nagios_acknowledge_alert`** - Acknowledge alerts and incidents

_\*Returns partial results as expected for monitoring integration_

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
  "tools": { "total": 50, "loaded": 50 },
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

- **✅ 90% Success Rate** (45/50 tools working)
- **✅ Production Validated** - Tested against live 6-node Proxmox cluster
- **✅ Zero Critical Failures** - All core infrastructure tools working
- **✅ Enterprise Ready** - Full credential management and audit trails

### **🔬 Testing Environment**

- **Production Proxmox Cluster**: 6 nodes, 45+ VMs, multiple storage backends
- **Live Network Infrastructure**: SNMP-enabled devices, switches, routers
- **Nagios Core Integration**: Real monitoring data and alerting
- **Security Testing**: Credential encryption, audit trails, input validation

### **📊 Detailed Results by Category**

| **Perfect Categories (100%)**  | **Excellent Categories (80%+)**   | **Good Categories (60%+)** |
| ------------------------------ | --------------------------------- | -------------------------- |
| ✅ Memory CMDB (4/4)           | ✅ Network Tools (7/8 - 87.5%)    | ⚠️ NMAP Tools (3/5 - 60%)  |
| ✅ Proxmox Integration (10/10) | ✅ SNMP Discovery (10/12 - 83.3%) |                            |
| ✅ Credentials (5/5)           |                                   |                            |
| ✅ Nagios Monitoring (6/6\*)   |                                   |                            |

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

## � **Documentation**

### **Implementation Guides**

- **[Phase 1 Implementation Guide](./docs/PHASE_1_IMPLEMENTATION.md)** - Complete Zabbix integration and 52-tool deployment
- **[Quick Reference Guide](./docs/QUICK_REFERENCE.md)** - Essential commands and configurations
- **[Vision and Roadmap](./docs/VISION_AND_ROADMAP.md)** - Project vision and multi-phase expansion plan

### **Technical Documentation**

- **[Testing Guide](./docs/TESTING.md)** - Comprehensive testing procedures
- **[Deployment Guide](./docs/DEPLOYMENT.md)** - Production deployment instructions
- **[MCP Compliance](./docs/MCP_COMPLIANCE.md)** - MCP specification compliance details
- **[Developer Guide](./docs/DEVELOPER.md)** - Development setup and contribution guidelines

### **Current Status**

- **✅ Phase 1 Complete**: 52 tools deployed with Zabbix monitoring integration
- **🎯 Tools Available**: 52 across 8 categories (Memory, Network, SNMP, NMAP, Proxmox, Credentials, Filesystem, Zabbix)
- **🌐 Network Architecture**: Unified Docker networking with comprehensive testing environment
- **📊 Success Rate**: 91% overall tool success rate in production testing

---

## �📄 **License**

MIT License - See [LICENSE](./LICENSE) for details.

---

## 🙏 **Acknowledgments**

- **Anthropic** - For the Model Context Protocol specification
- **MCP SDK Team** - For the excellent official SDK
- **Zabbix Team** - For the enterprise monitoring platform
- **Community** - For testing, feedback, and contributions

---

<div align="center">

**🚀 Phase 1 Complete • 52 Tools Deployed • Enterprise Grade 🚀**

_Built with ❤️ for the infrastructure automation community_

</div>
