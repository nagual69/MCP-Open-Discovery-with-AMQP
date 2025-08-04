/**
 * Management Tools SDK - Dynamic Registry Runtime Management
 * MCP SDK Compatible Tool Implementation
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

const { z } = require('zod');
const path = require('path');

// Tool definitions for new registry system
const tools = [
  {
    name: 'registry_get_status',
    description: 'Get comprehensive status of the dynamic tool registry including hot-reload info',
    inputSchema: z.object({
      include_analytics: z.boolean().default(true).describe("Include database analytics in the response").optional(),
      include_modules: z.boolean().default(true).describe("Include detailed module information").optional(),
      format: z.enum(["json", "summary"]).default("json").describe("Response format").optional()
    }),
  },
  {
    name: 'registry_load_module',
    description: 'Dynamically load a new module into the registry at runtime',
    inputSchema: z.object({
      module_path: z.string().describe("Absolute path to the module file to load"),
      module_name: z.string().describe("Name to register the module as"),
      category: z.string().describe("Category to place the module in"),
      enable_hotreload: z.boolean().default(true).describe("Enable hot-reload watching for this module").optional()
    }),
  },
  {
    name: 'registry_unload_module', 
    description: 'Unload a module and remove its tools from the registry',
    inputSchema: z.object({
      module_name: z.string().describe("Name of the module to unload"),
      force: z.boolean().default(false).describe("Force unload even if tools are in use").optional(),
      preserve_config: z.boolean().default(true).describe("Keep module configuration in database").optional()
    }),
  },
  {
    name: 'registry_reload_module',
    description: 'Hot-reload a module with updated code',
    inputSchema: z.object({
      module_name: z.string().describe("Name of the module to reload"),
      clear_cache: z.boolean().default(true).describe("Clear module cache before reload").optional(),
      validate_tools: z.boolean().default(true).describe("Validate all tools after reload").optional()
    }),
  },
  {
    name: 'registry_toggle_hotreload',
    description: 'Enable or disable hot-reload capabilities system-wide',
    inputSchema: z.object({
      enabled: z.boolean().describe("Enable (true) or disable (false) hot-reload").optional(),
      apply_to_modules: z.array(z.string()).describe("Specific modules to apply toggle to (empty = all)").optional(),
      restart_watchers: z.boolean().default(false).describe("Restart file watchers after toggle").optional()
    }),
  }
];

// Handle tool calls for new registry system
async function handleToolCall(name, args) {
  // Get the registry instance - this will be injected by the registry system
  const coreRegistry = global.mcpCoreRegistry;
  
  if (!coreRegistry) {
    return {
      content: [{ type: "text", text: "Error: Core registry not available" }],
      isError: true
    };
  }

  try {
    switch (name) {
      case 'registry_get_status': {
        const { include_analytics, include_modules, format } = args;
        
        console.log('[Management Tools] Getting registry status...');
        const status = coreRegistry.getStatus();
        
        let result = {
          registry_status: status,
          timestamp: new Date().toISOString()
        };
        
        if (include_analytics) {
          try {
            const analytics = await coreRegistry.getAnalytics();
            result.analytics = analytics;
          } catch (error) {
            result.analytics_error = error.message;
          }
        }
        
        if (!include_modules) {
          delete result.registry_status.modules;
        }
        
        if (format === 'summary') {
          result = {
            summary: {
              total_tools: status.deduplication?.uniqueTools || 0,
              total_modules: Object.keys(status.modules || {}).length,
              hot_reload_enabled: status.hot_reload?.enabled || false,
              database_enabled: !!result.analytics?.database
            },
            timestamp: result.timestamp
          };
        }
        
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2)
            }
          ]
        };
      }

      case 'registry_load_module': {
        const { module_path, module_name, category, enable_hotreload } = args;
        
        console.log(`[Management Tools] Loading module: ${module_name} from ${module_path}`);
        
        try {
          // Validate module path exists
          const fs = require('fs');
          if (!fs.existsSync(module_path)) {
            throw new Error(`Module file not found: ${module_path}`);
          }
          
          // Start module registration
          coreRegistry.startModule(module_name, category);
          
          // Dynamically require and register the module
          delete require.cache[require.resolve(module_path)]; // Clear cache
          const moduleExports = require(module_path);
          
          if (!moduleExports.tools || !moduleExports.handleToolCall) {
            throw new Error('Module must export tools array and handleToolCall function');
          }
          
          // Register tools from the module
          const server = global.mcpServerInstance;
          if (!server) {
            throw new Error('MCP server instance not available');
          }
          
          for (const tool of moduleExports.tools) {
            const inputSchema = tool.inputSchema?.shape || tool.inputSchema;
            server.registerTool(tool.name, tool.description, inputSchema, 
              async (args) => await moduleExports.handleToolCall(tool.name, args)
            );
            coreRegistry.registerTool(tool.name, server);
          }
          
          // Complete module registration
          await coreRegistry.completeModule();
          
          // Enable hot-reload if requested
          if (enable_hotreload) {
            coreRegistry.enableHotReload(module_name, module_path);
          }
          
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  success: true,
                  message: `Module ${module_name} loaded successfully`,
                  module_name,
                  category,
                  tools_loaded: moduleExports.tools.length,
                  hot_reload_enabled: enable_hotreload,
                  path: module_path
                }, null, 2)
              }
            ]
          };
          
        } catch (error) {
          console.error(`[Management Tools] Error loading module ${module_name}:`, error.message);
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  success: false,
                  error: error.message,
                  module_name,
                  path: module_path
                }, null, 2)
              }
            ],
            isError: true
          };
        }
      }

      case 'registry_unload_module': {
        const { module_name, force, preserve_config } = args;
        
        console.log(`[Management Tools] Unloading module: ${module_name}`);
        
        try {
          const result = await coreRegistry.unloadModule(module_name, { force, preserve_config });
          
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  success: true,
                  message: `Module ${module_name} unloaded successfully`,
                  module_name,
                  ...result
                }, null, 2)
              }
            ]
          };
          
        } catch (error) {
          console.error(`[Management Tools] Error unloading module ${module_name}:`, error.message);
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  success: false,
                  error: error.message,
                  module_name
                }, null, 2)
              }
            ],
            isError: true
          };
        }
      }

      case 'registry_reload_module': {
        const { module_name, clear_cache, validate_tools } = args;
        
        console.log(`[Management Tools] Reloading module: ${module_name}`);
        
        try {
          const result = await coreRegistry.reloadModule(module_name, { clear_cache, validate_tools });
          
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  success: true,
                  message: `Module ${module_name} reloaded successfully`,
                  module_name,
                  ...result
                }, null, 2)
              }
            ]
          };
          
        } catch (error) {
          console.error(`[Management Tools] Error reloading module ${module_name}:`, error.message);
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  success: false,
                  error: error.message,
                  module_name
                }, null, 2)
              }
            ],
            isError: true
          };
        }
      }

      case 'registry_toggle_hotreload': {
        const { enabled, apply_to_modules, restart_watchers } = args;
        
        console.log(`[Management Tools] Toggling hot-reload: ${enabled !== undefined ? enabled : 'toggle'}`);
        
        try {
          // If enabled is not specified, toggle current state
          const currentStatus = coreRegistry.getStatus();
          const newState = enabled !== undefined ? enabled : !currentStatus.hot_reload.enabled;
          
          let result;
          if (apply_to_modules && apply_to_modules.length > 0) {
            // Apply to specific modules
            result = await coreRegistry.toggleModuleHotReload(apply_to_modules, newState);
          } else {
            // Apply system-wide
            result = coreRegistry.toggleHotReload(newState);
          }
          
          if (restart_watchers && newState) {
            await coreRegistry.restartFileWatchers();
          }
          
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  success: true,
                  message: `Hot-reload ${newState ? 'enabled' : 'disabled'}`,
                  previous_state: currentStatus.hot_reload.enabled,
                  new_state: newState,
                  affected_modules: apply_to_modules || 'all',
                  watchers_restarted: restart_watchers && newState,
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
                text: JSON.stringify({
                  success: false,
                  error: error.message
                }, null, 2)
              }
            ],
            isError: true
          };
        }
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    return {
      content: [{ type: "text", text: `Error: ${error.message}` }],
      isError: true
    };
  }
}

/**
 * Legacy registration function for backward compatibility
 * This is deprecated - use the new registry system instead
 */
