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

## API Usage Examples

### Ping a Host
```bash
curl -X POST http://localhost:3000 \
  -H "Content-Type: application/json" \
  -d '{
    "method": "tools/call",
    "params": {
      "name": "ping",
      "arguments": {
        "host": "google.com",
        "count": 3,
        "timeout": 5
      }
    }
  }'
```

### DNS Lookup
```bash
curl -X POST http://localhost:3000 \
  -H "Content-Type: application/json" \
  -d '{
    "method": "tools/call",
    "params": {
      "name": "nslookup",
      "arguments": {
        "domain": "example.com",
        "type": "MX"
      }
    }
  }'
```

### Download with wget
```bash
curl -X POST http://localhost:3000 \
  -H "Content-Type: application/json" \
  -d '{
    "method": "tools/call",
    "params": {
      "name": "wget",
      "arguments": {
        "url": "https://httpbin.org/json",
        "timeout": 10,
        "tries": 2
      }
    }
  }'
```

### Test Port Connectivity
```bash
curl -X POST http://localhost:3000 \
  -H "Content-Type: application/json" \
  -d '{
    "method": "tools/call",
    "params": {
      "name": "telnet",
      "arguments": {
        "host": "google.com",
        "port": 80
      }
    }
  }'
```

## Security Features

### Container Security
- **Read-only filesystem**: Prevents runtime modifications
- **No persistent storage**: All operations are ephemeral
- **Minimal privileges**: Drops all capabilities except networking
- **Resource limits**: CPU and memory constraints
- **Non-root execution**: Runs as unprivileged user

### Input Validation
- **Host sanitization**: Validates hostnames and IP addresses
- **URL filtering**: Only allows HTTP/HTTPS protocols
- **Parameter limits**: Enforces reasonable timeouts and retry counts
- **Output size limits**: Prevents memory exhaustion attacks

### Network Isolation
- **Custom bridge network**: Isolated from host networking
- **Controlled egress**: Only specified networking tools available
- **No shell access**: Direct tool execution only

## Integration Examples

### With MCP Client
```javascript
// Example MCP client integration
const mcpClient = new MCPClient('http://localhost:3000');

// Test network connectivity
const result = await mcpClient.callTool('ping', {
  host: 'example.com',
  count: 1
});

console.log(result.content[0].text);
```

### With AI Assistant
The container can be used as a tool provider for AI assistants that support MCP:

```json
{
  "mcpServers": {
    "network-tools": {
      "command": "node",
      "args": ["mcp-server.js"],
      "env": {
        "PORT": "3000"
      }
    }
  }
}
```

## Monitoring and Logging

### Health Checks
- **HTTP endpoint**: `GET /health`
- **Container health**: Built-in Docker health checks
- **Response format**: JSON with status and tool count

### Resource Monitoring
```bash
# Monitor container resources
docker stats busybox-network-mcp

# View logs
docker logs -f busybox-network-mcp

# Check health status
docker inspect busybox-network-mcp | grep Health -A 10
```

## Limitations and Considerations

### Tool Limitations
- **No file system access**: Tools cannot read/write files
- **Network-only operations**: Limited to networking functions
- **Timeout constraints**: All operations have enforced timeouts
- **Output size limits**: Large responses are truncated

### Security Considerations
- **Outbound network access**: Container can make external connections
- **DNS dependencies**: Requires functional DNS resolution
- **Resource consumption**: Network operations consume bandwidth

### Performance Notes
- **Cold start time**: ~2-3 seconds for container startup
- **Memory usage**: ~50-100MB typical, 256MB limit
- **Concurrent requests**: Single-threaded Node.js server

## Troubleshooting

### Common Issues

**Container won't start:**
```bash
# Check logs
docker logs busybox-network-mcp

# Verify port availability
netstat -ln | grep 3000
```

**Network tools fail:**
```bash
# Verify capabilities
docker inspect busybox-network-mcp | grep -i cap

# Test basic connectivity
docker exec busybox-network-mcp ping -c 1 8.8.8.8
```

**High resource usage:**
```bash
# Check current limits
docker inspect busybox-network-mcp | grep -i memory

# Monitor real-time usage
docker stats --no-stream busybox-network-mcp
```

### Debug Mode
```bash
# Run with debug output
docker run --rm -it \
  --cap-add=NET_RAW \
  --cap-add=NET_ADMIN \
  busybox-network-mcp \
  sh -c "node mcp-server.js"
```

## Development

### Building from Source
```bash
git clone <repository>
cd busybox-network-mcp
docker build -t busybox-network-mcp .
```

### Testing
```bash
# Run basic functionality tests
curl http://localhost:3000/health

# Test all tools
for tool in ping wget nslookup netstat telnet route ifconfig arp; do
  echo "Testing $tool..."
  # Add specific test calls here
done
```

## License

MIT License - See LICENSE file for details.