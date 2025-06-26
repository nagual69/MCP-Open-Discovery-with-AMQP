// tools/resource_registry.js
// MCP Resource Registry for MCP Open Discovery Server
// Handles registration and management of MCP resources

const { getNagiosResources } = require('./nagios_tools_sdk');
const { getCredentialResources } = require('./credentials_tools_sdk');

// Global resource store
const resourceStore = new Map();

/**
 * Register all available resources with the MCP server
 * @param {McpServer} server - The MCP server instance
 * @returns {Promise<void>}
 */
async function registerAllResources(server) {
  try {
    console.log('[MCP SDK] Starting resource registration...');
    
    // Get all resources from modules
    const nagiosResources = getNagiosResources();
    const credentialResources = getCredentialResources();
    
    const allResources = [
      ...nagiosResources,
      ...credentialResources
    ];
    
    // Store resources for later retrieval
    for (const resource of allResources) {
      resourceStore.set(resource.uri, resource);
    }
    
    // Register resource handlers with the server
    server.setRequestHandler({ method: 'resources/list' }, async () => {
      const resources = Array.from(resourceStore.values()).map(r => ({
        uri: r.uri,
        name: r.name,
        description: r.description,
        mimeType: r.mimeType
      }));
      
      return { resources };
    });
    
    server.setRequestHandler({ method: 'resources/read' }, async (request) => {
      const { uri } = request.params;
      const resource = resourceStore.get(uri);
      
      if (!resource) {
        throw new Error(`Resource not found: ${uri}`);
      }
      
      if (!resource.getContent) {
        throw new Error(`Resource ${uri} has no content handler`);
      }
      
      try {
        const result = await resource.getContent(request.params);
        return {
          contents: result.content || [{ type: 'text', text: 'No content available' }]
        };
      } catch (error) {
        throw new Error(`Failed to read resource ${uri}: ${error.message}`);
      }
    });
    
    console.log(`[MCP SDK] Registered ${allResources.length} resources successfully`);
  } catch (error) {
    console.error(`[MCP SDK] Error registering resources: ${error.message}`);
    throw error;
  }
}

/**
 * Get count of resources that will be registered (for logging/monitoring)
 * @returns {Object} Resource counts by category
 */
function getResourceCounts() {
  return {
    nagios: 4,      // Event log, inventory, host config, service config
    credentials: 1, // Audit log
    total: 5
  };
}

module.exports = {
  registerAllResources,
  getResourceCounts,
};
