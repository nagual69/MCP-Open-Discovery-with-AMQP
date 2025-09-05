#!/bin/sh
set -e

# Ensure data and logs exist and are owned by mcpuser
mkdir -p /home/mcpuser/app/data /home/mcpuser/app/logs
chown -R mcpuser:mcpuser /home/mcpuser/app/data /home/mcpuser/app/logs || true

# Drop privileges and exec the provided command
if command -v su-exec >/dev/null 2>&1; then
  exec su-exec mcpuser "$@"
else
  # Fallback: run as current user if su-exec not available
  exec "$@"
fi
