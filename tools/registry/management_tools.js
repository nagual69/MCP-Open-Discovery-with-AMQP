/**
 * Management Tools - Dynamic Registry Runtime Management
 * 
 * Provides MCP tools for runtime management of the registry system:
 * - Status monitoring and analytics
 * - Dynamic module loading/unloading  
 * - Hot-reload control and configuration
 * - System health and performance metrics
 * 
 * Security: Controlled access to registry management operations
 * Integration: Works with CoreRegistry for safe operations
 */

const path = require('path');

/**
 * Registry management tools for MCP server integration
 */
const MANAGEMENT_TOOLS = [
  {
    name: 'registry_get_status',
    description: 'Get comprehensive status of the dynamic tool registry including hot-reload info',
    inputSchema: {
      type: 'object',
      properties: {},
      additionalProperties: false
    }
  },
  {
    name: 'registry_load_module',
    description: 'Dynamically load a new module into the registry at runtime',
    inputSchema: {
      type: 'object',
      properties: {},
      additionalProperties: false
    }
  },
  {
    name: 'registry_unload_module', 
    description: 'Unload a module and remove its tools from the registry',
    inputSchema: {
      type: 'object',
      properties: {},
      additionalProperties: false
    }
  },
  {
    name: 'registry_reload_module',
    description: 'Hot-reload a module with updated code',
    inputSchema: {
      type: 'object',
      properties: {},
      additionalProperties: false
    }
  },
  {
    name: 'registry_toggle_hotreload',
    description: 'Enable or disable hot-reload capabilities system-wide',
    inputSchema: {
      type: 'object',
      properties: {},
      additionalProperties: false
    }
  }
];

/**
 * Register management tools with the MCP server
 * @param {McpServer} server - The MCP server instance
 * @param {CoreRegistry} coreRegistry - The core registry instance
 */
function registerManagementTools(server, coreRegistry) {
  console.log('[Management Tools] 🔧 Registering dynamic module management tools...');

  // Tool 1: Get registry status
  server.tool(
    'registry_get_status',
    'Get comprehensive status of the dynamic tool registry including hot-reload info',
    {
      type: 'object',
      properties: {},
      additionalProperties: false
    },
    async () => {
      try {
        console.log('[Management Tools] Getting registry status...');
        const status = coreRegistry.getStatus();
        const analytics = await coreRegistry.getAnalytics();
        
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                registry_status: status,
                analytics: analytics,
                timestamp: new Date().toISOString()
              }, null, 2)
            }
          ]
        };
      } catch (error) {
        console.error('[Management Tools] Error getting registry status:', error.message);
        return {
          content: [
            {
              type: 'text',
              text: `Error getting registry status: ${error.message}`
            }
          ],
          isError: true
        };
      }
    }
  );

  // Tool 2: Load module dynamically
  server.tool(
    'registry_load_module',
    'Dynamically load a new module into the registry at runtime',
    {
      type: 'object',
      properties: {},
      additionalProperties: false
    },
    async () => {
      try {
        console.log('[Management Tools] Dynamic module loading requested...');
        
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: false,
                message: 'Dynamic module loading not yet implemented',
                status: 'placeholder'
              }, null, 2)
            }
          ]
        };
      } catch (error) {
        console.error('[Management Tools] Error loading module:', error.message);
        return {
          content: [
            {
              type: 'text', 
              text: `Error loading module: ${error.message}`
            }
          ],
          isError: true
        };
      }
    }
  );

  // Tool 3: Unload module
  server.tool(
    'registry_unload_module',
    'Unload a module and remove its tools from the registry',
    {
      type: 'object',
      properties: {},
      additionalProperties: false
    },
    async () => {
      try {
        console.log('[Management Tools] Module unloading requested...');
        
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: false,
                message: 'Module unloading not yet implemented',
                status: 'placeholder'
              }, null, 2)
            }
          ]
        };
      } catch (error) {
        console.error('[Management Tools] Error unloading module:', error.message);
        return {
          content: [
            {
              type: 'text',
              text: `Error unloading module: ${error.message}`
            }
          ],
          isError: true
        };
      }
    }
  );

  // Tool 4: Reload module
  server.tool(
    'registry_reload_module',
    'Hot-reload a module with updated code',
    {
      type: 'object',
      properties: {},
      additionalProperties: false
    },
    async () => {
      try {
        console.log('[Management Tools] Module hot-reload requested...');
        
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: false,
                message: 'Hot-reload not yet implemented',
                status: 'placeholder'
              }, null, 2)
            }
          ]
        };
      } catch (error) {
        console.error('[Management Tools] Error reloading module:', error.message);
        return {
          content: [
            {
              type: 'text',
              text: `Error reloading module: ${error.message}`
            }
          ],
          isError: true
        };
      }
    }
  );

  // Tool 5: Toggle hot-reload
  server.tool(
    'registry_toggle_hotreload',
    'Enable or disable hot-reload capabilities system-wide',
    {
      type: 'object',
      properties: {},
      additionalProperties: false
    },
    async () => {
      try {
        console.log('[Management Tools] Hot-reload toggle requested...');
        
        // Toggle current state
        const currentStatus = coreRegistry.getStatus();
        const newState = !currentStatus.hot_reload.enabled;
        const result = coreRegistry.toggleHotReload(newState);
        
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: true,
                message: `Hot-reload ${newState ? 'enabled' : 'disabled'}`,
                previous_state: currentStatus.hot_reload.enabled,
                new_state: newState,
                ...result
              }, null, 2)
            }
          ]
        };
      } catch (error) {
        console.error('[Management Tools] Error toggling hot-reload:', error.message);
        return {
          content: [
            {
              type: 'text',
              text: `Error toggling hot-reload: ${error.message}`
            }
          ],
          isError: true
        };
      }
    }
  );

  console.log('[Management Tools] ✅ Registered 5 dynamic module management tools');
  return MANAGEMENT_TOOLS.map(tool => tool.name);
}

/**
 * Get list of management tool names
 */
function getManagementToolNames() {
  return MANAGEMENT_TOOLS.map(tool => tool.name);
}

module.exports = {
  registerManagementTools,
  getManagementToolNames,
  MANAGEMENT_TOOLS
};
