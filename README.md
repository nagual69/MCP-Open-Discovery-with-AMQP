# Busybox Network MCP Server

A minimalized container that exposes Busybox networking tools through the Model Context Protocol (MCP) for use with AI assistants and automation systems.

## Features

- **Network-focused**: Only includes networking tools from Busybox
- **No persistent storage**: Operates entirely in memory/tmpfs
- **Security hardened**: Runs as non-root user with minimal privileges
- **Resource limited**: 256MB RAM, 0.5 CPU cores
- **Health monitoring**: Built-in health checks and monitoring

## Available Tools

### Core Network Tools

- **ping**: ICMP echo requests with configurable count and timeout
- **wget**: HTTP/HTTPS downloads with safety limits
- **nslookup**: DNS queries for various record types
- **netstat**: Display network connections and routing
- **telnet**: TCP port connectivity testing
- **route**: IP routing table display
- **ifconfig**: Network interface configuration
- **arp**: ARP cache display

## Quick Start

### Using Docker Compose (Recommended)

```bash
# Build and start the container
docker-compose up -d

# Check health
curl http://localhost:3000/health

# List available tools
curl -X POST http://localhost:3000 \
  -H "Content-Type: application/json" \
  -d '{"method": "tools/list"}'
```

### Using Docker

```bash
# Build the container
docker build -t busybox-network-mcp .

# Run with security constraints
docker run -d \
  --name busybox-network-mcp \
  --read-only \
  --tmpfs /tmp:noexec,nosuid,size=100m \
  --cap-drop=ALL \
  --cap-add=NET_RAW \
  --cap-add=NET_ADMIN \
  --security-opt=no-new-privileges:true \
  --memory=256m \
  --cpus=0.5 \
  -p 3000:3000 \
  busybox-network-mcp
```

## Local Development

### Prerequisites

- Node.js 18 or later

### Setup

```bash
# Install dependencies
npm install

# Start the server
npm start

# Run tests
npm test
```

## Testing

The project includes a test client that validates MCP protocol compliance and tool functionality:

```bash
# Run the test suite
npm test
```

For detailed test information, see [TEST_README.md](TEST_README.md).

## MCP Protocol Compliance

This implementation follows the Model Context Protocol (MCP) specification as defined by the [modelcontextprotocol/typescript-sdk](https://github.com/modelcontextprotocol/typescript-sdk) reference implementation.

For details on protocol compliance, see [MCP_COMPLIANCE.md](MCP_COMPLIANCE.md).

## License

MIT License
