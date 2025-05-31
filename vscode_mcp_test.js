#!/usr/bin/env node
/**
 * VS Code MCP Test Script
 * This script demonstrates how to use a tool from the MCP server
 * Run this script with VS Code's MCP client connected to your server
 */

// Import required modules
const fs = require('fs');
const path = require('path');

// Log information about the test
console.log('VS Code MCP Connection Test');
console.log('==========================');
console.log('This script tests the connection to the MCP server from VS Code.');
console.log('If VS Code is connected to the MCP server, you should see the results below.');
console.log('\nTesting connection to example.com with ping...\n');

// The main async function
async function main() {
  try {
    // Test if VS Code's MCP integration is working by writing test results to a file
    const resultsPath = path.join(__dirname, 'vscode_mcp_test_results.txt');
    const timestamp = new Date().toISOString();
    
    fs.writeFileSync(resultsPath, 
      `VS Code MCP Test Results\n` +
      `Test Time: ${timestamp}\n\n` +
      `If VS Code is properly connected to the MCP server, you should be able to use\n` +
      `the MCP network tools (ping, nslookup, etc.) from VS Code.\n\n` +
      `To test the connection, try using the ping tool by running:\n` +
      `1. Open VS Code Command Palette (Ctrl+Shift+P)\n` +
      `2. Type "MCP: Execute Tool"\n` +
      `3. Select "mcp-open-discovery-test" server\n` +
      `4. Select "ping" tool\n` +
      `5. Enter parameters: {"host": "example.com", "count": 3}\n\n` +
      `If successful, you should see ping results from example.com.\n` +
      `If you get a "Method not found" error, check VS Code's Developer Tools for details.\n`
    );
    
    console.log(`Test results file created at: ${resultsPath}`);
    console.log('Follow the instructions in the file to test the VS Code MCP connection.');
    
  } catch (error) {
    console.error('Error:', error.message);
  }
}

// Run the main function
main().catch(error => {
  console.error('Unhandled error:', error);
  process.exit(1);
});
