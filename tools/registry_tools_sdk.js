/**
 * Registry Tools SDK - Dynamic MCP Tool Registry Management
 * 
 * These tools provide runtime management of the MCP tool registry itself!
 * They allow dynamic loading/unloading of modules and hot-reload capabilities.
 * 
 * Features:
 * - registry_get_status: Get comprehensive registry status
 * - registry_load_module: Dynamically load new modules at runtime
 * - registry_unload_module: Unload modules and remove their tools
 * - registry_reload_module: Hot-reload modules with updated code  
 * - registry_toggle_hotreload: Enable/disable hot-reload system-wide
 */

const path = require('path');

/**
 * Register all registry management tools with the MCP server
 * @param {McpServer} server - The MCP server instance
 * @param {ToolRegistrationTracker} toolTracker - The global tool tracker instance
 */
function registerRegistryTools(server, toolTracker) {
  console.log('[MCP SDK] 🔧 Registering dynamic module management tools...');

  // Tool 1: Get module status and hot-reload information
  server.tool(
    'registry_get_status',
    'Get comprehensive status of the dynamic tool registry including hot-reload info',
    {
      type: 'object',
      properties: {},
      required: []
    },
    async () => {
      try {
        const status = toolTracker.getModuleStatus();
        const analytics = await toolTracker.getAnalytics();

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              registry_status: status,
              analytics: analytics,
              timestamp: new Date().toISOString()
            }, null, 2)
          }]
        };
      } catch (error) {
        return {
          content: [{
            type: 'text',
            text: `Error getting registry status: ${error.message}`
          }],
          isError: true
        };
      }
    }
  );

  // Tool 2: Load a module dynamically
  server.tool(
    'registry_load_module',
    'Dynamically load a new module into the registry at runtime',
    {
      type: 'object',
      properties: {
        modulePath: {
          type: 'string',
          description: 'Path to the module file (relative to tools/ directory)'
        },
        moduleName: {
          type: 'string',
          description: 'Name for the module'
        },
        category: {
          type: 'string',
          description: 'Category of tools (e.g., network, memory, custom)'
        },
        exportName: {
          type: 'string',
          description: 'Name of the export function to call'
        }
      },
      required: ['modulePath', 'moduleName', 'category', 'exportName']
    },
    async (args) => {
      try {
        const fullPath = path.resolve(__dirname, args.modulePath);
        const success = await toolTracker.loadModule(
          fullPath,
          args.moduleName,
          args.category,
          args.exportName
        );

        const moduleInfo = toolTracker.modules.get(args.moduleName);

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              success,
              module: args.moduleName,
              category: args.category,
              tools_loaded: moduleInfo?.tools?.length || 0,
              hot_reload_enabled: toolTracker.hotReloadEnabled,
              message: `Module ${args.moduleName} loaded successfully`
            }, null, 2)
          }]
        };
      } catch (error) {
        return {
          content: [{
            type: 'text',
            text: `Error loading module: ${error.message}`
          }],
          isError: true
        };
      }
    }
  );

  // Tool 3: Unload a module
  server.tool(
    'registry_unload_module',
    'Unload a module and remove its tools from the registry',
    {
      type: 'object',
      properties: {
        moduleName: {
          type: 'string',
          description: 'Name of the module to unload'
        }
      },
      required: ['moduleName']
    },
    async (args) => {
      try {
        const moduleInfo = toolTracker.modules.get(args.moduleName);
        const toolCount = moduleInfo?.tools?.length || 0;

        const success = await toolTracker.unloadModule(args.moduleName);

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              success,
              module: args.moduleName,
              tools_removed: toolCount,
              message: success ?
                `Module ${args.moduleName} unloaded successfully` :
                `Failed to unload module ${args.moduleName}`
            }, null, 2)
          }]
        };
      } catch (error) {
        return {
          content: [{
            type: 'text',
            text: `Error unloading module: ${error.message}`
          }],
          isError: true
        };
      }
    }
  );

  // Tool 4: Reload a module (hot-reload)
  server.tool(
    'registry_reload_module',
    'Hot-reload a module with updated code',
    {
      type: 'object',
      properties: {
        moduleName: {
          type: 'string',
          description: 'Name of the module to reload'
        }
      },
      required: ['moduleName']
    },
    async (args) => {
      try {
        const oldInfo = toolTracker.modules.get(args.moduleName);
        await toolTracker.reloadModule(args.moduleName);
        const newInfo = toolTracker.modules.get(args.moduleName);

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              success: true,
              module: args.moduleName,
              tools_before: oldInfo?.tools?.length || 0,
              tools_after: newInfo?.tools?.length || 0,
              hot_reload: true,
              message: `Module ${args.moduleName} hot-reloaded successfully`
            }, null, 2)
          }]
        };
      } catch (error) {
        return {
          content: [{
            type: 'text',
            text: `Error reloading module: ${error.message}`
          }],
          isError: true
        };
      }
    }
  );

  // Tool 5: Toggle hot-reload for the entire system
  server.tool(
    'registry_toggle_hotreload',
    'Enable or disable hot-reload capabilities system-wide',
    {
      type: 'object',
      properties: {
        enabled: {
          type: 'boolean',
          description: 'Enable (true) or disable (false) hot-reload'
        }
      },
      required: ['enabled']
    },
    async (args) => {
      try {
        const oldStatus = toolTracker.hotReloadEnabled;
        toolTracker.hotReloadEnabled = args.enabled;

        // Update database config
        if (toolTracker.dbInitialized) {
          await toolTracker.db.updateConfig('hot_reload', args.enabled.toString());
        }

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              success: true,
              hot_reload_enabled: args.enabled,
              previous_status: oldStatus,
              watched_modules: toolTracker.moduleWatchers.size,
              message: `Hot-reload ${args.enabled ? 'enabled' : 'disabled'}`
            }, null, 2)
          }]
        };
      } catch (error) {
        return {
          content: [{
            type: 'text',
            text: `Error toggling hot-reload: ${error.message}`
          }],
          isError: true
        };
      }
    }
  );

  console.log('[MCP SDK] ✅ Registered 5 dynamic module management tools');
}

/**
 * Get tool definitions for registration tracking
 * @returns {Array} Array of tool names for counting
 */
function getRegistryToolNames() {
  return [
    'registry_get_status',
    'registry_load_module', 
    'registry_unload_module',
    'registry_reload_module',
    'registry_toggle_hotreload'
  ];
}

module.exports = {
  registerRegistryTools,
  getRegistryToolNames
};
