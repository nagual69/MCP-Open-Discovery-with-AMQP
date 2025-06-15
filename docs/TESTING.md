# Testing Guide for MCP Open Discovery

This document describes the testing infrastructure and procedures for the MCP Open Discovery Server v2.0.

## 🚀 Quick Start

### Prerequisites

```bash
# Ensure Docker containers are running
docker-compose up -d

# Install dependencies
npm install
```

### Run All Tests

```bash
cd testing
node test_runner.js
```

### Run Specific Test Suites

```bash
# Container health and deployment tests
node test_container_health.js

# HTTP transport and MCP protocol tests
node test_http_transport.js

# SNMP network discovery tests
node test_snmp_network.js

# SDK server functionality tests
node test_modular_sdk_server.js
```

## 🧪 Test Structure

### Core Test Files (Active)

1. **`test_container_health.js`** - ⭐ **Container Deployment Tests**
   - Verifies Docker container health
   - Tests all 42 tools are loaded correctly
   - Validates MCP protocol endpoints

2. **`test_http_transport.js`** - ✅ **HTTP/SSE Transport Tests**
   - Tests HTTP transport functionality
   - Validates Server-Sent Events streaming
   - Session management and concurrent connections

3. **`test_snmp_network.js`** - ✅ **SNMP Network Discovery Tests**
   - Tests SNMP discovery with test containers
   - Device inventory and health monitoring
   - Network topology discovery

4. **`test_modular_sdk_server.js`** - ✅ **SDK Server Tests**

   - Tests MCP server initialization
   - Module loading verification
   - Tool registration validation

5. **`test_comprehensive.js`** - ✅ **Full Test Suite**
   - Complete end-to-end testing
   - All modules and functionality
   - Integration testing

## Test Environment Setup

### Prerequisites

1. **Docker Environment**: SNMP test agents running

   ```bash
   docker-compose -f testing/docker-compose-snmp-testing.yml up -d
   ```

2. **MCP Server**: Modular server container running

   ```bash
   docker-compose up -d
   ```

3. **Network**: Docker network `172.20.0.0/24` configured

### SNMP Test Targets

- `172.20.0.10` - Basic SNMP simulator
- `172.20.0.11` - Full-featured SNMP agent
- `172.20.0.12` - SNMP lab with custom MIBs

## Current Test Results ✅

- **SNMP Tests**: 10/10 PASSED (100% success rate)
- **Modular Server**: ✅ All modules loading correctly
- **Proxmox Integration**: ✅ API connectivity working
- **Overall Status**: 🎉 **FULLY FUNCTIONAL**

## SNMP Test Details

The SNMP test suite validates:

- ✅ Session management (create/close)
- ✅ Basic operations (GET, WALK, TABLE)
- ✅ Device inventory and discovery
- ✅ Interface discovery
- ✅ System health monitoring
- ✅ Service discovery
- ✅ Network topology mapping
- ✅ Multi-target support
- ✅ Error handling

## Troubleshooting

### Common Issues

- **SNMP timeouts**: Check Docker network connectivity
- **Module loading**: Verify all files copied to container
- **Permission errors**: Ensure proper file permissions

### Debug Commands

```bash
# Check container logs
docker logs busybox-network-mcp

# Test specific SNMP connectivity
docker exec busybox-network-mcp snmpget -v2c -c public 172.20.0.10:161 1.3.6.1.2.1.1.1.0

# Verify module loading
docker exec busybox-network-mcp node -e "console.log(require('./tools/snmp_module.js').getTools().length)"
```

## Test Development

### Adding New Tests

1. Add test configuration to `test_runner.js` TESTS object
2. Create focused test file following naming convention
3. Update this documentation
4. Ensure proper exit codes and error handling

### Test Categories

- **Functional Tests**: Core functionality validation
- **Integration Tests**: Module interaction validation
- **Network Tests**: Docker network and SNMP connectivity
- **Error Handling**: Graceful failure and timeout testing
