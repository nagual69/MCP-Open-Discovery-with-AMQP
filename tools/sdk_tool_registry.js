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
const { getNagiosTools, getNagiosResources } = require('./nagios_tools_sdk');
const { getCredentialTools, getCredentialResources } = require('./credentials_tools_sdk');

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
    // Register Nagios tools/resources
    registerNagiosTools(server);
    // Register credential management tools/resources
    registerCredentialTools(server);
    
    console.log('[MCP SDK] All tools registered successfully');
  } catch (error) {
    console.error(`[MCP SDK] Error registering tools: ${error.message}`);
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
    memory: 4,       // ✅ Converted
    nmap: 5,         // ✅ Converted
    proxmox: 13,     // ✅ Converted
    snmp: 12,        // ✅ Converted
    nagios: 6,       // ✅ Added - Nagios XI tools
    credentials: 5,  // ✅ Added - Credential management tools
    total: 53        // Updated total
  };
}

function registerNagiosTools(server) {
  const nagiosTools = getNagiosTools();
  for (const tool of nagiosTools) {
    server.registerTool(tool);
  }
  // Register Nagios resources if your server supports resource registration
  if (typeof server.registerResource === 'function') {
    const nagiosResources = getNagiosResources();
    for (const resource of nagiosResources) {
      server.registerResource(resource);
    }
  }
}

function registerCredentialTools(server) {
  const credentialTools = getCredentialTools();
  for (const tool of credentialTools) {
    server.registerTool(tool);
  }
  // Register credential resources if your server supports resource registration
  if (typeof server.registerResource === 'function') {
    const credentialResources = getCredentialResources();
    for (const resource of credentialResources) {
      server.registerResource(resource);
    }
  }
}

module.exports = {
  registerAllTools,
  getToolCounts
};
