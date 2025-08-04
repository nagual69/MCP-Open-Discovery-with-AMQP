/**
 * Registry Orchestrator - Main Entry Point for MCP Open Discovery Registry
 * 
 * This is the single entry point for the consolidated registry system.
 * Replaces the previous scattered registry files with a clean, secure architecture:
 * 
 * OLD ARCHITECTURE (✅ MOVED TO deprecated/):
 * - sdk_tool_registry.js (791 lines, complex dependencies) → ✅ deprecated/old_registry_system/
 * - tool_registration_tracker.js (318 lines, redundant functionality) → ✅ deprecated/old_registry_system/
 * - registry_tools_sdk.js (284 lines, mixed concerns) → ✅ converted to new format
 * - resource_registry.js (84 lines, simple wrapper) → ✅ deprecated/old_registry_system/
 * - module_loader.js (deprecated) → ✅ deprecated/old_registry_system/
 * - dynamic_registry_db.js (complex SQLite layer) → ✅ deprecated/old_registry_system/
 * 
 * NEW ARCHITECTURE (ORGANIZED):
 * - registry/core_registry.js - Main registry logic
 * - registry/database_layer.js - SQLite persistence  
 * - registry/management_tools.js - Runtime management
 * - registry/resource_manager.js - MCP resources
 * - registry/index.js - This orchestrator (single entry point)
 * 
 * Security Benefits:
 * - Single entry point reduces attack surface
 * - Clear separation of concerns
 * - Isolated database operations
 * - Controlled access to management functions
 */

const { CoreRegistry } = require('./core_registry');
const { DatabaseLayer } = require('./database_layer');

/**
 * Convert Zod schema to JSON Schema for MCP SDK compatibility
 * Handles common Zod types that cause MCP validation issues
 */
function zodToJsonSchema(zodSchema) {
  if (!zodSchema || !zodSchema._def) {
    throw new Error('Invalid Zod schema - missing _def property');
  }

  const def = zodSchema._def;
  
  if (def.typeName === 'ZodObject') {
    const properties = {};
    const required = [];
    const shape = def.shape();
    
    for (const [key, value] of Object.entries(shape)) {
      if (value && value._def) {
        properties[key] = convertZodType(value);
        if (!value.isOptional()) {
          required.push(key);
        }
      }
    }
    
    return {
      type: 'object',
      properties,
      required: required.length > 0 ? required : undefined,
      additionalProperties: true // for .passthrough()
    };
  }
  
  return convertZodType(zodSchema);
}

/**
 * Convert individual Zod types to JSON Schema
 */
function convertZodType(zodType) {
  if (!zodType || !zodType._def) {
    return { type: 'string' }; // fallback
  }

  const def = zodType._def;
  
  switch (def.typeName) {
    case 'ZodString':
      return {
        type: 'string',
        description: def.description
      };
      
    case 'ZodNumber':
      return {
        type: 'number',
        description: def.description,
        minimum: def.checks?.find(c => c.kind === 'min')?.value,
        maximum: def.checks?.find(c => c.kind === 'max')?.value
      };
      
    case 'ZodBoolean':
      return {
        type: 'boolean',
        description: def.description
      };
      
    case 'ZodArray':
      return {
        type: 'array',
        items: convertZodType(def.type),
        description: def.description
      };
      
    case 'ZodOptional':
      return convertZodType(def.innerType);
      
    case 'ZodDefault':
      const result = convertZodType(def.innerType);
      result.default = def.defaultValue();
      return result;
      
    default:
      return {
        type: 'string',
        description: def.description
      };
  }
}
const { registerManagementTools, getManagementToolNames } = require('./management_tools');
const managementToolsModule = require('./management_tools');
const { registerAllResources, getResourceCounts } = require('./resource_manager');
const { z } = require('zod');

/**
 * Global registry instance (singleton pattern for security)
 */
let globalRegistry = null;
let registrationInProgress = false;
let registrationComplete = false;

/**
 * Initialize the registry system
 */
