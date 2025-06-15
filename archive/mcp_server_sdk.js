#!/usr/bin/env node

/**
 * MCP Open Discovery Server - SDK Implementation
 * 
 * This server uses the official Model Context Protocol TypeScript SDK
 * for full protocol compliance and type safety.
 */

const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { registerAllTools } = require('./tools/sdk_tool_registry');

/**
 * Create and configure the MCP server
 */
async function createServer() {
  // Create the MCP server instance
  const server = new McpServer({
    name: "MCP Open Discovery Server (SDK)",
    version: "2.0.0"
  }, {
    capabilities: {
      tools: {
        listChanged: true
      },
      logging: {}
    }
  });

  // Initialize CI memory store
  const ciMemory = {};

  // Register all tools with CI memory support
  await registerAllTools(server, { ciMemory });

  // Store reference for potential future use
  server._ciMemory = ciMemory;

  return server;
}

/**
 * Main execution function
 */
async function main() {
  try {
    console.error('[MCP SDK] Starting MCP Open Discovery Server...');
    
    // Create the server
    const server = await createServer();
    
    // Create transport (stdio for command-line usage)
    const transport = new StdioServerTransport();
    
    // Connect the server to the transport
    await server.connect(transport);
    
    console.error('[MCP SDK] Server connected and ready');
    
    // Handle graceful shutdown
    process.on('SIGINT', async () => {
      console.error('[MCP SDK] Shutting down...');
      await server.close();
      process.exit(0);
    });
    
    process.on('SIGTERM', async () => {
      console.error('[MCP SDK] Shutting down...');
      await server.close();
      process.exit(0);
    });
    
  } catch (error) {
    console.error(`[MCP SDK] Server startup failed: ${error.message}`);
    console.error(error.stack);
    process.exit(1);
  }
}

// Start the server if this is the main module
if (require.main === module) {
  main();
}

module.exports = { createServer, main };
