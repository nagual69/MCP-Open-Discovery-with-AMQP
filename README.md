# MCP Open Discovery

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

## Advanced Nmap Usage

With the full Nmap Scripting Engine (NSE) enabled, you can use advanced scans for service discovery, vulnerability checks, and more.

### Example: Nmap with Default Scripts

```json
{
  "jsonrpc": "2.0",
  "method": "tools/call",
  "params": {
    "name": "nmap_version_scan",
    "arguments": {
      "target": "scanme.nmap.org",
      "ports": "80,443",
      "reason": true
    }
  },
  "id": "nmap-default-scripts"
}
```

_Note: For custom scripts or script arguments, see the Nmap documentation and consider extending the tool schema._

## Scan Timeouts

- The server allows up to 5 minutes for each scan by default, supporting heavy or comprehensive scans.
- If you encounter timeouts in your client (e.g., MCP Inspector), increase the client-side timeout to match your scan needs.

## Troubleshooting

- If you see errors like `could not locate nse_main.lua`, ensure the container is rebuilt with the full Nmap scripts as described in the Dockerfile.
- For long-running scans, check both server and client timeouts.

## Example: Using Nmap Output for CMDB Population

The output from `nmap_version_scan` includes service banners and device info, which can be parsed and ingested into a CMDB. Example output:

```
PORT    STATE SERVICE  VERSION
53/tcp  open  domain   TP-LINK router dnsd
80/tcp  open  http     OpenWrt uHTTPd (TP-LINK router http config)
443/tcp open  ssl/http OpenWrt uHTTPd (TP-LINK router http config)
Service Info: OS: Linux; Device: broadband router; CPE: cpe:/o:linux:linux_kernel
```

You can automate extraction of:

- Open ports and services
- Detected software versions
- Device type and OS
- CPE identifiers

## Advanced: Incremental CI Discovery and MCP Memory Integration

To build a robust, intelligent, and automated CMDB population process, you can leverage the MCP memory/context service as a staging and enrichment area for Configuration Items (CIs):

- **Incremental Discovery:** As each tool (Nmap, BusyBox, etc.) discovers new facts about a CI (e.g., IP, hostname, OS, services), store or update a partial CI record in the MCP memory service, keyed by a unique identifier (IP, MAC, hostname, etc.).
- **Collation & Enrichment:** As more data is gathered, merge new facts into existing CI stubs. Enrichment agents can trigger additional scans or lookups to fill missing fields.
- **Type Inference & Hierarchy:** Use accumulated facts to infer CI type (e.g., server, router, printer) and build relationships (e.g., parent/child, network topology) in memory before committing to the CMDB.
- **Validation & Commit:** When a CI is "complete enough" (meets a profile or confidence threshold), commit it to the persistent CMDB (e.g., Neo4j). Use memory to deduplicate and validate before writing.

**Example Workflow:**

1. `ping` discovers IP → memory: `{ip: "192.168.1.10"}`
2. `nmap_version_scan` adds OS/services → memory: `{ip: "192.168.1.10", os: "Linux", services: [...]}`
3. `nslookup` adds hostname → memory: `{ip: "192.168.1.10", hostname: "server1.local", ...}`
4. Enrichment agent triggers more scans if needed.
5. When enough data is present, CI is written to the CMDB and cleared from memory.

**Benefits:**

- Resilient to partial/incomplete data
- Supports asynchronous, multi-tool, multi-pass discovery
- Reduces duplication and errors in the CMDB
- Enables advanced logic (confidence scoring, enrichment, deduplication) before commit

This approach is modular, extensible, and aligns with modern discovery and asset management best practices. See the project plan below for implementation steps.

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

## Project Structure

- `mcp_server.js`: Main MCP Open Discovery server implementation
- `mcp_proxy.js`: Proxy/utility for MCP server
- `ci_builder_nodered.json`: Node-RED flow for CI building
- `busybox_container.txt`: BusyBox container notes
- `Dockerfile`, `docker-compose.yml`: Docker configuration
- `architecture.drawio`: System architecture diagram
- `archive/`: Archived scripts and files, including legacy test tools
- `reference/`: Reference materials and documentation

## Archived Test Scripts

As of June 5, 2025, legacy test scripts and test result files have been moved to the `archive/` directory. See `archive/test_tools_cleanup_2025-06-05.txt` for details. These scripts are no longer maintained in the main project.