async function initializeRegistry() {
  if (!globalRegistry) {
    globalRegistry = new CoreRegistry();
    await globalRegistry.initializeDB();
    console.log('[Registry] Global registry initialized');
  }
  return globalRegistry;
}

/**
 * Main tool registration function - replaces old registerAllTools
 * 
 * ARCHITECTURAL FIX: Implements comprehensive deduplication to prevent
 * the catastrophic tool registration issues identified in forensic analysis.
 */
async function registerAllTools(server) {
  // DEDUPLICATION GUARD: Prevent multiple concurrent registrations
  if (registrationInProgress) {
    console.log('[Registry] ⚠️  Registration already in progress, waiting...');
    while (registrationInProgress) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    console.log('[Registry] ✅ Using existing registration results');
    return globalRegistry ? { registry: globalRegistry, summary: globalRegistry.getToolCounts() } : null;
  }

  // DEDUPLICATION GUARD: Prevent re-registration if already complete
  if (registrationComplete && globalRegistry) {
    console.log('[Registry] ✅ Tools already registered, returning existing registry');
    return { registry: globalRegistry, summary: globalRegistry.getToolCounts() };
  }

  registrationInProgress = true;
  
  try {
    console.log('[Registry] ========================================');
    console.log('[Registry] 🚀 MCP Open Discovery Tool Registration');
    console.log('[Registry] ========================================');

    // Initialize the core registry
    const registry = await initializeRegistry();

    // Define tool modules in organized structure
    const toolModules = [
      { 
        name: 'network_tools_sdk', 
        category: 'network',
        loader: () => require('../network_tools_sdk')
      },
      { 
        name: 'memory_tools_sdk', 
        category: 'memory',
        loader: () => require('../memory_tools_sdk') 
      },
      { 
        name: 'nmap_tools_sdk', 
        category: 'nmap',
        loader: () => require('../nmap_tools_sdk')
      },
      { 
        name: 'proxmox_tools_sdk', 
        category: 'proxmox',
        loader: () => require('../proxmox_tools_sdk')
      },
      { 
        name: 'snmp_tools_sdk', 
        category: 'snmp', 
        loader: () => require('../snmp_tools_sdk')
      },
      { 
        name: 'zabbix_tools_sdk', 
        category: 'zabbix',
        loader: () => require('../zabbix_tools_sdk')
      },
      { 
        name: 'credentials_tools_sdk', 
        category: 'credentials',
        loader: () => require('../credentials_tools_sdk')
      }
    ];

    // Register each tool module
    for (const moduleConfig of toolModules) {
      await registerToolModule(server, registry, moduleConfig);
    }

    // Register management tools (registry control)
    await registerManagementModule(server, registry);

    // Complete registration summary
    const summary = registry.getToolCounts();
    console.log('[Registry] Tool Registration Complete!');
    console.log(JSON.stringify({
      summary: { 
        total: summary.total, 
        modules: toolModules.length + 1, // +1 for management tools
        categories: Object.keys(summary.categories).length + 1 // +1 for registry
      },
      categories: { ...summary.categories, registry: getManagementToolNames().length },
      modules: await getModuleDetails(registry),
      timestamp: new Date().toISOString(),
      database: registry.dbInitialized ? {
        enabled: true,
        stats: await registry.getAnalytics()
      } : { enabled: false }
    }, null, 2));

    console.log(`[Registry] 🔥 Hot-reload Status: ${JSON.stringify(registry.getStatus().hot_reload)}`);
    
    // Mark registration as complete
    registrationComplete = true;
    registrationInProgress = false;
    
    console.log('[Registry] 🛡️  ARCHITECTURAL FIX: Deduplication guards active');
    
    return { registry, summary };
  } catch (error) {
    registrationInProgress = false; // Reset on error
    console.error('[Registry] Tool registration failed:', error.message);
    console.error('[Registry] Stack trace:', error.stack);
    throw error;
  }
}

// JSON Schema to Zod conversion system REMOVED
// All tools must now use native Zod schemas for consistency and reliability

/**
 * Register a single tool module with the registry
 */
