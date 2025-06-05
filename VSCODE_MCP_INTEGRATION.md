# VS Code MCP Integration

This document provides a brief overview of integrating the MCP Open Discovery server with VS Code. For complete setup, usage, and troubleshooting, please refer to the main [README.md](../README.md) and the [TEST_README.md](./TEST_README.md) for testing procedures.

## Testing the Connection in VS Code

1.  Ensure the MCP server (Docker container) is running.
2.  Verify server accessibility (e.g., via `curl http://localhost:3000/health`).
3.  In VS Code:
    - Use "MCP: List Servers" to find and connect to "mcp-open-discovery-test".
    - Use "MCP: Execute Tool" to test tools like `ping` or Nmap scans.

For detailed steps and debugging, see the [VS Code Integration section in the main README.md](../README.md).
