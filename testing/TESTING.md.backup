# MCP Open Discovery Testing Guide

This document provides information on how to use the test scripts for the MCP Open Discovery server.

## Available Test Scripts

There are two test scripts available:

1. **simple_test.js** - A basic test script that verifies server connectivity and basic functionality
2. **test_comprehensive.js** - A comprehensive test script that tests all modules and tools

## Running Tests with PowerShell

The easiest way to run tests on Windows is using the PowerShell test runner script:

```powershell
# Run all tests
.\run_tests.ps1

# Run specific modules
.\run_tests.ps1 network memory

# Show help
.\run_tests.ps1 -help
```

### PowerShell Script Options

```powershell
# Skip errors and continue testing
.\run_tests.ps1 -SkipErrors

# Show detailed debug output
.\run_tests.ps1 -Debug

# Include only specific tools
.\run_tests.ps1 -Include "ping,wget,nmap_ping_scan"

# Exclude specific tools
.\run_tests.ps1 -Exclude "telnet,snmp_get"

# Test against a different server
.\run_tests.ps1 -ServerUrl "http://192.168.1.100:3000"
```

## Test Comprehensive Script

The comprehensive test script allows for flexible testing of all MCP Open Discovery modules and tools.

### Usage

```bash
node test_comprehensive.js [options] [group1 group2 ...]
```

### Options

- `--skip-errors` - Continue testing even if some tests fail
- `--exclude=tool1,tool2` - Exclude specific tools from testing
- `--include=tool1,tool2` - Only test specific tools
- `--debug` - Show more detailed debug information

### Groups

You can specify one or more groups to test:

- `network` - Test network tools (ping, wget, etc.)
- `nmap` - Test nmap scanning tools
- `memory` - Test in-memory CMDB tools
- `proxmox` - Test Proxmox API tools
- `snmp` - Test SNMP tools

### Examples

```bash
# Test all tools
node test_comprehensive.js

# Test only network and memory tools
node test_comprehensive.js network memory

# Test all tools, continue on failures
node test_comprehensive.js --skip-errors

# Skip problematic tools
node test_comprehensive.js --exclude=telnet,snmp_get

# Only test specific tools
node test_comprehensive.js --include=ping,nmap_ping_scan

# Show detailed debug information
node test_comprehensive.js --debug
```

### Environment Variables

- `MCP_SERVER_URL` - URL of the MCP server (default: http://localhost:3000)

### Notes on Tool Testing

#### Network Tools

Most network tools should work in the Docker container without issues. Telnet is disabled by default as it may not be available.

#### Nmap Tools

Nmap tools require different privileges:

- `nmap_ping_scan` and `nmap_tcp_connect_scan` work without special privileges
- `nmap_tcp_syn_scan` and `nmap_udp_scan` require root privileges (work in Docker when running as root)

#### Proxmox Tools

Proxmox tools require a valid Proxmox server to connect to. The test script provides several ways to configure and test against a real Proxmox server:

1. **Interactive Prompting**: When you run `node test_comprehensive.js proxmox`, the script will prompt you for Proxmox server details.

2. **Command Line Options**:

   ```bash
   # Using username/password authentication
   node test_comprehensive.js proxmox --proxmox-server=pve.example.com --proxmox-user=root@pam --proxmox-password=secret

   # Using API token authentication (recommended, especially with 2FA)
   node test_comprehensive.js proxmox --proxmox-server=pve.example.com --proxmox-token-name=user@pam!token --proxmox-token-value=secret
   ```

3. **Environment Variables**:

   - `PROXMOX_SERVER` - Hostname of the Proxmox server
   - `PROXMOX_USER` - Username for Proxmox authentication (e.g., root@pam)
   - `PROXMOX_PASSWORD` - Password for Proxmox authentication
   - `PROXMOX_TOKEN_NAME` - API token name (alternative to username/password)
   - `PROXMOX_TOKEN_VALUE` - API token value
   - `PROXMOX_NODE` - Node name (default: pve)
   - `PROXMOX_VMID` - VM ID for testing (default: 100)

4. **PowerShell Script**:

   ```powershell
   # Using username/password authentication
   .\run_tests.ps1 proxmox -ProxmoxServer pve.example.com -ProxmoxUser root@pam

   # Using API token authentication
   .\run_tests.ps1 proxmox -ProxmoxServer pve.example.com -ProxmoxTokenName user@pam!token -ProxmoxTokenValue secret
   ```

#### API Token Authentication

Using API tokens is recommended for Proxmox VE 6.2 and later, especially when 2FA is enabled. To create an API token:

1. Log in to the Proxmox web interface
2. Go to Datacenter → Permissions → API Tokens
3. Click "Add" and select the user
4. Enter a token ID (e.g., "testtoken")
5. Decide whether to grant privilege separation
6. Click "Create"

The token name format is `user@realm!tokenid` (e.g., `root@pam!testtoken`).

If you don't provide any Proxmox configuration, the Proxmox tests will be skipped with a message.

#### SNMP Tools

SNMP tools are skipped by default as they require a valid SNMP device to connect to.

### Dependencies

Some tools depend on other tools to run successfully. For example, all Proxmox tools that require a valid credential depend on `proxmox_creds_add` to run successfully first.

The test script automatically tracks dependencies and skips tests if a dependency has failed or was not run.
