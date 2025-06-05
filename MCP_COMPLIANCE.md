# MCP Open Discovery Protocol Compliance

This document outlines how the MCP Open Discovery server aligns with the Model Context Protocol (MCP) specification. For a general overview of the server, its tools, and how to use them, please refer to the main [README.md](../README.md).

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

## Testing Compliance

Compliance can be verified using the test client (`npm test`), as described in [TEST_README.md](./TEST_README.md).

## Further Information

For detailed information on the MCP specification itself, please visit [modelcontextprotocol.io](https://modelcontextprotocol.io). For information about this server's specific implementation, tools, and usage, see the main [README.md](../README.md).
