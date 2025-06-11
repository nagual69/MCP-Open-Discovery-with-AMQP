# SNMP Testing Guide for MCP Open Discovery

## Overview

This guide shows how to test the SNMP tools in your MCP Open Discovery server using Docker containers that simulate SNMP-enabled devices.

## Setup SNMP Test Environment

### 1. Start SNMP Test Containers

```bash
# Start the SNMP testing environment
docker-compose -f docker-compose-snmp-testing.yml up -d

# Check that all containers are running
docker ps
```

### 2. Available SNMP Test Targets

| Container      | IP Address  | Port     | Community | Description                     |
| -------------- | ----------- | -------- | --------- | ------------------------------- |
| snmp-simulator | 172.20.0.10 | 1161/udp | public    | Basic SNMP simulator            |
| net-snmp-agent | 172.20.0.11 | 2161/udp | public    | Full-featured SNMP agent        |
| snmp-lab       | 172.20.0.12 | 3161/udp | public    | SNMP simulator with custom MIBs |
| fake-router    | 172.20.0.13 | 4161/udp | public    | Network equipment simulator     |

## Testing Your SNMP Tools

### 1. Basic Connectivity Test

Test if your MCP server can reach the SNMP simulators:

```bash
# From your host machine, test SNMP connectivity
snmpwalk -v2c -c public 172.20.0.10:1161 1.3.6.1.2.1.1
```

### 2. Test SNMP Tools via MCP Server

Use the existing test script:

```bash
# Run the SNMP tools test
node test_snmp_tools.js
```

### 3. Manual Testing via curl

Test individual SNMP tools:

```bash
# Test SNMP discovery
curl -X POST http://localhost:3000 \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/call",
    "params": {
      "name": "snmp_discover",
      "arguments": {
        "targetRange": "172.20.0.0/24",
        "community": "public",
        "timeout": 5000
      }
    },
    "id": "test1"
  }'

# Test SNMP session creation
curl -X POST http://localhost:3000 \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/call",
    "params": {
      "name": "snmp_create_session",
      "arguments": {
        "host": "172.20.0.10",
        "community": "public",
        "port": 1161
      }
    },
    "id": "test2"
  }'

# Test device inventory
curl -X POST http://localhost:3000 \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/call",
    "params": {
      "name": "snmp_device_inventory",
      "arguments": {
        "host": "172.20.0.10",
        "community": "public"
      }
    },
    "id": "test3"
  }'
```

## Test Scenarios

### Scenario 1: Network Discovery

```bash
# Discover all SNMP devices in the test network
curl -X POST http://localhost:3000 \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/call",
    "params": {
      "name": "snmp_discover",
      "arguments": {
        "targetRange": "172.20.0.0/24",
        "community": "public"
      }
    },
    "id": "discovery"
  }'
```

### Scenario 2: System Health Check

```bash
# Check system health on a specific device
curl -X POST http://localhost:3000 \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/call",
    "params": {
      "name": "snmp_system_health",
      "arguments": {
        "host": "172.20.0.11",
        "community": "public"
      }
    },
    "id": "health"
  }'
```

### Scenario 3: Interface Discovery

```bash
# Discover network interfaces
curl -X POST http://localhost:3000 \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/call",
    "params": {
      "name": "snmp_interface_discovery",
      "arguments": {
        "host": "172.20.0.12",
        "community": "public"
      }
    },
    "id": "interfaces"
  }'
```

## Alternative Testing Methods

### 1. Use Public SNMP Test Servers

Some publicly available SNMP test servers:

- `demo.snmplabs.com` (port 161, community: public)
- `snmp.example.com` (if available)

### 2. Localhost Testing (if SNMP is installed)

If you have SNMP running on your Windows machine:

```bash
# Install SNMP on Windows (if not already installed)
# Go to "Turn Windows features on or off" > SNMP Service

# Test localhost
curl -X POST http://localhost:3000 \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/call",
    "params": {
      "name": "snmp_device_inventory",
      "arguments": {
        "host": "localhost",
        "community": "public"
      }
    },
    "id": "localhost-test"
  }'
```

### 3. Router/Switch Testing

If you have real network equipment:

```bash
# Test with real router/switch (replace IP and community)
curl -X POST http://localhost:3000 \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/call",
    "params": {
      "name": "snmp_network_topology",
      "arguments": {
        "networkRange": "192.168.1.0/24",
        "community": "public"
      }
    },
    "id": "topology"
  }'
```

## Expected Results

### Successful SNMP Discovery Response:

```json
{
  "jsonrpc": "2.0",
  "result": [
    {
      "ip": "172.20.0.10",
      "systemName": "snmp-simulator",
      "systemDescription": "SNMP Simulator...",
      "responseTime": 145
    }
  ],
  "id": "discovery"
}
```

### Device Inventory Response:

```json
{
  "jsonrpc": "2.0",
  "result": {
    "ip": "172.20.0.10",
    "system": {
      "description": "Linux snmp-simulator...",
      "name": "snmp-simulator",
      "uptime": "123456",
      "contact": "admin@example.com",
      "location": "Test Lab"
    },
    "interfaces": {...},
    "storage": {...}
  },
  "id": "inventory"
}
```

## Troubleshooting

### Common Issues:

1. **Timeout Errors**: Increase timeout values in your SNMP calls
2. **Community String**: Ensure 'public' is the correct community
3. **Port Issues**: Check that SNMP ports aren't blocked
4. **Network Connectivity**: Verify containers can communicate

### Debug Commands:

```bash
# Check container logs
docker logs snmp-simulator

# Test SNMP directly from MCP container
docker exec -it busybox-network-mcp snmpwalk -v2c -c public 172.20.0.10 1.3.6.1.2.1.1

# Check network connectivity
docker exec -it busybox-network-mcp ping 172.20.0.10
```

## Cleanup

```bash
# Stop and remove test containers
docker-compose -f docker-compose-snmp-testing.yml down -v

# Remove test network
docker network prune
```
