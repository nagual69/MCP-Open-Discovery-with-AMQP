# MCP Open Discovery - File Cleanup and Consolidation Plan

## Overview
Comprehensive cleanup to eliminate redundant files, consolidate documentation, and organize the enterprise-focused MCP network discovery server.

## Current Issues Identified

### 🔴 Root Directory (16 files) - NEEDS CLEANUP
**Redundant/Outdated:**
- `package_json.json` - Duplicate of package.json
- `docker_compose.txt` - Text version of docker-compose.yml
- `Dockerfile.modular` - Redundant dockerfile
- `vscode-builds-proxmox-CMDB-in-MCP-Memory.txt` - Large log file (should be archived)
- `proxmox_cmdb_in_memory.json` - Example data (move to reference)
- `proxmox_credentials.json` - Example data (move to reference)  
- `proxmox_test_results.txt` - Test output (should be archived)
- `ci_builder_nodered.json` - Example data (move to reference)
- `vscode-mcp-config.json` - Move to docs
- `rebuild_deploy.ps1` - Deployment script (consolidate with docs)

**Keep:**
- `package.json` - Essential
- `docker-compose.yml` - Essential
- `Dockerfile` - Essential
- `README.md` - Essential (needs consolidation)
- `mcp_server_multi_transport_sdk.js` - Main server
- `.gitignore` - Essential

#### Root Directory Cleanup:
```
package_json.json                           # Duplicate of package.json
docker_compose.txt                          # Text duplicate of docker-compose.yml  
Dockerfile.modular                          # Redundant dockerfile
vscode-builds-proxmox-CMDB-in-MCP-Memory.txt  # Large log file
proxmox_test_results.txt                    # Test output file
```

### 🔴 docs/ Directory (20 files) - MAJOR CONSOLIDATION NEEDED
**Redundant Documentation:**
- Multiple migration docs overlap significantly
- Duplicate README files  
- Scattered testing documentation
- Architecture docs need consolidation

**Consolidation Plan:**
1. **Main Docs** (Keep & Consolidate):
   - `README.md` (root) - Main project documentation
   - `DEPLOYMENT.md` - Container deployment guide
   - `DEVELOPER.md` - Development guide
   - `TESTING.md` - Testing documentation
   - `MCP_COMPLIANCE.md` - MCP protocol compliance

2. **Archive/Remove:**
   - `MIGRATION_COMPLETE.md` - Move to archive (historical)
   - `MCP_SDK_MIGRATION_PLAN.md` - Move to archive (completed)
   - `MODULAR_ARCHITECTURE.md` - Merge into DEVELOPER.md
   - `MODULARIZATION_SUMMARY.md` - Move to archive
   - `README_MODULAR.md` - Redundant
   - Conversation history files - Archive
   - Multiple testing docs - Consolidate into TESTING.md

#### Documentation Cleanup:
```
docs/MIGRATION_COMPLETE.md                 # Historical - archive
docs/MCP_SDK_MIGRATION_PLAN.md            # Completed migration plan - archive
docs/MODULAR_ARCHITECTURE.md              # Merge into DEVELOPER.md then delete
docs/MODULARIZATION_SUMMARY.md            # Historical - archive  
docs/README_MODULAR.md                     # Redundant with main README
docs/Conversation_History.mdc              # Archive conversation logs
docs/TEST_IMPROVEMENTS.md                  # Merge into TESTING.md then delete
docs/TEST_README.md                        # Merge into TESTING.md then delete
docs/vscode_mcp_tools_test.md              # Merge into VSCODE_MCP_INTEGRATION.md then delete
docs/usage_example.md                      # Merge into main README then delete
docs/mcp-open-discovery-logo.png           # Duplicate of root logo
```

### 🔴 testing/ Directory (16 files) - STREAMLINE NEEDED
**Issues:**
- Multiple overlapping test files
- Legacy test files still present
- Duplicate SNMP tools in testing
- Audit tools mixed with functional tests

**Cleanup Plan:**
1. **Keep Core Tests:**
   - `test_runner.js` - Main test orchestrator
   - `test_container_health.js` - Container deployment tests
   - `test_http_transport.js` - HTTP transport tests
   - `test_snmp_network.js` - SNMP integration tests
   - `test_sdk_server.js` - SDK server tests

2. **Archive/Remove:**
   - Legacy server tests (modular, comprehensive)
   - Duplicate SNMP tools
   - Old test configurations
   - Individual module tests (consolidate into main tests)

#### Testing Directory Cleanup:
```
testing/test_modular_server.js             # Legacy test
testing/test_modular_sdk_server.js         # Redundant with test_sdk_server.js
testing/test_comprehensive.js              # Legacy comprehensive test
testing/test_memory_tools.js               # Standalone test (consolidate)
testing/test_proxmox.js                    # Legacy test file
testing/test_proxmox_sdk.js                # Redundant with container tests
testing/test_snmp_final.js                 # Legacy SNMP test
testing/test_snmp_sdk.js                   # Redundant with network tests
testing/test_stdio_client.js               # Legacy client test
testing/snmp_tools.js                      # Duplicate SNMP tools in testing
testing/simple_test.js                     # Basic test (merge into runner)
testing/audit_static_compliance.js         # Move to archive
testing/test_init.json                     # Outdated config
testing/docker-compose-snmp-testing.yml    # Duplicate of root docker compose
```

## Cleanup Actions

### 🗑️ Files to DELETE from Git:

### 📁 Files to MOVE to Reference:
```
proxmox_cmdb_in_memory.json    → reference/examples/
proxmox_credentials.json       → reference/examples/  
ci_builder_nodered.json        → reference/examples/
```

### 📁 Files to MOVE to Archive:
```
vscode-builds-proxmox-CMDB-in-MCP-Memory.txt → archive/
proxmox_test_results.txt                     → archive/
docs/MIGRATION_COMPLETE.md                   → archive/
docs/MCP_SDK_MIGRATION_PLAN.md              → archive/
docs/MODULARIZATION_SUMMARY.md              → archive/
docs/Conversation_History.mdc                → archive/
testing/audit_static_compliance.js           → archive/
```

### 📋 Files to CONSOLIDATE then DELETE:

#### Merge into README.md:
- `docs/usage_example.md` - Add examples to main README
- `rebuild_deploy.ps1` - Add deployment instructions

#### Merge into DEVELOPER.md:
- `docs/MODULAR_ARCHITECTURE.md` - Architecture details
- Relevant parts of migration docs

#### Merge into TESTING.md:
- `docs/TEST_IMPROVEMENTS.md` - Testing improvements
- `docs/TEST_README.md` - Testing documentation
- Consolidate individual test file purposes

#### Merge into VSCODE_MCP_INTEGRATION.md:
- `docs/vscode_mcp_tools_test.md` - VS Code testing info
- `vscode-mcp-config.json` - Add config examples to docs

## Consolidation Actions

### 📚 Documentation Consolidation Plan:
