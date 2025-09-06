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
const { DiscoveryEngine } = require('./registry/discovery_engine.js');
const { getResourceCounts, getResourceHealth } = require('./registry/resource_manager.js');

/**
 * Tools definition array for the new hot-reload registry system
 */
const tools = [
  {
    name: 'registry_get_status',
    description: 'Get comprehensive status of the dynamic tool registry including hot-reload info',
    inputSchema: {
      type: 'object',
      properties: {
        includeAnalytics: { type: 'boolean', description: 'Include database analytics in the response' },
        includeModules: { type: 'boolean', description: 'Include detailed module information (if available)' },
        format: { type: 'string', enum: ['json', 'summary'], description: 'Response format' }
      },
      required: []
    }
  },
  {
    name: 'registry_list_modules',
    description: 'List currently known modules and watcher status from the hot-reload manager',
    inputSchema: {
      type: 'object',
      properties: {},
      required: []
    }
  },
  {
    name: 'registry_watch_module',
    description: 'Start watching a module for hot-reload by name and optional file path',
    inputSchema: {
      type: 'object',
      properties: {
        moduleName: { type: 'string', description: 'Name of the module (e.g., memory_tools_sdk)' },
        filePath: { type: 'string', description: 'Absolute path to the module file; if omitted, attempts a require.resolve fallback' }
      },
      required: ['moduleName']
    }
  },
  {
    name: 'registry_unwatch_module',
    description: 'Stop watching a module for hot-reload',
    inputSchema: {
      type: 'object',
      properties: {
        moduleName: { type: 'string', description: 'Name of the module to stop watching' }
      },
      required: ['moduleName']
    }
  },
  {
    name: 'registry_discover_modules',
    description: 'Run the Discovery Engine to find tool modules and return metadata + load order',
    inputSchema: {
      type: 'object',
      properties: {},
      required: []
    }
  },
  {
    name: 'registry_resources_status',
    description: 'Return resource registration counts and health status',
    inputSchema: {
      type: 'object',
      properties: {},
      required: []
    }
  },
  {
    name: 'registry_restart_watchers',
    description: 'Disable and re-enable hot-reload to restart all watchers using preserved file paths',
    inputSchema: {
      type: 'object',
      properties: {},
      required: []
    }
  },
  {
    name: 'registry_load_module',
  description: 'Dynamically load a new module into the registry at runtime (register tools)',
    inputSchema: {
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
  required: ['modulePath', 'moduleName', 'category']
    }
  },
  {
    name: 'registry_unload_module',
    description: 'Unload a module and remove its tools from the registry (best-effort unregister)',
    inputSchema: {
      type: 'object',
      properties: {
        moduleName: {
          type: 'string',
          description: 'Name of the module to unload'
        }
      },
      required: ['moduleName']
    }
  },
  {
    name: 'registry_reregister_module',
    description: 'Re-register a module’s tools after hot-reload to refresh handlers',
    inputSchema: {
      type: 'object',
      properties: {
        moduleName: { type: 'string', description: 'Module to re-register' },
  filePath: { type: 'string', description: 'Optional absolute module path if auto-resolve fails' }
      },
      required: ['moduleName']
    }
  },
  {
    name: 'plugin_list',
    description: 'List discovered plugins and their states',
    inputSchema: { type: 'object', properties: {}, required: [] }
  },
  {
    name: 'plugin_load',
    description: 'Load a plugin by ID',
    inputSchema: { type: 'object', properties: { pluginId: { type: 'string' } }, required: ['pluginId'] }
  },
  {
    name: 'plugin_unload',
    description: 'Unload a plugin by ID',
    inputSchema: { type: 'object', properties: { pluginId: { type: 'string' } }, required: ['pluginId'] }
  },
  {
    name: 'plugin_activate',
    description: 'Activate a loaded plugin by ID',
    inputSchema: { type: 'object', properties: { pluginId: { type: 'string' } }, required: ['pluginId'] }
  },
  {
    name: 'registry_reload_module',
    description: 'Hot-reload a module with fresh code from disk',
    inputSchema: {
      type: 'object',
      properties: {
        moduleName: {
          type: 'string',
          description: 'Name of the module to reload'
        },
        reregister: {
          type: 'boolean',
          description: 'If true, immediately re-register the module tools after reload',
          default: false
  },
  clearCache: { type: 'boolean', description: 'Clear module cache before reload' },
  validateTools: { type: 'boolean', description: 'Validate tools after reload' }
      },
      required: ['moduleName']
    }
  },
  {
    name: 'registry_toggle_hotreload',
    description: 'Enable or disable hot-reload system-wide',
    inputSchema: {
      type: 'object',
      properties: {
        enabled: {
          type: 'boolean',
          description: 'Whether to enable or disable hot-reload'
        }
      },
      required: ['enabled']
    }
  }
];

/**
 * Central tool call handler for all registry tools
 */
