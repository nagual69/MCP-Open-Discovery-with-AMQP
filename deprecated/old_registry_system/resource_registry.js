// tools/resource_registry.js
// MCP Resource Registry for MCP Open Discovery Server
// Handles registration and management of MCP resources

const { getCredentialResources } = require('./credentials_tools_sdk');

/**
 * Register all available resources with the MCP server
 * @param {McpServer} server - The MCP server instance
 * @returns {Promise<void>}
 */
async function registerAllResources(server) {
  try {
    console.log('[MCP SDK] Starting resource registration...');
    
    // Get all resources from modules
    const credentialResources = getCredentialResources();
    
    const allResources = [
      ...credentialResources
    ];
    
    // Register each resource using the MCP SDK pattern
    for (const resource of allResources) {
      server.resource(
        resource.name,
        resource.uri,
        async (uri) => {
          if (!resource.getContent) {
            throw new Error(`Resource ${uri.href} has no content handler`);
          }
          
          try {
            // For credential resources, provide appropriate context
            const params = {
              uri: uri.href
            };
            
            const result = await resource.getContent(params);
            
            // Ensure each content item has the required uri field
            const contents = (result.content || []).map(item => ({
              ...item,
              uri: uri.href  // Add the required uri field
            }));
            
            return { contents };
          } catch (error) {
            // Return error content with proper format
            return {
              contents: [{
                type: 'text',
                text: `Failed to read resource ${uri.href}: ${error.message}`,
                uri: uri.href
              }]
            };
          }
        }
      );
    }
    
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
    credentials: 1, // Audit log
    total: 1
  };
}

module.exports = {
  registerAllResources,
  getResourceCounts,
};
