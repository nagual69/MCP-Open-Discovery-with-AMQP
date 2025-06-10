/**
 * Test script for the modular MCP Open Discovery Server
 * 
 * This script initializes the server and tests that tools are loaded correctly.
 */

const MCPOpenDiscoveryServer = require('./mcp_server_modular');

async function testModularServer() {
  console.log('[TEST] Initializing modular MCP server...');
  
  try {
    // Create and initialize the server
    const server = new MCPOpenDiscoveryServer();
    console.log('[TEST] Server instance created');
    
    await server.initialize();
    console.log('[TEST] Server initialized successfully');
    
    // Print out the number of loaded tools
    console.log(`[TEST] Loaded ${server.tools.size} tools`);
    
    // List all tool categories
    const categories = new Map();
    for (const [name, tool] of server.tools.entries()) {
      const prefix = name.split('_')[0];
      if (!categories.has(prefix)) {
        categories.set(prefix, []);
      }
      categories.get(prefix).push(name);
    }
    
    console.log('[TEST] Tool categories:');
    for (const [category, tools] of categories.entries()) {
      console.log(`  ${category}: ${tools.length} tools`);
      // Print the first 3 tools in each category
      console.log(`    Examples: ${tools.slice(0, 3).join(', ')}${tools.length > 3 ? '...' : ''}`);
    }
    
    console.log('[TEST] Test completed successfully!');
  } catch (error) {
    console.error(`[TEST] Error: ${error.message}`);
    console.error(error.stack);
  }
}

// Run the test
testModularServer().catch(error => {
  console.error('[TEST] Unhandled promise rejection:', error);
});
