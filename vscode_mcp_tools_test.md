# VS Code MCP Tools Test

This document is a reference for troubleshooting MCP tool discovery and execution within VS Code, specifically for the MCP Open Discovery server. For general testing procedures, refer to [TEST_README.md](./TEST_README.md). For comprehensive integration details, see the main [README.md](../README.md).

## Tool Discovery

If VS Code is not detecting tools:

1.  Verify the `tools/list` response from the server (e.g., using `curl` or PowerShell `Invoke-RestMethod`) matches the expected MCP format.
2.  Check VS Code Developer Tools for network errors.
3.  Ensure the server correctly announces capabilities in its `initialize` response.

## Tool Execution

To test a tool (e.g., `ping` or an Nmap scan):

1.  Use "MCP: Execute Tool" in the VS Code Command Palette.
2.  Select the "mcp-open-discovery-test" server.
3.  Choose the desired tool and provide valid parameters.

For more detailed troubleshooting, consult the [VS Code Integration section in the main README.md](../README.md).

## Note on Test Scripts

As of June 5, 2025, all legacy test scripts and test result files have been archived to the `archive/` directory. See `archive/test_tools_cleanup_2025-06-05.txt` for details. These are no longer maintained in the main project.
