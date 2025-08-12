/**
 * Stdio Transport for MCP Open Discovery Server v2.0
 * 
 * Extracted from main server file to improve modularity and maintainability.
 * This module handles stdio transport initialization and management.
 */

const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');

/**
 * Stdio Transport Configuration
 */
const STDIO_CONFIG = {
  // Stdio transport doesn't need specific configuration,
  // but we keep this structure for consistency
  TRANSPORT_NAME: 'stdio',
  DESCRIPTION: 'Standard input/output transport for CLI clients'
};

/**
 * Enhanced logging for stdio transport
 */
function logStdio(level, message, data = null) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] [${level.toUpperCase()}] [STDIO] ${message}`;
  
  if (level === 'error') {
    console.error(logMessage, data ? JSON.stringify(data, null, 2) : '');
  } else {
    console.log(logMessage, data ? JSON.stringify(data, null, 2) : '');
  }
}

/**
 * Start stdio transport
 * @param {McpServer} mcpServer - The MCP server instance to connect
 * @returns {Promise<Object>} Transport startup result
 */
async function startStdioTransport(mcpServer) {
  try {
    logStdio('info', 'Initializing stdio transport...');
    
    const transport = new StdioServerTransport();
    
    // Connect the server to the stdio transport
    await mcpServer.connect(transport);
    
    logStdio('info', 'Stdio transport connected successfully');
    
    return {
      success: true,
      transport: 'stdio',
      connection: transport,
      timestamp: new Date().toISOString()
    };
    
  } catch (error) {
    logStdio('error', 'Failed to start stdio transport', { 
      error: error.message,
      stack: error.stack 
    });
    
    return {
      success: false,
      transport: 'stdio',
      error: error.message,
      timestamp: new Date().toISOString()
    };
  }
}

/**
 * Get stdio transport status
 * @returns {Object} Current status information
 */
function getStdioStatus() {
  return {
    transport: 'stdio',
    available: true,
    description: STDIO_CONFIG.DESCRIPTION,
    requirements: 'Standard input/output streams',
    timestamp: new Date().toISOString()
  };
}

/**
 * Cleanup stdio transport
 * Currently a no-op as stdio transport handles its own cleanup
 */
async function cleanupStdioTransport() {
  logStdio('info', 'Stdio transport cleanup completed');
  return { success: true };
}

module.exports = {
  startStdioTransport,
  getStdioStatus,
  cleanupStdioTransport,
  STDIO_CONFIG
};