function registerManagementTools(server, coreRegistry) {
  console.log('[Management Tools] 🔧 Using legacy registration - this is deprecated');
  console.warn('[Management Tools] ⚠️  Please update to use the new registry system');
  
  // Store references globally for handleToolCall access
  global.mcpCoreRegistry = coreRegistry;
  global.mcpServerInstance = server;
  
  // Register tools using legacy method
  for (const tool of tools) {
    const inputSchema = tool.inputSchema.shape || tool.inputSchema;
    server.tool(tool.name, tool.description, inputSchema, 
      async (args) => await handleToolCall(tool.name, args)
    );
  }
  
  console.log('[Management Tools] ✅ Registered 5 dynamic module management tools (legacy mode)');
  return tools.map(tool => tool.name);
}

/**
 * Get list of management tool names
 */
function getManagementToolNames() {
  return tools.map(tool => tool.name);
}

// Legacy export for backward compatibility
const MANAGEMENT_TOOLS = tools.map(tool => ({
  name: tool.name,
  description: tool.description,
  inputSchema: {
    type: 'object',
    properties: {},
    additionalProperties: false
  }
}));

module.exports = { 
  tools, 
  handleToolCall,
  // Legacy exports for backward compatibility
  registerManagementTools,
  getManagementToolNames,
  MANAGEMENT_TOOLS
};
