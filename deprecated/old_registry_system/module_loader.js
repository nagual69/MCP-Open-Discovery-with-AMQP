/**
 * Module Loader for MCP Open Discovery Server
 * 
 * DEPRECATED: This module is deprecated in favor of sdk_tool_registry.js
 * which provides proper MCP SDK integration.
 * 
 * This file is kept for backward compatibility and will be removed in v3.0.0
 */

const { registerAllTools } = require('./sdk_tool_registry');

/**
 * Loads all tool modules and registers their tools with the server
 * 
 * @param {Object} server - The MCP server instance
 * @param {Object} options - Additional options
 * @returns {Promise<void>}
 * @deprecated Use registerAllTools from sdk_tool_registry.js instead
 */
async function loadAllModules(server, options = {}) {
  console.warn('[DEPRECATED] module_loader.js is deprecated. Use sdk_tool_registry.js instead.');
  
  try {
    // Delegate to the new SDK tool registry
    await registerAllTools(server);
    console.log('[MCP] All SDK tools loaded successfully via registry');
  } catch (error) {
    console.error('[MCP] Failed to load tools via SDK registry:', error.message);
    throw error;
  }
}

module.exports = {
  loadAllModules
};
