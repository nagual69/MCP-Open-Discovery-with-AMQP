@echo off
REM Running MCP Server Test Suite...
REM Only active scripts are run. Archived scripts are in the archive/ directory.
node test_credentials.js
node test_proxmox_formatting.js
node test_proxmox.js
pause
