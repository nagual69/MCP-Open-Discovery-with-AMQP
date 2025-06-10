# MCP Open Discovery (Modular Version)

A modular, extensible container that exposes Busybox, Nmap, SNMP, and Proxmox API tools through the Model Context Protocol (MCP) for use with AI assistants, automation systems, and infrastructure discovery.

## New Modular Architecture

The MCP Open Discovery server has been refactored to use a modular approach, organizing tools into separate modules for improved:

- **Maintainability**: Each module focuses on a specific category of tools
- **Flexibility**: New tool categories can be added without modifying the core server
- **Performance**: Tools are loaded dynamically and only when needed
- **Organization**: Tool definitions are grouped logically by function

## Module Structure

Tools are organized into the following modules:

- **Network Tools**: Basic network tools like ping, wget, nslookup, etc.
- **Nmap Tools**: Nmap scanning tools like ping scan, TCP SYN scan, etc.
- **Memory Tools**: In-memory CMDB tools for storing and retrieving configuration items
- **Proxmox Tools**: Tools for interacting with Proxmox VE API
- **SNMP Tools**: Tools for SNMP discovery and monitoring

## Docker Deployment

The modular server can be deployed using Docker. Key improvements include:

- **Root Privilege Management**: Running as root for nmap SYN scans
- **Security Measures**: Least privilege, read-only filesystem, dropped capabilities
- **Resource Limits**: Memory and CPU limits are enforced
- **Networking**: Proper port exposure for MCP server and SNMP

## MCP Protocol Compliance

The modular server implementation is fully compliant with the MCP specification:

- Proper `initialize` response with server info and capabilities
- Correct `tools/list` response with tools array and inputSchema
- Appropriate `tools/call` response with content array

## Available Tools

### Network Tools

- **`ping`**: Send ICMP echo requests to network hosts
- **`wget`**: Download files from web servers
- **`nslookup`**: Query DNS servers for domain information
- **`dig`**: Advanced DNS lookup tool
- **`traceroute`**: Trace the route to a host
- **`ip_addr`**: Show network interface addresses
- **`ip_route`**: Show routing table
- **`ip_neigh`**: Show neighbor/ARP table
- **`ifconfig`**: Display and configure network interfaces
- **`netstat`**: Display network connections, routing tables, etc.

### Nmap Tools

- **`nmap_ping_scan`**: Nmap Ping Scan (-sn): Discovers online hosts without port scanning
- **`nmap_tcp_syn_scan`**: Nmap TCP SYN Scan (-sS): Stealthy scan for open TCP ports
- **`nmap_tcp_connect_scan`**: Nmap TCP Connect Scan (-sT): Scans for open TCP ports using the connect() system call
- **`nmap_udp_scan`**: Nmap UDP Scan (-sU): Scans for open UDP ports
- **`nmap_version_scan`**: Nmap Version Detection (-sV): Probes open ports to determine service/version info

### Memory Tools

- **`memory_get`**: Get a CI object from MCP memory by key
- **`memory_set`**: Set a CI object in MCP memory by key
- **`memory_merge`**: Merge new data into an existing CI in MCP memory
- **`memory_query`**: Query MCP memory for CIs matching a pattern or incomplete CIs

### Proxmox Tools

- **`proxmox_list_nodes`**: Returns all nodes in the Proxmox cluster
- **`proxmox_get_node_details`**: Returns details for a given Proxmox node
- **`proxmox_list_vms`**: Returns all VMs for a Proxmox node
- **`proxmox_get_vm_details`**: Returns config/details for a given VM
- **`proxmox_list_containers`**: Returns all LXC containers for a Proxmox node
- **`proxmox_get_container_details`**: Returns config/details for a given container
- **`proxmox_list_storage`**: Returns storage resources for a Proxmox node
- **`proxmox_list_networks`**: Returns network config for a Proxmox node
- **`proxmox_cluster_resources`**: Returns a summary of all cluster resources
- **`proxmox_get_metrics`**: Returns metrics for a node or VM
- **Credential Management:**
  - **`proxmox_creds_add`**: Add a new Proxmox credential
  - **`proxmox_creds_list`**: List all stored Proxmox credentials
  - **`proxmox_creds_remove`**: Remove a Proxmox credential by ID

### SNMP Tools

- **`snmp_get`**: Get a single SNMP value by OID
- **`snmp_walk`**: Walk an SNMP tree starting from a specific OID
- **`snmp_bulkget`**: Get multiple SNMP values at once
- **`snmp_bulkwalk`**: Walk multiple SNMP subtrees at once
- **`snmp_table`**: Get an SNMP table by OID
- **`snmp_discover_hosts`**: Discover hosts supporting SNMP on a subnet
- **`snmp_scan_interfaces`**: Scan interfaces on an SNMP-enabled device
- **`snmp_get_system_info`**: Get system information from an SNMP-enabled device
- **`snmp_scan_arp_cache`**: Scan the ARP cache of an SNMP-enabled device

## Documentation

- [Modular Architecture](./MODULAR_ARCHITECTURE.md): Details about the modular architecture
- [Docker Deployment](./DOCKER_DEPLOYMENT.md): Information about Docker deployment
- [MCP Compliance](./MCP_COMPLIANCE.md): Details about MCP protocol compliance

## Getting Started

### Running with Docker Compose

```bash
docker-compose up -d
```

### Building and Running Manually

```bash
# Build the Docker image
docker build -t mcp-open-discovery:modular -f Dockerfile.modular .

# Run the container
docker run -d --name mcp-open-discovery -p 3000:3000 mcp-open-discovery:modular
```

### Using the PowerShell Script

```powershell
.\rebuild_deploy.ps1
```

## Testing

### Basic Testing

Run the simple test script to verify basic connectivity and functionality:

```bash
node simple_test.js
```

### Comprehensive Testing

Run the comprehensive test script to verify that all modules are working:

```bash
node test_comprehensive.js
```

### Selective Testing

Test specific tool groups:

```bash
# Test only network tools
node test_comprehensive.js network

# Test memory and nmap tools
node test_comprehensive.js memory nmap
```

### Advanced Testing Options

```bash
# Continue testing even if some tests fail
node test_comprehensive.js --skip-errors

# Exclude specific problematic tools
node test_comprehensive.js --exclude=telnet,snmp_get

# Include only specific tools
node test_comprehensive.js --include=ping,nmap_ping_scan

# Show detailed debug information
node test_comprehensive.js --debug
```

For more detailed information about testing, see [Testing Documentation](./TESTING.md).
