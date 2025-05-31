# Busybox & Nmap Network MCP Server

A minimalized container that exposes Busybox and Nmap networking tools through the Model Context Protocol (MCP) for use with AI assistants and automation systems.

## Features

- **Network-focused**: Includes essential networking tools from Busybox and powerful scanning capabilities from Nmap.
- **MCP Compliant**: Follows the Model Context Protocol for seamless integration.
- **Dockerized**: Easy to deploy and run as a container.
- **Security Aware**: Runs as a non-root user with minimal privileges.
- **Health Monitoring**: Built-in health checks.

## Available Tools

### BusyBox Tools

- **`ping`**: Send ICMP echo requests to network hosts.
  - Parameters: `host` (required), `count`, `timeout`, `size`.
- **`wget`**: Download files from web servers.
  - Parameters: `url` (required), `timeout`, `tries`, `headers_only`.
- **`nslookup`**: Query DNS servers for domain name resolution.
  - Parameters: `domain` (required), `server`, `type`.
- **`netstat`**: Display network connections and routing tables.
  - Parameters: `listening`, `numeric`, `tcp`, `udp`, `all`.
- **`telnet`**: Test TCP connectivity to specific ports. (Note: `telnet` client must be available in the container's execution environment).
  - Parameters: `host` (required), `port` (required).
- **`route`**: Display or manipulate IP routing table.
  - Parameters: `numeric`.
- **`ifconfig`**: Display network interface configuration.
  - Parameters: `interface`.
- **`arp`**: Display or manipulate ARP cache.
  - Parameters: `numeric`.

### Nmap Tools

- **`nmap_ping_scan`**: Discovers online hosts without port scanning (`-sn`).
  - Parameters: `target` (required).
- **`nmap_tcp_syn_scan`**: Stealthy scan for open TCP ports (`-sS`). Requires root/administrator privileges if not run in the provided Docker container.
  - Parameters: `target` (required), `ports`, `fast_scan`, `timing_template`, `reason`, `open_only`.
- **`nmap_tcp_connect_scan`**: Scans for open TCP ports using the `connect()` system call (`-sT`). Does not require special privileges.
  - Parameters: `target` (required), `ports`, `timing_template`, `reason`, `open_only`.
- **`nmap_udp_scan`**: Scans for open UDP ports (`-sU`). Can be slow.
  - Parameters: `target` (required), `ports`, `top_ports`, `timing_template`, `reason`, `open_only`.
- **`nmap_version_scan`**: Probes open ports to determine service/version info (`-sV`). Can also provide OS detection information.
  - Parameters: `target` (required), `ports`, `intensity`, `light_mode`, `all_ports`, `timing_template`, `reason`, `open_only`.

## Quick Start

### Using Docker Compose (Recommended)

1.  **Build and start the container:**

    ```bash
    docker-compose up -d --build
    ```

2.  **Check health:**

    ```bash
    curl http://localhost:3000/health
    ```

    Expected output: `{"status":"healthy","tools":13}` (tool count may vary)

3.  **List available tools (MCP Request):**
    ```bash
    curl -X POST http://localhost:3000 -H "Content-Type: application/json" -d \'\'\'{"jsonrpc":"2.0","method":"tools/list","id":1}\'\'\'
    ```

### Using Docker Directly

1.  **Build the container:**

    ```bash
    docker build -t network-mcp-server .
    ```

2.  **Run the container:**
    ```bash
    docker run -d \\
      --name network-mcp-server \\
      --read-only \\
      --tmpfs /tmp:noexec,nosuid,size=100m \\
      --cap-drop=ALL \\
      --cap-add=NET_RAW \\
      --cap-add=NET_ADMIN \\
      --security-opt=no-new-privileges:true \\
      --memory=512m \\
      --cpus=1 \\
      -p 3000:3000 \\
      network-mcp-server
    ```
    _Note: Increased memory to 512MB and CPUs to 1 to better accommodate Nmap._

## API Usage Examples (MCP JSON-RPC)

All requests are `POST` requests to `http://localhost:3000` with `Content-Type: application/json`.

### Example: Ping a Host

```json
{
  "jsonrpc": "2.0",
  "method": "tools/call",
  "params": {
    "name": "ping",
    "arguments": {
      "host": "google.com",
      "count": 3
    }
  },
  "id": "ping-test-1"
}
```

### Example: Nmap TCP SYN Scan

```json
{
  "jsonrpc": "2.0",
  "method": "tools/call",
  "params": {
    "name": "nmap_tcp_syn_scan",
    "arguments": {
      "target": "scanme.nmap.org",
      "ports": "80,443",
      "reason": true
    }
  },
  "id": "nmap-syn-test-1"
}
```

### Example: Nmap Version Detection

```json
{
  "jsonrpc": "2.0",
  "method": "tools/call",
  "params": {
    "name": "nmap_version_scan",
    "arguments": {
      "target": "scanme.nmap.org",
      "ports": "22,80,443",
      "intensity": 5,
      "open_only": true
    }
  },
  "id": "nmap-version-test-1"
}
```

_(See `mcp_server.js` for the full schema of each tool.)_

## Local Development

### Prerequisites

- Node.js (version specified in `.nvmrc` or latest LTS)
- Docker (for building/running the containerized version)
- Nmap (if running the server locally outside Docker and want to test Nmap tools)
- BusyBox (if running the server locally outside Docker and want to test BusyBox tools)

### Setup & Running Locally

```bash
# Install dependencies
npm install

# Start the server
# The server will attempt to use system 'nmap' and 'busybox' if available.
# For full functionality, running in Docker is recommended.
npm start
```

## Testing

The project includes a test client that validates MCP protocol compliance and basic tool functionality.

```bash
# Ensure the server is running (either locally or in Docker)
npm test
```

For more detailed test information, see [TEST_README.md](TEST_README.md).

## MCP Protocol Compliance

This server implements the Model Context Protocol (MCP). For more details on the specific MCP features and compliance, see [MCP_COMPLIANCE.md](MCP_COMPLIANCE.md).

## VS Code Integration

For instructions on how to connect this MCP server to VS Code, refer to [VSCODE_MCP_INTEGRATION.md](VSCODE_MCP_INTEGRATION.md).

## Security Considerations

- The Docker container is configured to run with minimal privileges.
- Nmap scans, especially `-sS` (SYN scan), might require root privileges or `CAP_NET_RAW` capability, which is provided in the Docker setup. Running `mcp_server.js` directly without Docker might limit Nmap's capabilities if not run as root.
- Input sanitization is performed for tool arguments, but always be cautious with network tools.
- The `telnet` tool will only function if the `telnet` client is available in the execution environment (it is not installed by default in the Docker image to keep it minimal).

## License

MIT License
