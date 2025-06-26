// tools/resource_registry.js
// MCP Resource Registry for MCP Open Discovery Server
// Handles registration and management of MCP resources

const { getNagiosResources } = require('./nagios_tools_sdk');
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
    const nagiosResources = getNagiosResources();
    const credentialResources = getCredentialResources();
    
    const allResources = [
      ...nagiosResources,
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
            // For testing/demo purposes, use mock credentials
            // In production, these would come from the credential manager
            const mockParams = {
              uri: uri.href,
              baseUrl: 'https://demo-nagios.example.com',
              apiKey: 'demo-api-key-placeholder'
            };
            
            const result = await resource.getContent(mockParams);
            
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
    nagios: 4,      // Event log, inventory, host config, service config
    credentials: 1, // Audit log
    total: 5
  };
}

module.exports = {
  registerAllResources,
  getResourceCounts,
};
