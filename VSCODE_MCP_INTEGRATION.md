# VS Code MCP Integration

This document provides a brief overview of integrating the MCP Open Discovery server (main class: `MCPOpenDiscoveryServer`) with VS Code. For complete setup, usage, and troubleshooting, please refer to the main [README.md](../README.md) and the [TEST_README.md](./TEST_README.md) for testing procedures.

## Proxmox Tooling in VS Code

- All Proxmox API tools (nodes, VMs, containers, storage, networks, credentials) are available in the VS Code MCP extension.
- You can add, list, and remove Proxmox credentials, and run cluster discovery directly from the VS Code Command Palette.
- Proxmox resource data is available for CMDB population, automation, and visualization in VS Code.

## Testing the Connection in VS Code

1.  Ensure the MCP server (Docker container) is running.
2.  Verify server accessibility (e.g., via `curl http://localhost:3000/health`).
3.  In VS Code:
    - Use "MCP: List Servers" to find and connect to "mcp-open-discovery-test".
    - Use "MCP: Execute Tool" to test tools like `ping` or Nmap scans.

For detailed steps and debugging, see the [VS Code Integration section in the main README.md](../README.md).

## Archived Test Scripts

As of June 5, 2025, all legacy test scripts and test result files have been archived to the `archive/` directory. See `archive/test_tools_cleanup_2025-06-05.txt` for details. These are no longer maintained in the main project.
