# VS Code MCP Integration Guide

## Enterprise Container Deployment Context

**Primary Use Case**: This MCP Open Discovery server is designed for enterprise network discovery running as a container. The **HTTP transport with Server-Sent Events (SSE)** is the most critical transport mode for enterprise deployments.

**Stdio Transport**: Used primarily for development and VS Code integration during testing phases.

## The Problem You Encountered

VS Code's MCP extension was trying to connect to `http://localhost:3000/` but our MCP server endpoint is at `http://localhost:3000/mcp`. Additionally, **VS Code's MCP extension typically expects stdio transport, not HTTP**.

## 🎯 Primary Solution: HTTP Transport (Enterprise Focus)

For enterprise container deployments, HTTP transport is the standard:

### Docker Container (Recommended for Enterprise)

```bash
# Start container with HTTP transport (default)
docker-compose up -d

# Verify HTTP endpoint
curl http://localhost:3000/health
curl http://localhost:3000/mcp
```

### Direct HTTP Testing

```bash
# Start in HTTP mode locally
TRANSPORT_MODE=http node mcp_server_multi_transport_sdk.js

# Test with MCP Inspector (enterprise testing tool)
npx @modelcontextprotocol/inspector http://localhost:3000/mcp
```

### Enterprise Integration Features

- **🌐 HTTP/SSE Transport**: Standard web protocols for enterprise networks
- **🔍 Health Endpoint**: `/health` for container orchestration and monitoring
- **🚀 MCP Endpoint**: `/mcp` for MCP protocol communication
- **🛡️ CORS Support**: For web-based management interfaces
- **📊 Session Management**: UUID-based sessions for concurrent users
- **⚡ Real-time Updates**: SSE streaming for live discovery results

## 🔧 Development Solution: Stdio Transport (VS Code Testing)

For development and VS Code integration during testing phases:

Configure VS Code to use stdio transport for development testing:

### Step 1: Add to VS Code Settings

Open VS Code settings (`Ctrl+,` or `Cmd+,`) and add this to your `settings.json`:

```json
{
  "mcp.servers": {
    "mcp-open-discovery-dev": {
      "command": "node",
      "args": [
        "c:\\Users\\nagua\\OneDrive\\Documents\\development\\mcp-open-discovery\\mcp_server_multi_transport_sdk.js"
      ],
      "env": {
        "TRANSPORT_MODE": "stdio"
      }
    }
  }
}
```

### Step 2: Restart VS Code

Restart VS Code for the MCP server configuration to take effect.

### Step 3: Verify Connection

- Open VS Code Command Palette (`Ctrl+Shift+P`)
- Look for MCP-related commands
- The server should now connect via stdio transport

## 🏢 Enterprise Deployment Modes

### Production Container (Default)

```bash
# HTTP transport for enterprise networks
docker run -p 3000:3000 mcp-open-discovery
```

### Multi-Transport Container

```bash
# Both HTTP and stdio (for mixed environments)
docker run -p 3000:3000 -e TRANSPORT_MODE=both mcp-open-discovery
```

## 🧪 Testing Transport Modes

### HTTP Transport (Primary - Enterprise)

```bash
# Start in HTTP mode
TRANSPORT_MODE=http node mcp_server_multi_transport_sdk.js

# Test with MCP Inspector
npx @modelcontextprotocol/inspector http://localhost:3000/mcp

# Test health endpoint
curl http://localhost:3000/health
```

### Stdio Transport (Development Only)

```bash
# Start in stdio mode (development/testing only)
TRANSPORT_MODE=stdio node mcp_server_multi_transport_sdk.js
```

### Both Transports (Mixed Environment)

```bash
# Start in both modes (development + enterprise)
TRANSPORT_MODE=both node mcp_server_multi_transport_sdk.js
```

## 📋 Configuration Files

### Enterprise Docker Deployment

- `docker-compose.yml` - Configured for HTTP transport by default
- Container defaults to `TRANSPORT_MODE=http`

### Development Testing

- `vscode-mcp-config.json` - Sample VS Code stdio configuration

## 🎯 Deployment Recommendations

### ✅ Production/Enterprise (Recommended)

- **Transport**: HTTP with SSE
- **Deployment**: Docker container
- **Use Cases**:
  - Enterprise network discovery
  - Web-based management interfaces
  - API integration with enterprise tools
  - Container orchestration environments

### 🔧 Development/Testing

- **Transport**: Stdio
- **Deployment**: Local Node.js process
- **Use Cases**:
  - VS Code development testing
  - CLI-based debugging
  - Local development workflows

## ✅ Expected Enterprise Integration

With HTTP transport in containers, you get:

1. **🌐 Web API Access**: RESTful endpoint at `/mcp`
2. **📊 Health Monitoring**: Status endpoint at `/health`
3. **⚡ Real-time Streaming**: SSE for live discovery results
4. **🔒 Session Management**: UUID-based concurrent sessions
5. **🛡️ CORS Support**: Cross-origin web interface support
6. **🐳 Container Ready**: Optimized for Docker/Kubernetes deployments

## 🏢 Enterprise Network Discovery Features

When deployed in enterprise containers:

- **Network Scanning**: NMAP tools for port and service discovery
- **SNMP Monitoring**: Comprehensive device inventory and health checks
- **Proxmox Integration**: Virtualization infrastructure management
- **Memory/CMDB**: In-memory CI storage for discovered assets
- **Multi-Protocol Support**: Ping, DNS, HTTP, SNMP, and more

The container deployment with HTTP transport enables integration with enterprise orchestration platforms, web dashboards, and automated discovery workflows.
