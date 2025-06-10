/**
 * Module Loader for MCP Open Discovery Server
 * 
 * This module handles loading and registering all tool modules for the MCP server.
 * It dynamically scans the tools directory and loads each module, then registers
 * the tools with the server.
 */

const fs = require('fs');
const path = require('path');

/**
 * Loads all tool modules and registers them with the MCP server
 * @param {object} server - The MCP server instance where tools will be registered
 * @returns {Promise<void>}
 */
async function loadAllModules(server) {
  console.log('Loading tool modules...');
  
  const toolsDir = path.join(__dirname, 'tools');
  
  try {
    // Check if tools directory exists
    if (!fs.existsSync(toolsDir)) {
      console.error(`Tools directory not found at ${toolsDir}`);
      return;
    }
    
    // Get all JavaScript files in the tools directory
    const files = fs.readdirSync(toolsDir)
      .filter(file => file.endsWith('.js'));
    
    console.log(`Found ${files.length} potential module files in ${toolsDir}`);
    
    // Load each module
    for (const file of files) {
      try {
        const modulePath = path.join(toolsDir, file);
        console.log(`Loading module: ${file}`);
        
        // Require the module
        const module = require(modulePath);
        
        // Check if the module exports a function to get its tools
        if (typeof module.getNetworkTools === 'function') {
          console.log(`Registering network tools from ${file}`);
          const tools = module.getNetworkTools();
          registerToolsWithServer(server, tools);
        } 
        else if (typeof module.getNmapTools === 'function') {
          console.log(`Registering Nmap tools from ${file}`);
          const tools = module.getNmapTools();
          registerToolsWithServer(server, tools);
        }
        else if (typeof module.getMemoryTools === 'function') {
          console.log(`Registering memory tools from ${file}`);
          const tools = module.getMemoryTools(server);  // Memory tools need server reference
          registerToolsWithServer(server, tools);
        }
        else if (typeof module.getSnmpTools === 'function') {
          console.log(`Registering SNMP tools from ${file}`);
          const tools = module.getSnmpTools();
          registerToolsWithServer(server, tools);
        }
        else if (typeof module.getProxmoxTools === 'function') {
          console.log(`Registering Proxmox tools from ${file}`);
          const tools = module.getProxmoxTools();
          registerToolsWithServer(server, tools);
        }
        else {
          console.warn(`Module ${file} does not export a recognized tool getter function`);
        }
      } catch (err) {
        console.error(`Error loading module ${file}:`, err);
      }
    }
    
    console.log('All modules loaded successfully');
  } catch (err) {
    console.error('Error loading modules:', err);
  }
}

/**
 * Registers an array of tools with the MCP server
 * @param {object} server - The MCP server instance
 * @param {Array} tools - Array of tool objects to register
 */
function registerToolsWithServer(server, tools) {
  if (!Array.isArray(tools)) {
    console.warn('Expected tools to be an array, but got:', typeof tools);
    return;
  }
  
  tools.forEach(tool => {
    if (tool && tool.name) {
      console.log(`Registering tool: ${tool.name}`);
      server.tools.set(tool.name, tool);
    } else {
      console.warn('Invalid tool definition:', tool);
    }
  });
}

module.exports = {
  loadAllModules
};
