/**
 * Resource Manager - MCP Resource Registration and Management
 * 
 * Handles MCP resource registration and lifecycle:
 * - Credential resources for secure access
 * - Dynamic resource discovery and registration
 * - Resource content providers and handlers
 * - Integration with server resource system
 * 
 * Security: Centralized resource access control
 * Scalability: Modular resource provider system
 */

const { getCredentialResources } = require('../credentials_tools_sdk');

/**
 * Register all available resources with the MCP server
 * @param {McpServer} server - The MCP server instance
 * @returns {Promise<Object>} Resource registration results
 */
async function registerAllResources(server) {
  try {
    console.log('[Resource Manager] Starting resource registration...');
    
    // Collect resources from all providers
    const credentialResources = getCredentialResources();
    
    const allResources = [
      ...credentialResources
    ];
    
    console.log(`[Resource Manager] Found ${allResources.length} resources to register`);

    // Register each resource using the MCP SDK pattern
    let registeredCount = 0;
    for (const resource of allResources) {
      try {
        server.resource(
          resource.name,
          resource.uri,
          async (uri) => {
            if (!resource.getContent) {
              throw new Error(`Resource ${uri.href} has no content handler`);
            }
            
            const content = await resource.getContent(uri);
            console.log(`[Resource Manager] Served resource: ${uri.href}`);
            return content;
          }
        );
        
        registeredCount++;
        console.log(`[Resource Manager] ✓ Registered resource: ${resource.name}`);
      } catch (error) {
        console.error(`[Resource Manager] Failed to register resource ${resource.name}:`, error.message);
      }
    }
    
    console.log(`[Resource Manager] Registered ${registeredCount} resources successfully`);
    
    return {
      total: allResources.length,
      registered: registeredCount,
      failed: allResources.length - registeredCount,
      resources: allResources.map(r => ({ name: r.name, uri: r.uri }))
    };
  } catch (error) {
    console.error('[Resource Manager] Resource registration failed:', error.message);
    throw error;
  }
}

/**
 * Get resource registration counts by category
 * @returns {Object} Resource counts
 */
function getResourceCounts() {
  try {
    const credentialResources = getCredentialResources();
    
    return {
      credentials: credentialResources.length,
      total: credentialResources.length
    };
  } catch (error) {
    console.error('[Resource Manager] Failed to get resource counts:', error.message);
    return {
      credentials: 0,
      total: 0,
      error: error.message
    };
  }
}

/**
 * Register a single resource provider
 * @param {McpServer} server - The MCP server instance  
 * @param {Object} resourceProvider - Resource provider object
 * @returns {Promise<boolean>} Success status
 */
async function registerResourceProvider(server, resourceProvider) {
  try {
    const resources = await resourceProvider.getResources();
    
    for (const resource of resources) {
      server.resource(
        resource.name,
        resource.uri,
        async (uri) => {
          return await resourceProvider.getContent(uri);
        }
      );
      
      console.log(`[Resource Manager] ✓ Registered provider resource: ${resource.name}`);
    }
    
    return true;
  } catch (error) {
    console.error(`[Resource Manager] Failed to register resource provider:`, error.message);
    return false;
  }
}

/**
 * Validate resource configuration
 * @param {Object} resource - Resource configuration
 * @returns {boolean} Valid configuration
 */
function validateResourceConfig(resource) {
  const required = ['name', 'uri', 'getContent'];
  
  for (const field of required) {
    if (!resource[field]) {
      console.error(`[Resource Manager] Invalid resource: missing ${field}`);
      return false;
    }
  }
  
  // Validate URI format
  try {
    new URL(resource.uri);
  } catch (error) {
    console.error(`[Resource Manager] Invalid resource URI: ${resource.uri}`);
    return false;
  }
  
  // Validate content handler
  if (typeof resource.getContent !== 'function') {
    console.error(`[Resource Manager] Invalid resource: getContent must be a function`);
    return false;
  }
  
  return true;
}

/**
 * Get resource health status
 * @returns {Object} Health status
 */
function getResourceHealth() {
  try {
    const counts = getResourceCounts();
    
    return {
      status: 'healthy',
      total_resources: counts.total,
      categories: {
        credentials: counts.credentials
      },
      last_check: new Date().toISOString(),
      issues: []
    };
  } catch (error) {
    return {
      status: 'error',
      error: error.message,
      last_check: new Date().toISOString(),
      issues: ['Failed to get resource counts']
    };
  }
}

module.exports = {
  registerAllResources,
  getResourceCounts,
  registerResourceProvider,
  validateResourceConfig,
  getResourceHealth
};
