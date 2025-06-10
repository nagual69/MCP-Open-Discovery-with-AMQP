/**
 * Module Loader for MCP Open Discovery Server
 * 
 * Handles dynamically loading all tool modules and registering their tools
 * with the MCP server instance.
 */

const path = require('path');
const fs = require('fs');

/**
 * Loads all tool modules and registers their tools with the server
 * 
 * @param {Object} server - The MCP server instance
 * @param {Object} options - Additional options
 * @returns {Promise<void>}
 */
async function loadAllModules(server, options = {}) {
  try {
    // Load core network tools
    const networkTools = require('./network_tools').getTools(server);
    networkTools.forEach(tool => server.tools.set(tool.name, tool));
    console.log(`[MCP] Loaded ${networkTools.length} network tools`);
    
    // Load Nmap tools
    const nmapTools = require('./nmap_tools').getTools(server);
    nmapTools.forEach(tool => server.tools.set(tool.name, tool));
    console.log(`[MCP] Loaded ${nmapTools.length} nmap tools`);
    
    // Load and initialize memory tools
    const memoryTools = require('./memory_tools');
    memoryTools.initialize(options.ciMemory || {});
    const memoryToolDefs = memoryTools.getTools(server);
    memoryToolDefs.forEach(tool => server.tools.set(tool.name, tool));
    console.log(`[MCP] Loaded ${memoryToolDefs.length} memory tools`);
    
    // Load Proxmox tools
    const proxmoxTools = require('./proxmox_tools').getTools(server);
    proxmoxTools.forEach(tool => server.tools.set(tool.name, tool));
    console.log(`[MCP] Loaded ${proxmoxTools.length} proxmox tools`);
    
    // Load SNMP tools
    const snmpTools = require('./snmp_module').getTools(server);
    snmpTools.forEach(tool => server.tools.set(tool.name, tool));
    console.log(`[MCP] Loaded ${snmpTools.length} SNMP tools`);
    
    console.log(`[MCP] Loaded ${server.tools.size} tools from modules`);
  } catch (error) {
    console.error(`[MCP] Error loading modules: ${error.message}`);
    throw error;
  }
}

module.exports = {
  loadAllModules
};
