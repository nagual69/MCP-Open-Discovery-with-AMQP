# MCP Open Discovery Test Suite

This directory contains the test suite for validating the MCP Open Discovery server functionality, including Proxmox API integration and MCP protocol compliance.

**Proxmox Test Coverage:**

- `test_credentials.js`: Proxmox credential management test (add, list, remove credentials)
- `test_proxmox_formatting.js`: Proxmox API output formatting test (nodes, VMs, containers, storage, networks)
- `test_proxmox.js`: Standalone Proxmox API integration test (direct API calls, encryption/decryption)

All other legacy test scripts (including `test_mcp_client.js`, `create_test_tools.js`, `direct_test_tools.js`, `vscode_mcp_test.js`, `vscode_mcp_test_results.txt`) have been archived to the `archive/` directory and are no longer maintained in the main project. See `archive/test_tools_cleanup_2025-06-05.txt` for details.

## Running Tests

Active scripts can be run directly with Node.js. Archived scripts are for reference only and should not be used for new development.

## CMDB and Memory Model

The current test focus is on the in-memory CMDB structure, Proxmox resource discovery, and MCP tool compliance. See `mcp_server.js` and `MCP_COMPLIANCE.md` for details.

## Troubleshooting

If you have questions about legacy tests or need to restore any archived scripts, refer to the `archive/` directory or contact the project maintainers.
