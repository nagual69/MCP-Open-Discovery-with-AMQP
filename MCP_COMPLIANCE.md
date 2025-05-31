# MCP Protocol Compliance Guide

This document outlines how our implementation aligns with the [Model Context Protocol (MCP)](https://modelcontextprotocol.io) specification, based on the official TypeScript SDK implementation.

## JSON-RPC Compliance

The MCP protocol is built on top of JSON-RPC 2.0. All MCP messages must:

1. Include the `jsonrpc` field with value `"2.0"`
2. Include a unique `id` for each request/response pair
3. Follow error handling conventions for JSON-RPC

## Request Format

A compliant MCP request follows this structure:

```json
{
  "jsonrpc": "2.0",
  "method": "tools/call",
  "params": {
    "name": "ping",
    "arguments": {
      "host": "example.com"
    }
  },
  "id": 1
}
```

## Response Format

A successful response includes:

```json
{
  "jsonrpc": "2.0",
  "content": [
    {
      "type": "text",
      "text": "Response content here"
    }
  ],
  "result": "success",
  "id": 1
}
```

## Error Handling

Error responses follow JSON-RPC error conventions:

```json
{
  "jsonrpc": "2.0",
  "error": {
    "code": -32601,
    "message": "Method not found",
    "data": {
      "method": "invalid/method"
    }
  },
  "id": 1
}
```

### Standard Error Codes

- `-32600`: Invalid Request - The JSON sent is not a valid Request object
- `-32601`: Method not found - The method does not exist / is not available
- `-32602`: Invalid params - Invalid method parameter(s)
- `-32603`: Internal error - Internal JSON-RPC error
- `-32700`: Parse error - Invalid JSON was received by the server

## Tools List Response

The `tools/list` method returns:

```json
{
  "jsonrpc": "2.0",
  "tools": [
    {
      "name": "tool-name",
      "description": "Tool description",
      "schema": {
        "type": "object",
        "properties": {
          "param1": {
            "type": "string"
          }
        }
      }
    }
  ],
  "id": 1
}
```

## Content Types

MCP supports multiple content types:

- `text`: Plain text content
- `image`: Base64-encoded image content
- `html`: HTML content (if supported)

Each content item must have a `type` field and the appropriate content field based on type.

## Testing Compliance

Use the included test client to validate compliance with the MCP specification:

```bash
npm test
```

## Future Improvements

Based on the full MCP specification, the following advanced features could be implemented in future versions:

### Resources

Resources are similar to GET endpoints in a REST API - they provide data but shouldn't perform significant computation or have side effects:

```json
{
  "jsonrpc": "2.0",
  "method": "resources/read",
  "params": {
    "uri": "data://example/resource"
  },
  "id": 1
}
```

### Prompts

Prompts provide reusable templates for LLM interactions:

```json
{
  "jsonrpc": "2.0",
  "method": "prompts/get",
  "params": {
    "name": "example-prompt",
    "arguments": {
      "param1": "value"
    }
  },
  "id": 1
}
```

### Session Management

Support for persistent sessions across multiple requests, allowing for stateful interactions:

```json
{
  "jsonrpc": "2.0",
  "method": "session/initialize",
  "params": {
    "client": {
      "name": "client-name",
      "version": "1.0.0"
    }
  },
  "id": 1
}
```

### Notifications and Events

Server-to-client communications for asynchronous events and updates:

```json
{
  "jsonrpc": "2.0",
  "method": "notify/event",
  "params": {
    "type": "event-type",
    "data": {
      "key": "value"
    }
  }
}
```
