# MCP Open Discovery Protocol Compliance

This document outlines how the MCP Open Discovery server (main class: `MCPOpenDiscoveryServer`) aligns with the Model Context Protocol (MCP) specification and describes the in-memory CMDB (Configuration Management Database) model.

## Proxmox API and CMDB Integration

The server natively supports Proxmox cluster discovery and inventory. Proxmox resources (nodes, VMs, containers, storage, networks) are ingested into the in-memory CMDB, supporting hierarchical queries and relationship mapping. Credential management is built-in for secure multi-cluster support.

- Proxmox API tools are exposed as first-class MCP tools (see README and usage_example.md)
- Proxmox CIs are stored with parent/child relationships and can be queried or merged incrementally
- The CMDB model supports enrichment, deduplication, and validation before committing to a persistent database

## Core Compliance

Our server implements the core requirements of JSON-RPC 2.0 and the MCP specification, including:

- Correct request and response structures (`jsonrpc: "2.0"`, `id`, `method`, `params`, `result`, `error`).
- Standard MCP methods like `tools/list` and `tools/call`.
- Appropriate error handling and codes.

## Key MCP Methods Implemented

- **`initialize`**: Handles session initialization, including client capabilities.
- **`tools/list`**: Returns a list of available tools (BusyBox and Nmap) with their schemas.
- **`tools/call`**: Executes the specified tool with provided arguments.
- **`notifications/initialized`**: Sent by the client after it has been initialized.

## Content Types

The server primarily uses the `text` content type for tool outputs.

## In-Memory CMDB Model

The server implements a hierarchical, in-memory CMDB for storing and querying configuration items (CIs) such as clusters, nodes, VMs, containers, storage, and networks. Each CI is stored with a unique key and may reference a parent CI, supporting easy relationship mapping and queries.

- Cluster > Node > VM/Container
- Storage and Network CIs are linked to nodes and the cluster
- Resource pools and other logical groupings are supported

See `mcp_server.js` for implementation details and the current memory structure.

## Test Scripts

- **Active:** `test_credentials.js`, `test_proxmox_formatting.js`, `test_proxmox.js`
- **Archived:** See `archive/` and `TEST_README.md` for legacy/deprecated scripts.

## Further Information

For detailed information on the MCP specification itself, please visit [modelcontextprotocol.io](https://modelcontextprotocol.io). For information about this server's specific implementation, tools, and usage, see the main [README.md](../README.md).
