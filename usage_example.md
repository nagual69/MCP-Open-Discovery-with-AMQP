# Usage Examples

This document provides example usage for the MCP Open Discovery server. For detailed API specifications, tool descriptions, and setup instructions, please refer to the main [README.md](../README.md).

## API Usage Examples

All examples assume the server is running on `http://localhost:3000`.

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

### Test Port Connectivity (Telnet)

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

### Nmap Ping Scan

```bash
curl -X POST http://localhost:3000 \\
  -H "Content-Type: application/json" \\
  -d '{
    "method": "tools/call",
    "params": {
      "name": "nmap_ping_scan",
      "arguments": {
        "target": "scanme.nmap.org"
      }
    }
  }'
```

### Nmap TCP SYN Scan

```bash
curl -X POST http://localhost:3000 \\
  -H "Content-Type: application/json" \\
  -d '{
    "method": "tools/call",
    "params": {
      "name": "nmap_tcp_syn_scan",
      "arguments": {
        "target": "scanme.nmap.org",
        "ports": "80,443"
      }
    }
  }'
```

### Nmap TCP Connect Scan

```bash
curl -X POST http://localhost:3000 \\
  -H "Content-Type: application/json" \\
  -d '{
    "method": "tools/call",
    "params": {
      "name": "nmap_tcp_connect_scan",
      "arguments": {
        "target": "scanme.nmap.org",
        "ports": "22,80"
      }
    }
  }'
```

### Nmap UDP Scan

```bash
curl -X POST http://localhost:3000 \\
  -H "Content-Type: application/json" \\
  -d '{
    "method": "tools/call",
    "params": {
      "name": "nmap_udp_scan",
      "arguments": {
        "target": "scanme.nmap.org",
        "ports": "53,161"
      }
    }
  }'
```

### Nmap Version Detection

```bash
curl -X POST http://localhost:3000 \\
  -H "Content-Type: application/json" \\
  -d '{
    "method": "tools/call",
    "params": {
      "name": "nmap_version_scan",
      "arguments": {
        "target": "scanme.nmap.org",
        "ports": "21,22,80"
      }
    }
  }'
```

## Further Information

For comprehensive details on installation, configuration, all available tools (including BusyBox and Nmap), security considerations, and troubleshooting, please consult the main [README.md](../README.md).
