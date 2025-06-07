#!/usr/bin/env node
// MCP Direct Connection Helper
//
// This script provides instructions and utilities for testing direct connections to the MCP server
// (bypassing the proxy) and for configuring VS Code to connect directly to the MCP server on port 3000.
// See the console output for step-by-step instructions.
//
// For more details, see VSCODE_MCP_INTEGRATION.md.

/**
 * MCP Direct Connection Script
 * This script allows you to test the MCP server directly without using the proxy server
 */

// Clear VS Code settings to use port 3000 directly
console.log('VS Code MCP Direct Connection Test');
console.log('=================================');
console.log('This script will help you test direct connection to the MCP server.');
console.log('Follow these steps:');
console.log('1. Close VS Code');
console.log('2. Update your VS Code settings.json file to use port 3000 directly:');
console.log('   "mcp": {');
console.log('     "servers": {');
console.log('       "mcp-open-discovery-test": {');
console.log('         "url": "http://localhost:3000"');
console.log('       }');
console.log('     }');
console.log('   }');
console.log('3. Make sure the Docker container is running');
console.log('4. Restart VS Code and try connecting to the MCP server again');
console.log('\nYou can also add the initialize method to your MCP server by editing mcp_server.js:');
console.log('1. Find the switch statement in mcp_server.js');
console.log('2. Add support for the initialize method that VS Code uses:');
console.log('   case \'initialize\':');
console.log('     response.result = {');
console.log('       capabilities: {');
console.log('         supportsToolCalls: true,');
console.log('         supportsStreaming: false');
console.log('       },');
console.log('       serverInfo: {');
console.log('         name: "Busybox Network MCP Server",');
console.log('         version: "1.0.0"');
console.log('       }');
console.log('     };');
console.log('     break;');

// Display instructions for directly editing the server code
console.log('\nAfter making these changes, rebuild and restart the Docker container:');
console.log('1. cd "c:\\Users\\nagua\\OneDrive\\Documents\\development\\mcp-open-discovery"');
console.log('2. docker-compose build');
console.log('3. docker-compose down && docker-compose up -d');
