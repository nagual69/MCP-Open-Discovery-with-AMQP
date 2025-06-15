# Testing Guide for MCP Open Discovery

This document describes the testing infrastructure and procedures for the MCP Open Discovery Server.

## Quick Start

### Run All Tests

```bash
cd testing
node test_runner.js
```

### Run Specific Test Suites

```bash
# SNMP tests only
node test_runner.js --snmp

# Proxmox tests only
node test_runner.js --proxmox

# Multiple test suites
node test_runner.js --snmp --proxmox --verbose
```

## Test Structure

### Essential Test Files

1. **`test_runner.js`** - ⭐ **Master Test Runner**

   - Unified entry point for all testing
   - Supports selective test execution
   - Provides comprehensive reporting

2. **`test_snmp_final.js`** - ✅ **SNMP Comprehensive Tests**

   - Tests all 12 SNMP tools and functions
   - 100% pass rate on Docker environment
   - Covers device discovery, inventory, health checks

3. **`test_proxmox.js`** - ✅ **Proxmox API Integration Tests**

   - Tests Proxmox API connectivity
   - Credential management and encryption
   - Resource discovery and monitoring

4. **`test_modular_server.js`** - ✅ **Modular Server Tests**

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