async function handleToolCall(toolName, args) {
  // Get the registry components - updated to use new architecture
  const { getRegistryInstance, getHotReloadManager, getValidationManager, dynamicLoadModule, dynamicUnloadModule, reregisterModuleTools, getPluginManager } = require('./registry/index.js');
  const registry = getRegistryInstance();
  const hotReloadManager = getHotReloadManager();
  const validationManager = getValidationManager();
  
  switch (toolName) {
    case 'registry_get_status':
      try {
        if (!registry) {
          return {
            content: [{
              type: 'text',
              text: 'Registry not initialized yet'
            }],
            isError: true
          };
        }

  const status = registry.getStats();
  // Handle optional analytics/format similar to management_tools
  const includeAnalytics = args.includeAnalytics ?? false;
  const includeModules = args.includeModules ?? true;
  const format = args.format || 'json';
        const hotReloadStatus = hotReloadManager ? hotReloadManager.getStatus() : null;
        const validationSummary = validationManager ? validationManager.getValidationSummary() : null;

        const payload = { registry_status: status, hot_reload: hotReloadStatus, validation: validationSummary, timestamp: new Date().toISOString() };
        if (includeAnalytics && registry.getAnalytics) {
          try {
            payload.analytics = await registry.getAnalytics();
          } catch (e) {
            payload.analytics_error = e.message;
          }
        }
        if (!includeModules && payload.registry_status && payload.registry_status.modules) {
          // Redact detailed modules map if present in status
          delete payload.registry_status.modules;
        }
        if (format === 'summary') {
          const rs = payload.registry_status || {};
          const hr = payload.hot_reload || {};
          const summary = {
            total_tools: rs.tools || 0,
            total_modules: rs.modules || 0,
            hot_reload_enabled: hr.enabled || false,
            database_enabled: !!(payload.analytics && payload.analytics.database)
          };
          return { content: [{ type: 'text', text: JSON.stringify({ summary, timestamp: payload.timestamp }, null, 2) }] };
        }
        return { content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }] };
      } catch (error) {
        return {
          content: [{
            type: 'text',
            text: `Error getting registry status: ${error.message}`
          }],
          isError: true
        };
      }

    case 'registry_load_module':
      try {
        // Back-compat: accept snake_case from management_tools
        const normalized = {
          modulePath: args.modulePath ?? args.module_path,
          moduleName: args.moduleName ?? args.module_name,
          category: args.category,
          exportName: args.exportName
        };
        const result = await dynamicLoadModule(normalized);
  return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }], isError: result.success === false };
      } catch (error) {
        return {
          content: [{
            type: 'text',
            text: `Error loading module: ${error.message}`
          }],
          isError: true
        };
      }

    case 'registry_unload_module':
      try {
  const result = await dynamicUnloadModule(args.moduleName);
  return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }], isError: result.success === false };
      } catch (error) {
        return {
          content: [{
            type: 'text',
            text: `Error unloading module: ${error.message}`
          }],
          isError: true
        };
      }

    case 'registry_reload_module':
      try {
        if (!hotReloadManager) {
          return {
            content: [{
              type: 'text',
              text: 'Hot-reload manager not available'
            }],
            isError: true
          };
        }

  const options = { clearCache: !!args.clearCache, validateTools: !!args.validateTools };
  const result = await hotReloadManager.reloadModule(args.moduleName, options);
        let merged = result;
        if (result && result.success && args.reregister) {
          try {
            const reg = await reregisterModuleTools(args.moduleName);
            merged = { ...result, reregister: reg };
          } catch (e) {
            merged = { ...result, reregister: { success: false, error: e.message } };
          }
        }
        return {
          content: [{ type: 'text', text: JSON.stringify(merged, null, 2) }],
          isError: merged && (merged.success === false || (merged.reregister && merged.reregister.success === false))
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

    case 'registry_reregister_module':
      try {
        // If filePath provided, seed the hot-reload manager mapping to help reregister
        if (args.filePath && getHotReloadManager) {
          const hrm = getHotReloadManager();
          if (hrm && args.moduleName && args.filePath) {
            hrm.moduleFilePaths.set(args.moduleName, args.filePath);
          }
        }
        const result = await reregisterModuleTools(args.moduleName);
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }], isError: result.success === false };
      } catch (error) {
        return { content: [{ type: 'text', text: `Error re-registering module: ${error.message}` }], isError: true };
      }

    case 'registry_toggle_hotreload':
      try {
        if (!hotReloadManager) {
          return {
            content: [{
              type: 'text',
              text: 'Hot-reload manager not available'
            }],
            isError: true
          };
        }

        if (args.enabled) {
          hotReloadManager.enable();
        } else {
          hotReloadManager.disable();
        }

        const status = hotReloadManager.getStatus();

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              hot_reload_enabled: status.enabled,
              watching_modules: status.watchedModules,
              message: `Hot-reload ${args.enabled ? 'enabled' : 'disabled'} system-wide`
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

    case 'registry_list_modules':
      try {
        const hot = hotReloadManager ? hotReloadManager.getStatus() : null;
        return {
          content: [{ type: 'text', text: JSON.stringify({ hot_reload: hot }, null, 2) }],
          isError: !hot
        };
      } catch (error) {
        return { content: [{ type: 'text', text: `Error listing modules: ${error.message}` }], isError: true };
      }

    case 'registry_watch_module':
      try {
        if (!hotReloadManager) {
          return { content: [{ type: 'text', text: 'Hot-reload manager not available' }], isError: true };
        }
        const { moduleName } = args;
        let { filePath } = args;
        if (!filePath) {
          try {
            // Attempt standard tools path resolution
            filePath = require.resolve(`./${moduleName}`);
          } catch (e) {
            try {
              filePath = require.resolve(`../${moduleName}`);
            } catch (e2) {
              return { content: [{ type: 'text', text: `Cannot resolve filePath for ${moduleName}; please provide an absolute path` }], isError: true };
            }
          }
        }
        if (!path.isAbsolute(filePath)) {
          filePath = path.resolve(filePath);
        }
        hotReloadManager.watchModule(moduleName, filePath);
        const status = hotReloadManager.getStatus();
        return { content: [{ type: 'text', text: JSON.stringify({ success: true, module: status.modules[moduleName] || null }, null, 2) }] };
      } catch (error) {
        return { content: [{ type: 'text', text: `Error watching module: ${error.message}` }], isError: true };
      }

    case 'registry_unwatch_module':
      try {
        if (!hotReloadManager) {
          return { content: [{ type: 'text', text: 'Hot-reload manager not available' }], isError: true };
        }
        hotReloadManager.stopWatching(args.moduleName);
        const status = hotReloadManager.getStatus();
        return { content: [{ type: 'text', text: JSON.stringify({ success: true, module: status.modules[args.moduleName] || null }, null, 2) }] };
      } catch (error) {
        return { content: [{ type: 'text', text: `Error unwatching module: ${error.message}` }], isError: true };
      }

    case 'registry_discover_modules':
      try {
        const engine = new DiscoveryEngine();
        const modules = await engine.discoverToolModules();
        const stats = engine.getStats();
        return { content: [{ type: 'text', text: JSON.stringify({ stats, modules }, null, 2) }] };
      } catch (error) {
        return { content: [{ type: 'text', text: `Error during discovery: ${error.message}` }], isError: true };
      }

    case 'registry_resources_status':
      try {
        const counts = getResourceCounts();
        const health = getResourceHealth();
        return { content: [{ type: 'text', text: JSON.stringify({ counts, health }, null, 2) }] };
      } catch (error) {
        return { content: [{ type: 'text', text: `Error retrieving resources status: ${error.message}` }], isError: true };
      }

    case 'registry_restart_watchers':
      try {
        if (!hotReloadManager) {
          return { content: [{ type: 'text', text: 'Hot-reload manager not available' }], isError: true };
        }
        hotReloadManager.disable();
        hotReloadManager.enable();
        const status = hotReloadManager.getStatus();
        return { content: [{ type: 'text', text: JSON.stringify({ success: true, status }, null, 2) }] };
      } catch (error) {
        return { content: [{ type: 'text', text: `Error restarting watchers: ${error.message}` }], isError: true };
      }

    default:
      throw new Error(`Unknown registry tool: ${toolName}`);
    
    // Plugin management tools
    case 'plugin_list':
      try {
        const pm = getPluginManager();
        await pm.initialize();
        const list = pm.listPlugins();
        const stats = pm.getStats();
        return { content: [{ type: 'text', text: JSON.stringify({ plugins: list, stats }, null, 2) }] };
      } catch (error) {
        return { content: [{ type: 'text', text: `Error listing plugins: ${error.message}` }], isError: true };
      }
    case 'plugin_load':
      try {
        const pm = getPluginManager();
        await pm.initialize();
        const ok = await pm.loadPlugin(args.pluginId);
        return { content: [{ type: 'text', text: JSON.stringify({ success: ok }, null, 2) }], isError: !ok };
      } catch (error) {
        return { content: [{ type: 'text', text: `Error loading plugin: ${error.message}` }], isError: true };
      }
    case 'plugin_unload':
      try {
        const pm = getPluginManager();
        const ok = await pm.unloadPlugin(args.pluginId);
        return { content: [{ type: 'text', text: JSON.stringify({ success: ok }, null, 2) }], isError: !ok };
      } catch (error) {
        return { content: [{ type: 'text', text: `Error unloading plugin: ${error.message}` }], isError: true };
      }
    case 'plugin_activate':
      try {
        const pm = getPluginManager();
        const ok = await pm.activatePlugin(args.pluginId);
        return { content: [{ type: 'text', text: JSON.stringify({ success: ok }, null, 2) }], isError: !ok };
      } catch (error) {
        return { content: [{ type: 'text', text: `Error activating plugin: ${error.message}` }], isError: true };
      }
  }
}

module.exports = {
  // New hot-reload registry format
  tools,
  handleToolCall
};
