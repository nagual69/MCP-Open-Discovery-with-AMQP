# MCP Open Discovery - Quick Reference Guide

## Essential Commands

### Deployment Commands

```powershell
# Deploy main MCP stack (creates shared network)
docker-compose up -d

# Deploy Zabbix testing environment
docker-compose -f .\testing\docker-compose-zabbix-testing.yml up -d

# Check all running containers
docker ps

# View logs for specific service
docker logs <container_name> -f
```

### Network Verification

```powershell
# List Docker networks
docker network ls | findstr mcp-open-discovery

# Inspect shared network details
docker network inspect mcp-open-discovery_mcp-network

# Check container network assignments
docker inspect <container_name> | findstr NetworkMode
```

### Service Health Checks

```powershell
# Test Zabbix web interface
curl http://localhost:8080

# Test NGINX test server
curl http://localhost:8888

# Check PostgreSQL connectivity
docker exec postgres-zabbix pg_isready -U zabbix -d zabbix

# Test Zabbix server agent ping
docker exec zabbix-server zabbix_get -s 127.0.0.1 -k agent.ping
```

## Current Infrastructure

### Tool Count: 52 Total

- **Memory Tools**: 8 tools
- **Network Tools**: 8 tools
- **SNMP Tools**: 8 tools
- **NMAP Tools**: 4 tools
- **Proxmox Tools**: 10 tools
- **Credential Tools**: 6 tools
- **Filesystem Tools**: 4 tools
- **Zabbix Tools**: 4 tools (NEW)

### Network Architecture

- **Shared Network**: `mcp-open-discovery_mcp-network`
- **Subnet**: `172.20.0.0/16`
- **Type**: External Docker bridge network

### Key IP Addresses

- **Zabbix Web**: 172.20.0.22 → http://localhost:8080
- **Zabbix Server**: 172.20.0.21
- **PostgreSQL**: 172.20.0.20
- **Test Agents**: 172.20.0.23, 172.20.0.24
- **NGINX Test**: 172.20.0.25 → http://localhost:8888

## Zabbix Tool Quick Reference

### 1. zabbix_host_discover

**Purpose**: List all monitored hosts

```json
{
  "baseUrl": "http://localhost:8080",
  "username": "Admin",
  "password": "zabbix"
}
```

### 2. zabbix_get_metrics

**Purpose**: Get host performance metrics

```json
{
  "baseUrl": "http://localhost:8080",
  "username": "Admin",
  "password": "zabbix",
  "hostId": "10084",
  "metrics": ["system.cpu.load", "vm.memory.utilization"]
}
```

### 3. zabbix_get_alerts

**Purpose**: Retrieve active alerts

```json
{
  "baseUrl": "http://localhost:8080",
  "username": "Admin",
  "password": "zabbix",
  "minSeverity": 2
}
```

### 4. zabbix_get_inventory

**Purpose**: Get detailed host inventory

```json
{
  "baseUrl": "http://localhost:8080",
  "username": "Admin",
  "password": "zabbix",
  "hostId": "10084"
}
```

## Default Credentials

### Zabbix Web Interface

- **URL**: http://localhost:8080
- **Username**: Admin
- **Password**: zabbix

### PostgreSQL Database

- **Host**: postgres-zabbix
- **Database**: zabbix
- **Username**: zabbix
- **Password**: zabbix_password

## File Locations

### Core Implementation

- **Zabbix Tools**: `tools/zabbix_tools_sdk.js`
- **Tool Registry**: `tools/sdk_tool_registry.js`
- **Docker Compose**: `testing/docker-compose-zabbix-testing.yml`

### Documentation

- **Phase 1 Guide**: `docs/PHASE_1_IMPLEMENTATION.md`
- **Vision Document**: `docs/VISION_AND_ROADMAP.md`
- **Testing Guide**: `docs/TESTING.md`

## Troubleshooting Quick Fixes

### Container Won't Start

```powershell
# Check container logs
docker logs <container_name>

# Restart specific service
docker-compose -f .\testing\docker-compose-zabbix-testing.yml restart <service_name>

# Rebuild and restart
docker-compose -f .\testing\docker-compose-zabbix-testing.yml up -d --force-recreate
```

### Network Issues

```powershell
# Recreate shared network (if main stack is down)
docker network create --driver bridge --subnet=172.20.0.0/16 mcp-open-discovery_mcp-network

# Verify network connectivity between containers
docker exec <container1> ping <container2_ip>
```

### Web Interface Not Accessible

```powershell
# Check if port is bound
netstat -an | findstr 8080

# Check if container is running
docker ps | findstr zabbix-web

# Check container health
docker exec zabbix-web curl -f http://localhost:8080/ping
```

## Development Workflow

### Making Changes

1. **Edit Tools**: Modify files in `tools/` directory
2. **Update Registry**: Add new tools to `tools/sdk_tool_registry.js`
3. **Test Changes**: Restart MCP server and test tools
4. **Document Updates**: Update relevant documentation

### Testing New Tools

1. **Deploy Stack**: Ensure testing environment is running
2. **VS Code Testing**: Use MCP extension to test tools
3. **Automated Tests**: Run test scripts in `testing/` directory
4. **Validate Results**: Verify tool outputs and error handling

---

**Quick Reference Version**: 1.0  
**Last Updated**: July 13, 2025  
**Current Status**: Phase 1 Complete (52 tools deployed)
