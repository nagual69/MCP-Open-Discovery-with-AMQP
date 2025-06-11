# MCP Open Discovery Server - Modular Architecture

This document describes the modular architecture of the MCP Open Discovery Server.

## Overview

The MCP Open Discovery Server has been refactored to use a modular approach for organizing and loading tool definitions. This improves maintainability, flexibility, and makes it easier to add new tool categories in the future.

## Module Structure

The tools are organized into the following modules:

- **Network Tools**: Basic network tools like ping, wget, nslookup, etc.
- **Nmap Tools**: Nmap scanning tools like ping scan, TCP SYN scan, etc.
- **Memory Tools**: In-memory CMDB tools for storing and retrieving configuration items.
- **Proxmox Tools**: Tools for interacting with Proxmox VE API.
- **SNMP Tools**: Tools for SNMP discovery and monitoring.

## File Structure

```
/mcp-open-discovery
  /tools
    memory_tools.js     # In-memory CMDB tools
    network_tools.js    # Basic network tools
    nmap_tools.js       # Nmap scanning tools
    proxmox_tools.js    # Proxmox API tools
    snmp_module.js      # SNMP tools wrapper
    module_loader.js    # Dynamic module loader
  mcp_server.js         # Original server implementation
  mcp_server_modular.js # New modular server implementation
  snmp_tools.js         # Original SNMP tools implementation
```

## Module Interface

Each module exports a function to get its tools:

```javascript
/**
 * Returns the tool definitions for this module
 * @param {Object} server - Reference to the server instance for context
 * @returns {Array} Array of tool definitions
 */
function getTools(server) {
  return [
    // Tool definitions
  ];
}

module.exports = {
  getTools,
};
```

The memory tools module also exports an initialization function:

```javascript
/**
 * Initialize the memory tools module
 * @param {Object} ciMemory - Reference to the in-memory CI store
 */
function initialize(ciMemory) {
  // Initialize module
}

module.exports = {
  initialize,
  getTools,
};
```

## Loading Modules

The module loader (`tools/module_loader.js`) is responsible for loading all modules and registering their tools with the server:

```javascript
/**
 * Loads all tool modules and registers their tools with the server
 * @param {Object} server - The MCP server instance
 * @param {Object} options - Additional options
 */
async function loadAllModules(server, options = {}) {
  // Load modules
}
```

## Using the Modular Server

To use the modular server, simply require and initialize it:

```javascript
const MCPOpenDiscoveryServer = require("./mcp_server_modular");

const server = new MCPOpenDiscoveryServer();
await server.initialize();
```

## Testing

Run the test script to verify that the modular server works:

```
node test_modular_server.js
```

## Benefits of Modular Architecture

- **Maintainability**: Each module focuses on a specific category of tools.
- **Flexibility**: New tool categories can be added without modifying the core server.
- **Organization**: Tool definitions are grouped logically by function.
- **Separation of Concerns**: Modules only depend on what they need.
- **Testability**: Modules can be tested independently.

## Docker Deployment

The modular server can be deployed using Docker. See [DOCKER_DEPLOYMENT.md](./DOCKER_DEPLOYMENT.md) for details.

## MCP Protocol Compliance

The modular server implementation has been updated to be fully compliant with the MCP specification. This includes:

- Proper format for the `initialize` response
- Correct structure for `tools/list` response with `inputSchema` instead of `schema`
- Appropriate `tools/call` response with content array

For more details, see the [MCP_COMPLIANCE.md](./MCP_COMPLIANCE.md) file.