async function registerToolModule(server, registry, moduleConfig) {
  try {
    console.log(`[Registry] Starting registration for ${moduleConfig.name} (${moduleConfig.category})`);
    
    // Load the module
    const moduleExports = moduleConfig.loader();
    const { tools, handleToolCall } = moduleExports;
    
    if (!tools || !Array.isArray(tools)) {
      throw new Error(`Module ${moduleConfig.name} does not export tools array`);
    }

    // Start module tracking
    registry.startModule(moduleConfig.name, moduleConfig.category);

    // Register each tool using the modern MCP SDK registerTool API
    for (const tool of tools) {
      // Convert Zod schema to JSON Schema for MCP SDK compatibility
      let inputSchema;
      if (tool.inputSchema && typeof tool.inputSchema === 'object' && tool.inputSchema._def) {
        try {
          // Convert Zod to JSON Schema to ensure MCP compliance
          inputSchema = zodToJsonSchema(tool.inputSchema);
        } catch (error) {
          console.error(`[Registry] Failed to convert Zod schema for ${tool.name}:`, error);
          throw new Error(`Tool ${tool.name} in module ${moduleConfig.name} has invalid Zod schema: ${error.message}`);
        }
      } else {
        throw new Error(`Tool ${tool.name} in module ${moduleConfig.name} must have a valid Zod schema`);
      }
      
      const toolConfig = {
        description: tool.description,
        inputSchema: inputSchema  // JSON Schema for MCP SDK compatibility
      };
      
      // All tools must use centralized handleToolCall function (standardized pattern)
      if (!handleToolCall || typeof handleToolCall !== 'function') {
        throw new Error(`Module ${moduleConfig.name} must export a handleToolCall function`);
      }
      
      // Use centralized handleToolCall function
      const toolHandler = async (args) => await handleToolCall(tool.name, args);
      
      server.registerTool(tool.name, toolConfig, toolHandler);
      registry.registerTool(tool.name, server);
    }

    // Complete module registration
    await registry.completeModule();
    
    console.log(`[Registry] Registered ${tools.length} ${moduleConfig.category} tools`);
    
  } catch (error) {
    console.error(`[Registry] Failed to register ${moduleConfig.name}:`, error.message);
    throw error;
  }
}

/**
 * Register registry management tools
 */
async function registerManagementModule(server, registry) {
  try {
    console.log('[Registry] Starting registration for registry_management (registry)');
    
    // Store global references for management tools
    global.mcpCoreRegistry = registry;
    global.mcpServerInstance = server;
    
    // Register management tools using the same pattern as other modules
    const managementModuleConfig = {
      name: 'registry_management',
      category: 'registry',
      loader: () => managementToolsModule
    };
    
    await registerToolModule(server, registry, managementModuleConfig);
    
  } catch (error) {
    console.error('[Registry] Failed to register management tools:', error.message);
    throw error;
  }
}

/**
 * Get detailed module information
 */
async function getModuleDetails(registry) {
  const status = registry.getStatus();
  const details = {};
  
  for (const [moduleName, moduleInfo] of Object.entries(status.modules)) {
    details[moduleName] = {
      category: moduleInfo.category,
      tools: moduleInfo.tools,
      active: moduleInfo.active,
      loadedAt: moduleInfo.loaded_at,
      loadDuration: moduleInfo.duration
    };
  }
  
  return details;
}

/**
 * Get tool counts (compatible with old API)
 */
function getToolCounts() {
  if (!globalRegistry) {
    return { total: 0, categories: {} };
  }
  return globalRegistry.getToolCounts();
}

/**
 * Cleanup registry resources
 */
async function cleanup() {
  if (globalRegistry) {
    await globalRegistry.cleanup();
    globalRegistry = null;
    
    // Reset deduplication guards
    registrationInProgress = false;
    registrationComplete = false;
    
    console.log('[Registry] Registry cleanup completed (deduplication guards reset)');
  }
}

/**
 * Get registry instance (for debugging/management)
 */
function getRegistryInstance() {
  return globalRegistry;
}

module.exports = {
  registerAllTools,
  getToolCounts,
  cleanup,
  initializeRegistry,
  getRegistryInstance,
  registerAllResources,
  getResourceCounts
};
