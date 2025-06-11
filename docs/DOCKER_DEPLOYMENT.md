# MCP Open Discovery Server - Docker Deployment

This document describes how to deploy the modular MCP Open Discovery Server using Docker.

## Docker Configuration

The modular MCP Open Discovery Server can be deployed as a Docker container. The Docker configuration files are:

- `Dockerfile.modular`: The Docker build file for the modular server.
- `docker-compose.yml`: Docker Compose configuration for running the server.
- `docker-package.json`: Package.json for the Docker container.
- `rebuild_deploy.ps1`: PowerShell script to rebuild and redeploy the Docker container.

## Running the Docker Container

### Using Docker Compose

The easiest way to run the MCP Open Discovery Server is with Docker Compose:

```bash
docker-compose up -d
```

This will build the Docker image if needed and start the container in detached mode.

### Using the Rebuild and Deploy Script

You can also use the `rebuild_deploy.ps1` script to rebuild and redeploy the Docker container:

```powershell
.\rebuild_deploy.ps1
```

This script will:

1. Stop and remove the existing container if it exists.
2. Build a new Docker image using the Dockerfile.modular file.
3. Start a new container with the updated image.

## Root Privileges and Capabilities

Some Nmap tools (like SYN scans and UDP scans) require root privileges to run. For this reason, the Docker container runs as root and has the following capabilities:

- `NET_RAW`: Required for raw socket access (needed by ping and SYN scans).
- `NET_ADMIN`: Required for network administration (needed by many network tools).

## Security Considerations

Even though the container runs as root, several security measures are in place:

1. **Read-only filesystem**: The container's filesystem is mounted as read-only, preventing modifications to the container.
2. **Dropped capabilities**: All capabilities except the necessary ones are dropped.
3. **No new privileges**: The container cannot gain new privileges.
4. **Resource limits**: Memory and CPU limits are enforced.
5. **Temporary filesystem**: A small tmpfs mount is used for temporary files.

## Network Ports

The Docker container exposes the following ports:

- **3000/tcp**: The MCP server HTTP port.
- **161/udp**: The SNMP port for receiving SNMP traps (if needed).

## Environment Variables

You can customize the Docker container behavior using environment variables in the docker-compose.yml file.

## Troubleshooting

### Nmap SYN Scans Not Working

If Nmap SYN scans are not working, check that:

1. The container is running as root (the `USER` directive is commented out in the Dockerfile).
2. The container has the `NET_RAW` and `NET_ADMIN` capabilities.

### Memory Tools Issues

If memory tools are not working, ensure that the in-memory store is properly initialized. The memory tools module has been updated to work with a JavaScript object instead of a Map.

## Checking Server Status

You can check the server status using the health check endpoint:

```bash
curl http://localhost:3000/health
```

## MCP Protocol Compliance

The modular server implementation is fully compliant with the MCP specification. All responses follow the required format, including:

- Proper `initialize` response with server info and capabilities.
- Correct `tools/list` response with tools array and inputSchema.
- Appropriate `tools/call` response with content array.
