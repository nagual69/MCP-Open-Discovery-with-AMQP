/**
 * SDK Tool Registry for MCP Open Discovery Server
 * 
 * Central registry for all MCP SDK-compatible tools.
 * This replaces the old module_loader.js with proper SDK integration.
 */

const { registerNetworkTools } = require('./network_tools_sdk');
const { registerMemoryTools, initialize: initializeMemoryTools } = require('./memory_tools_sdk');
const { registerNmapTools } = require('./nmap_tools_sdk');
const { registerProxmoxTools } = require('./proxmox_tools_sdk');
const { registerSnmpTools } = require('./snmp_tools_sdk');
const { registerZabbixTools } = require('./zabbix_tools_sdk');
const { getCredentialTools, getCredentialResources } = require('./credentials_tools_sdk');
const { registerAllResources } = require('./resource_registry');

/**
 * Register credential management tools with the server  
 * @param {McpServer} server - The MCP server instance
 */
function registerCredentialTools(server) {
  try {
    const credentialTools = getCredentialTools();
    for (const tool of credentialTools) {
      // Extract the shape from the Zod schema for MCP SDK compatibility
      const inputShape = tool.inputSchema.shape || tool.inputSchema;
      server.tool(tool.name, tool.description, inputShape, tool.handler);
    }
    console.log(`[MCP SDK] Registered ${credentialTools.length} credential tools`);
  } catch (error) {
    console.error(`[MCP SDK] Error registering credential tools: ${error.message}`);
    // Don't re-throw to allow other tools to register
  }
}

/**
 * Register all available tools with the MCP server
 * @param {McpServer} server - The MCP server instance
 * @param {Object} options - Configuration options (e.g., ciMemory)
 * @returns {Promise<void>}
 */
async function registerAllTools(server, options = {}) {
  try {
    console.log('[MCP SDK] Starting tool registration...');
    
    // Initialize memory tools with CI store
    if (options.ciMemory) {
      initializeMemoryTools(options.ciMemory);
    }
    
    // Register network tools (converted to SDK)
    registerNetworkTools(server);
      // Register memory tools (converted to SDK)
    registerMemoryTools(server);
      // Register NMAP tools (converted to SDK)
    registerNmapTools(server);
      // Register Proxmox tools (converted to SDK)
    registerProxmoxTools(server);
    
    // Register SNMP tools (converted to SDK)
    registerSnmpTools(server);
    
    // Register Zabbix tools (new)
    registerZabbixTools(server);
    
    // Register credential management tools/resources
    registerCredentialTools(server);
    
    // Register all resources
    await registerAllResources(server);
    
    console.log('[MCP SDK] All tools registered successfully');
  } catch (error) {
    console.error(`[MCP SDK] Error registering tools: ${error.message}`);
    // Log the stack trace for debugging
    console.error(error.stack);
    throw error;
  }
}

/**
 * Get count of tools that will be registered (for logging/monitoring)
 * @returns {Object} Tool counts by category
 */
function getToolCounts() {  
  return {
    network: 8,      // ✅ Converted
    memory: 8,       // ✅ Converted + Enhanced with persistent storage (was 4, now 8)
    nmap: 5,         // ✅ Converted
    proxmox: 10,     // ✅ Converted (removed 3 credential management tools)
    snmp: 12,        // ✅ Converted
    zabbix: 4,       // 🆕 NEW - Enterprise monitoring integration
    credentials: 5,  // ✅ Added - Credential management tools
    total: 52        // Updated total (48 + 4 Zabbix tools)
  };
}

module.exports = {
  registerAllTools,
  getToolCounts
};
