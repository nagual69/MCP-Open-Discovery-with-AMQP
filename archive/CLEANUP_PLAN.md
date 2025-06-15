# File Cleanup and Organization Plan

## ✅ Active Files (Keep)

### Core Server
- `mcp_server_multi_transport_sdk.js` - Main active server (used in Dockerfile and package.json)
- `package.json`, `package-lock.json` - Dependencies and scripts
- `Dockerfile`, `docker-compose.yml` - Container deployment
- `README.md` - Main documentation
- `.gitignore` - Git configuration

### Tools (SDK Versions Only)
- `tools/sdk_tool_registry.js` - Tool registration system
- `tools/module_loader.js` - Module loading
- `tools/memory_tools_sdk.js` - Memory/CMDB tools (SDK)
- `tools/network_tools_sdk.js` - Network discovery tools (SDK)
- `tools/nmap_tools_sdk.js` - NMAP scanning tools (SDK)
- `tools/proxmox_tools_sdk.js` - Proxmox integration tools (SDK)
- `tools/snmp_tools_sdk.js` - SNMP monitoring tools (SDK)

### Configuration
- `vscode-mcp-config.json` - VS Code integration config
- `snmp-data/` - SNMP test data

### Documentation (Consolidated)
- `docs/DEPLOYMENT.md` - Container deployment guide
- `docs/TESTING.md` - Testing procedures
- `docs/VSCODE_MCP_INTEGRATION.md` - VS Code integration
- `docs/MCP_COMPLIANCE.md` - MCP protocol compliance
- `docs/MIGRATION_COMPLETE.md` - Migration summary

### Testing (Active)
- `testing/test_container_health.js` - Container deployment tests
- `testing/test_http_transport.js` - HTTP/SSE transport tests
- `testing/test_snmp_network.js` - SNMP discovery tests
- `testing/test_modular_sdk_server.js` - SDK server tests
- `testing/run_tests.ps1` - PowerShell test runner

## 🗑️ Deprecated Files (Move to Archive or Delete)

### Old Server Versions
- `mcp_server_modular.js` - Replaced by SDK version
- `mcp_server_modular_sdk.js` - Intermediate version, replaced by multi-transport
- `mcp_server_sdk.js` - Early SDK version, replaced
- `mcp_inspector_launcher.js` - No longer needed
- `mcp_proxy.js` - Not used

### Old Tool Versions (Non-SDK)
- `tools/memory_tools.js` - Replaced by SDK version
- `tools/network_tools.js` - Replaced by SDK version
- `tools/nmap_tools.js` - Replaced by SDK version
- `tools/proxmox_tools.js` - Replaced by SDK version
- `tools/snmp_module.js` - Replaced by SDK version

### Duplicate/Old Config Files
- `docker-package.json` - Duplicate of package.json
- `package_json.json` - Duplicate
- `docker_compose.txt` - Text version of docker-compose.yml
- `Dockerfile.modular` - Old Dockerfile version
- `docker-compose-snmp-testing.yml` - Duplicate in testing/

### Old Test Files
- `testing/test_modular_server.js` - Tests old server
- `testing/test_sdk_server.js` - Tests intermediate SDK server
- `testing/test_snmp_final.js` - Replaced by test_snmp_network.js
- `testing/test_snmp_sdk.js` - Duplicate functionality
- `testing/test_proxmox_sdk.js` - Duplicate functionality
- `testing/simple_test.js` - Basic test, no longer needed
- `testing/direct_connection_helper.js` - Not used
- `testing/audit_mcp_compliance.js` - Static analysis, moved to archive
- `testing/audit_static_compliance.js` - Static analysis, moved to archive

### Documentation (Redundant)
- `docs/MODULAR_ARCHITECTURE.md` - Covered in other docs
- `docs/MODULARIZATION_SUMMARY.md` - Historical, not needed
- `docs/README_MODULAR.md` - Old version
- `docs/TEST_IMPROVEMENTS.md` - Historical
- `docs/TEST_README.md` - Covered in TESTING.md
- `docs/SNMP_TESTING_GUIDE.md` - Covered in TESTING.md
- `docs/DEVELOPER.md` - Redundant with other docs
- `docs/usage_example.md` - Outdated examples
- `docs/vscode_mcp_tools_test.md` - Covered in VSCODE_MCP_INTEGRATION.md

### Data Files (Historical)
- `proxmox_cmdb_in_memory.json` - Test data
- `proxmox_credentials.json` - Test data
- `proxmox_test_results.txt` - Test output
- `vscode-builds-proxmox-CMDB-in-MCP-Memory.txt` - Historical
- `ci_builder_nodered.json` - Not related to current project

### Scripts
- `rebuild_deploy.ps1` - Old deployment script

## 📁 Directory Structure (Target)

```
mcp-open-discovery/
├── README.md
├── package.json
├── package-lock.json
├── Dockerfile
├── docker-compose.yml
├── vscode-mcp-config.json
├── mcp_server_multi_transport_sdk.js
├── docs/
│   ├── DEPLOYMENT.md
│   ├── TESTING.md
│   ├── VSCODE_MCP_INTEGRATION.md
│   ├── MCP_COMPLIANCE.md
│   └── MIGRATION_COMPLETE.md
├── tools/
│   ├── sdk_tool_registry.js
│   ├── module_loader.js
│   ├── memory_tools_sdk.js
│   ├── network_tools_sdk.js
│   ├── nmap_tools_sdk.js
│   ├── proxmox_tools_sdk.js
│   └── snmp_tools_sdk.js
├── testing/
│   ├── test_container_health.js
│   ├── test_http_transport.js
│   ├── test_snmp_network.js
│   ├── test_modular_sdk_server.js
│   └── run_tests.ps1
├── snmp-data/
│   └── public.snmprec
├── archive/
│   └── [historical files]
└── reference/
    └── [example data for AI]
```
