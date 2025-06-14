#!/usr/bin/env node

/**
 * MCP Inspector Launcher
 * 
 * Simple launcher script for MCP Inspector compatibility.
 * This ensures stdio transport mode and proper initialization.
 */

// Force stdio mode for MCP Inspector
process.env.TRANSPORT_MODE = 'stdio';
process.env.LOG_LEVEL = 'error'; // Reduce logging noise for Inspector

// Start the server
require('./mcp_server_multi_transport_sdk.js');
