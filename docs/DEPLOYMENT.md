# MCP Open Discovery - Deployment Guide

## 🏢 Enterprise Container Deployment (Recommended)

### Quick Start

```bash
# Clone the repository
git clone <repository-url>
cd mcp-open-discovery

# Build and deploy with Docker Compose
docker-compose up -d --build

# Verify deployment
curl http://localhost:3000/health
curl http://localhost:3000/mcp
```

### Prerequisites

- Docker and Docker Compose
- Network access for discovery operations
- Ports 3000 (HTTP), and optionally 1161-3161 (SNMP test servers)

## 🐳 Docker Deployment Options

### Option 1: Docker Compose (Recommended)

```bash
# Start all services including SNMP test servers
docker-compose up -d --build

# View logs
docker-compose logs -f

# Stop services
docker-compose down
```

### Option 2: Individual Container

```bash
# Build the image
docker build -t mcp-open-discovery .

# Run the container
docker run -d \
  --name mcp-discovery \
  -p 3000:3000 \
  -e TRANSPORT_MODE=http \
  mcp-open-discovery

# View logs
docker logs -f mcp-discovery
```

### Option 3: Kubernetes Deployment

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: mcp-open-discovery
spec:
  replicas: 1
  selector:
    matchLabels:
      app: mcp-open-discovery
  template:
    metadata:
      labels:
        app: mcp-open-discovery
    spec:
      containers:
      - name: mcp-open-discovery
        image: mcp-open-discovery:latest
        ports:
        - containerPort: 3000
        env:
        - name: TRANSPORT_MODE
          value: "http"
        livenessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 30
          periodSeconds: 10
---
apiVersion: v1
kind: Service
metadata:
  name: mcp-open-discovery-service
spec:
  selector:
    app: mcp-open-discovery
  ports:
    - protocol: TCP
      port: 80
      targetPort: 3000
  type: LoadBalancer
```

## ⚙️ Configuration Options

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `TRANSPORT_MODE` | `http` | Transport mode: `http`, `stdio`, or `both` |
| `PORT` | `3000` | HTTP server port |
| `LOG_LEVEL` | `info` | Logging level: `debug`, `info`, `warn`, `error` |

### Docker Compose Configuration

```yaml
version: '3.8'
services:
  mcp-server:
    build: .
    ports:
      - "3000:3000"
    environment:
      - TRANSPORT_MODE=http
      - LOG_LEVEL=info
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
      interval: 30s
      timeout: 10s
      retries: 3
```

## 🔍 Verification and Testing

### Health Check

```bash
# Check service health
curl http://localhost:3000/health

# Expected response:
{
  "status": "healthy",
  "timestamp": "2025-06-15T10:00:00.000Z",
  "version": "2.0.0",
  "transport": "http"
}
```

### MCP Endpoint Test

```bash
# Test MCP protocol endpoint
curl http://localhost:3000/mcp

# Should return MCP protocol information
```

### Tool Inventory

```bash
# Use MCP Inspector to verify all tools are loaded
npx @modelcontextprotocol/inspector http://localhost:3000/mcp

# Should show 42 available tools across categories:
# - Network Tools (8)
# - Memory Tools (4) 
# - NMAP Tools (5)
# - Proxmox Tools (13)
# - SNMP Tools (12)
```

## 🛡️ Security Considerations

### Network Security

- Deploy behind enterprise firewall
- Use reverse proxy for SSL termination
- Implement network segmentation for discovery operations
- Monitor outbound connections for security compliance

### Container Security

```dockerfile
# Security best practices included in Dockerfile:
USER node                    # Non-root user
WORKDIR /app                # Dedicated working directory
COPY --chown=node:node      # Proper file ownership
HEALTHCHECK                 # Container health monitoring
```

### Access Control

- Use authentication proxy for enterprise deployments
- Implement API rate limiting
- Monitor access logs for security events
- Use container orchestration RBAC

## 📊 Monitoring and Maintenance

### Health Monitoring

```bash
# Container health status
docker-compose ps

# Application logs
docker-compose logs -f mcp-server

# Resource usage
docker stats mcp-open-discovery
```

### Log Management

```bash
# View recent logs
docker-compose logs --tail=100 mcp-server

# Follow logs in real-time
docker-compose logs -f mcp-server

# Export logs for analysis
docker-compose logs mcp-server > discovery-logs.txt
```

### Updates and Maintenance

```bash
# Update to latest version
git pull
docker-compose down
docker-compose up -d --build

# Backup configuration
docker-compose config > backup-config.yml

# Clean up old containers and images
docker system prune -a
```

## 🚨 Troubleshooting

### Common Issues

**Container won't start:**
```bash
# Check port conflicts
netstat -tlnp | grep 3000

# Check Docker logs
docker-compose logs mcp-server
```

**Health check failing:**
```bash
# Check container status
docker-compose ps

# Test health endpoint manually
curl -v http://localhost:3000/health
```

**Tools not loading:**
```bash
# Check for missing dependencies
docker-compose exec mcp-server npm list

# Verify tool registration
curl http://localhost:3000/mcp | jq '.tools | length'
```

### Support

For additional support:
1. Check container logs first
2. Verify network connectivity
3. Review environment variables
4. Test with MCP Inspector
5. Check documentation in `/docs` directory

## 📚 Related Documentation

- [README.md](../README.md) - Project overview and quick start
- [TESTING.md](TESTING.md) - Testing procedures and validation
- [VSCODE_MCP_INTEGRATION.md](VSCODE_MCP_INTEGRATION.md) - VS Code integration guide
- [MCP_COMPLIANCE.md](MCP_COMPLIANCE.md) - MCP protocol compliance details
