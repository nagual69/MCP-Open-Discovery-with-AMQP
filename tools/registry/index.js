/**
 * Tool Registry Index - MCP Types Integration v3.0
 * 
 * Enhanced implementation using mcp-types for guaranteed specification compliance
 * while maintaining ALL original features and functionality:
 * - Uses mcp-types package for spec-compliant schemas
 * - Maintains Zod schemas for developer experience and runtime validation
 * - Keeps all original registry, validation, and hot-reload features
 * - Clean adapter pattern eliminates conversion issues
 * - No more "keyValidator._parse is not a function" errors
 * 
 * Based on MCP Schema 2025-06-18 specification + mcp-types integration
 */

const { adaptToolToMCPTypes, createParameterValidator, jsonSchemaToZodShape, getZodRawShape, isZodSchema, isJsonSchema } = require('./mcp_types_adapter');
const { CoreRegistry } = require('./core_registry');
const { HotReloadManager } = require('./hot_reload_manager');
const { ToolValidationManager } = require('./tool_validation_manager');
const { registerAllResources, getResourceCounts } = require('./resource_manager');
const path = require('path');
const { PluginManager } = require('./plugin_manager');

// Global container for cross-module singletons (prevents duplicate instances)
const GLOBAL_KEY = '__MCP_OPEN_DISCOVERY__';
const g = globalThis || global;
g[GLOBAL_KEY] = g[GLOBAL_KEY] || {};

// Registry singleton instances - with global fallbacks
let registryInstance = g[GLOBAL_KEY].registryInstance || null;
let hotReloadManager = g[GLOBAL_KEY].hotReloadManager || null;
let validationManager = g[GLOBAL_KEY].validationManager || null;
let registrationInProgress = false;
let registrationComplete = false;
let serverInstance = g[GLOBAL_KEY].serverInstance || null; // MCP server reference for dynamic operations
let pluginManager = g[GLOBAL_KEY].pluginManager || null;  // Optional plugin manager

function _saveGlobals() {
  g[GLOBAL_KEY].registryInstance = registryInstance;
  g[GLOBAL_KEY].hotReloadManager = hotReloadManager;
  g[GLOBAL_KEY].validationManager = validationManager;
  g[GLOBAL_KEY].serverInstance = serverInstance;
  g[GLOBAL_KEY].pluginManager = pluginManager;
}

/**
 * Register a single tool with MCP server using mcp-types integration
 * 
 * Enhanced version that uses mcp-types for spec compliance while maintaining
 * all original functionality and error handling.
 * 
 * @param {Object} server - MCP server instance
 * @param {Object} tool - Tool definition with name, description, inputSchema
 * @param {Function} handleToolCall - Tool execution handler
 */
function registerMCPTool(server, tool, handleToolCall) {
  try {
    console.log(`[Registry] Registering tool with mcp-types: ${tool.name}`);
    
    // Step 1: Build a Zod raw shape for input schema so SDK can validate/parse
    let zodRawShape;
    if (isZodSchema(tool.inputSchema)) {
      zodRawShape = getZodRawShape(tool.inputSchema);
    } else if (isJsonSchema(tool.inputSchema)) {
      zodRawShape = jsonSchemaToZodShape(tool.inputSchema);
    }

    // Fallback to empty shape if none
    if (!zodRawShape) {
      zodRawShape = {};
    }

    // Step 2: Create parameter validator for extra safety/logging
    const validateParams = createParameterValidator(isZodSchema(tool.inputSchema) ? tool.inputSchema : undefined);

    // Step 3: Create execution handler that receives parsed args from SDK
    const mcpHandler = async (parsedArgsOrExtra, maybeExtra) => {
      try {
        const hasArgs = zodRawShape && Object.keys(zodRawShape).length > 0;
        const args = hasArgs ? parsedArgsOrExtra : {};
        if (validateParams && hasArgs) {
          const validation = validateParams(args);
          if (!validation.success) {
            return {
              content: [{ type: 'text', text: `Parameter validation error: ${JSON.stringify(validation.error, null, 2)}` }],
              isError: true
            };
          }
        }

        // Execute tool with parsed args
        const result = await handleToolCall(tool.name, args);
        
        // Ensure result follows MCP CallToolResult interface (PRESERVED LOGIC)
        if (result && typeof result === 'object') {
          // If result already has content array, return as-is
          if (Array.isArray(result.content)) {
            return result;
          }
          
          // If result is a simple object, wrap it in content array
          return {
            content: [
              {
                type: "text",
                text: typeof result === 'string' ? result : JSON.stringify(result, null, 2)
              }
            ],
            isError: false
          };
        }
        
        // Handle string results
        if (typeof result === 'string') {
          return {
            content: [
              {
                type: "text",
                text: result
              }
            ],
            isError: false
          };
        }
        
        // Fallback for unexpected result types
        return {
          content: [
            {
              type: "text",
              text: "Tool executed successfully"
            }
          ],
          isError: false
        };
        
      } catch (error) {
        console.error(`[MCP Tool] ${tool.name} execution failed:`, error.message);
        
        // Return MCP-compliant error result
        return {
          content: [
            {
              type: "text",
              text: `Error: ${error.message}`
            }
          ],
          isError: true
        };
      }
    };

    // Register with SDK using Zod raw shape so SDK validates and passes args
    const registerConfig = {
      title: tool.title,
      description: tool.description,
      inputSchema: zodRawShape,
      // Note: outputSchema optional; keeping runtime validation in handler if needed
      annotations: tool.annotations,
    };
  server.registerTool(tool.name, registerConfig, mcpHandler);
    console.log(`[Registry] ✅ Registered MCP tool: ${tool.name} via SDK.registerTool`);
    return true;
    
  } catch (error) {
    console.error(`[Registry] ❌ Failed to register tool ${tool.name}:`, error.message);
    return false;
  }
}

/**
 * Dynamic: Load a module at runtime and register its tools via MCP SDK
 * @param {Object} options - { modulePath, moduleName, category, exportName }
 * @returns {Promise<Object>} Result summary
 */
async function dynamicLoadModule(options = {}) {
  const srv = getServerInstance();
  if (!srv) {
    throw new Error('Server instance not available for dynamic load');
  }
  const registry = getRegistry();
  const { modulePath, moduleName, category = 'Custom', exportName } = options;
  if (!modulePath || !moduleName) {
    throw new Error('modulePath and moduleName are required');
  }
  // Resolve path: allow relative to project root or tools directory
  let absPath = modulePath;
  if (!path.isAbsolute(absPath)) {
    const candidate1 = path.resolve(modulePath);
    const candidate2 = path.resolve(__dirname, '..', modulePath);
    try {
      absPath = require.resolve(candidate1);
    } catch {
      try {
        absPath = require.resolve(candidate2);
      } catch {
        absPath = candidate1; // fallback; require will throw later if invalid
      }
    }
  }

  // Load module fresh
  delete require.cache[require.resolve(absPath)];
  let mod = require(absPath);
  if (exportName) {
    if (!mod[exportName]) throw new Error(`Export '${exportName}' not found in module`);
    mod = mod[exportName];
  }
  if (!mod || !Array.isArray(mod.tools) || typeof mod.handleToolCall !== 'function') {
    throw new Error('Invalid module: requires tools[] and handleToolCall()');
  }

  // Track and register tools
  registry.startModule(moduleName, category);
  let registered = 0;
  for (const tool of mod.tools) {
    const ok = registerMCPTool(srv, tool, mod.handleToolCall);
    if (ok) {
      registry.registerTool(tool.name);
      registered++;
    }
  }
  await registry.completeModule();

  // Watch for hot-reload
  if (hotReloadManager) {
    hotReloadManager.watchModule(moduleName, absPath);
  }

  return {
    success: true,
    module: moduleName,
    category,
    filePath: absPath,
    tools: registered
  };
}

/**
 * Dynamic: Attempt to unload a module at runtime.
 * Note: SDK may not support unregistration; we stop watchers and mark module inactive.
 * @param {string} moduleName
 */
async function dynamicUnloadModule(moduleName) {
  if (!moduleName) throw new Error('moduleName is required');
  const registry = getRegistry();
  const moduleInfo = registry.modules.get(moduleName);
  if (!moduleInfo) {
    return { success: false, error: `Module not found: ${moduleName}` };
  }

  // Stop watcher (paths retained for potential restore)
  if (hotReloadManager) {
    hotReloadManager.stopWatching(moduleName);
  }

  // Mark inactive (tools remain registered in SDK if no API to unregister)
  moduleInfo.active = false;

  // Best-effort SDK unregistration (if available)
  let unregistered = 0;
  let unsupported = false;
  const srv = getServerInstance();
  if (srv && typeof srv.unregisterTool === 'function') {
    for (const name of moduleInfo.tools) {
      try {
        await srv.unregisterTool(name);
        unregistered++;
      } catch (e) {
        // Continue on individual failures
      }
    }
  } else {
    unsupported = true;
  }

  return {
    success: unsupported ? true : unregistered === moduleInfo.tools.length,
    module: moduleName,
    toolsAttempted: moduleInfo.tools.length,
    toolsUnregistered: unregistered,
    sdkUnregisterSupported: !unsupported,
    warning: unsupported ? 'SDK unregister not available; tools remain registered but module marked inactive' : undefined
  };
}

/**
 * Dynamic: Re-register tools for a module after a hot reload to refresh handlers
 * @param {string} moduleName
 */
async function reregisterModuleTools(moduleName) {
  const srv = getServerInstance();
  if (!srv) throw new Error('Server instance not available');
  let filePath = hotReloadManager && hotReloadManager.moduleFilePaths.get(moduleName);
  if (!filePath) {
    // Fallback: attempt to resolve module path and seed mapping
    try {
      filePath = require.resolve(`../${moduleName}`);
    } catch (e1) {
      try {
        filePath = require.resolve(`./${moduleName}`);
      } catch (e2) {
        throw new Error(`Module file path not known and cannot resolve: ${moduleName}`);
      }
    }
    if (hotReloadManager && filePath) {
      hotReloadManager.moduleFilePaths.set(moduleName, filePath);
    }
  }

  // Require current code
  delete require.cache[require.resolve(filePath)];
  const mod = require(filePath);
  if (!mod || !Array.isArray(mod.tools) || typeof mod.handleToolCall !== 'function') {
    throw new Error('Reloaded module invalid structure');
  }
  let updated = 0, failed = 0;
  for (const tool of mod.tools) {
    try {
      const ok = registerMCPTool(srv, tool, mod.handleToolCall);
      if (ok) updated++; else failed++;
    } catch (e) {
      failed++;
    }
  }
  return { success: failed === 0, module: moduleName, updated, failed };
}

/**
 * Get or create the registry singleton - PRESERVED FROM ORIGINAL
 * @returns {CoreRegistry}
 */
function getRegistry() {
  if (!registryInstance) {
    registryInstance = new CoreRegistry();
    
    // Initialize companion managers
    if (!hotReloadManager) {
      hotReloadManager = new HotReloadManager(registryInstance);
      hotReloadManager.enable(); // Enable hot-reload by default
    }
    
    if (!validationManager) {
      validationManager = new ToolValidationManager();
    }
  _saveGlobals();
  }
  return registryInstance;
}

/**
 * Get the hot-reload manager - PRESERVED FROM ORIGINAL
 * @returns {HotReloadManager}
 */
function getHotReloadManager() {
  getRegistry(); // Ensure registry is initialized
  return hotReloadManager;
}

/**
 * Get the validation manager - PRESERVED FROM ORIGINAL
 * @returns {ToolValidationManager}
 */
function getValidationManager() {
  getRegistry(); // Ensure registry is initialized
  return validationManager;
}

/**
 * Main tool registration function - Enhanced with mcp-types integration
 * 
 * PRESERVES ALL ORIGINAL FUNCTIONALITY while adding mcp-types compliance:
 * 1. Load tool modules
 * 2. Validate tool definitions  
 * 3. Register tools using mcp-types adapter
 * 4. Track registration in internal registry
 * 5. Set up hot-reload watching
 * 
 * @param {Object} server - MCP server instance
 * @returns {Promise<Object>} Registration results
 */
async function registerAllTools(server) {
  // Prevent multiple concurrent registrations - PRESERVED FROM ORIGINAL
  if (registrationInProgress) {
    console.log('[Registry] ⚠️  Registration already in progress, waiting...');
    while (registrationInProgress) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    return _getRegistrationResults();
  }

  // Return existing results if already complete - PRESERVED FROM ORIGINAL
  if (registrationComplete && registryInstance) {
    console.log('[Registry] ✅ Tools already registered, returning existing results');
    return _getRegistrationResults();
  }

  registrationInProgress = true;
  
  try {
    console.log('[Registry] ========================================');
    console.log('[Registry] 🚀 MCP Open Discovery v3.0 - mcp-types Integration');
    console.log('[Registry] 📋 MCP Schema Specification: 2025-06-18');
    console.log('[Registry] ========================================');
    
  const registry = getRegistry();
  serverInstance = server; // store for dynamic operations
    // expose globally for cross-module access
    try { g[GLOBAL_KEY].serverInstance = server; } catch {}
    const validator = getValidationManager();
    
    // Initialize the registry - PRESERVED FROM ORIGINAL
    await registry.initialize();
    
    // Define tool modules with clean structure - PRESERVED FROM ORIGINAL
    const toolModules = [
      { 
        name: 'memory_tools_sdk',
        category: 'Memory',
        requiresInit: true
      },
      { 
        name: 'network_tools_sdk',
        category: 'Network'
      },
      { 
        name: 'nmap_tools_sdk',
        category: 'NMAP'
      },
      { 
        name: 'proxmox_tools_sdk',
        category: 'Proxmox'
      },
      { 
        name: 'snmp_tools_sdk',
        category: 'SNMP'
      },
      { 
        name: 'zabbix_tools_sdk',
        category: 'Zabbix'
      },
      { 
        name: 'test_simple_sdk',
        category: 'Test'
      },
      { 
        name: 'test_raw_schema_sdk',
        category: 'Test'
      },
      { 
        name: 'debug_validation_sdk',
        category: 'Debug'
      },
      { 
        name: 'credentials_tools_sdk',
        category: 'Credentials'
      },
      { 
        name: 'registry_tools_sdk',
        category: 'Registry'
      }
    ];

    let totalTools = 0;
    const results = {};

    // Process each module - PRESERVED LOGIC FROM ORIGINAL
    for (const moduleConfig of toolModules) {
      try {
        console.log(`[Registry] 🔄 Processing ${moduleConfig.name}...`);
        
        // Load the module
        const module = require(`../${moduleConfig.name}`);
        
        // Special initialization for modules that need it - PRESERVED FROM ORIGINAL
        if (moduleConfig.requiresInit && module.initialize) {
          console.log(`[Registry] 🔄 Initializing ${moduleConfig.name}...`);
          await module.initialize();
        }
        
        // Validate module structure - PRESERVED FROM ORIGINAL
        if (!module.tools || !Array.isArray(module.tools)) {
          console.warn(`[Registry] ⚠️  Module ${moduleConfig.name} has no tools array`);
          results[moduleConfig.category] = 0;
          continue;
        }
        
        if (!module.handleToolCall || typeof module.handleToolCall !== 'function') {
          console.warn(`[Registry] ⚠️  Module ${moduleConfig.name} has no handleToolCall function`);
          results[moduleConfig.category] = 0;
          continue;
        }
        
        // Start module registration tracking - PRESERVED FROM ORIGINAL
        registry.startModule(moduleConfig.name, moduleConfig.category);
        
        let registeredCount = 0;
        
        // Register each tool using enhanced MCP interface
        for (const tool of module.tools) {
          // Validate tool definition - PRESERVED FROM ORIGINAL
          if (!tool.name || typeof tool.name !== 'string') {
            console.warn(`[Registry] ⚠️  Invalid tool name in ${moduleConfig.name}`);
            continue;
          }
          
          // Register tool with MCP server using mcp-types adapter
          const success = registerMCPTool(server, tool, module.handleToolCall);
          
          if (success) {
            // Track in internal registry - PRESERVED FROM ORIGINAL
            registry.registerTool(tool.name);
            registeredCount++;
            totalTools++;
          }
        }
        
        results[moduleConfig.category] = registeredCount;
        console.log(`[Registry] ✅ Registered ${registeredCount}/${module.tools.length} ${moduleConfig.category} tools`);
        
        // Complete module registration - PRESERVED FROM ORIGINAL
        await registry.completeModule();
        
        // Set up hot-reload watching - PRESERVED FROM ORIGINAL
  if (hotReloadManager) {
          const filePath = require.resolve(`../${moduleConfig.name}`);
          hotReloadManager.watchModule(moduleConfig.name, filePath);
        }
        
      } catch (error) {
        console.error(`[Registry] ❌ Failed to process ${moduleConfig.name}:`, error.message);
        results[moduleConfig.category] = `Error: ${error.message}`;
      }
    }

    // Mark registration as complete - PRESERVED FROM ORIGINAL
  registrationComplete = true;
    registrationInProgress = false;
    
    console.log('[Registry] ========================================');
    console.log(`[Registry] ✅ Registration Complete: ${totalTools} tools`);
    console.log('[Registry] 📊 Using mcp-types for spec compliance');
    console.log('[Registry] ========================================');
    
  return {
      success: true,
      source: 'mcp_types_integration_v3',
      registry: registry,
      summary: registry.getStats(),
      modules: toolModules.length,
      tools: totalTools,
      categories: results
    };
    
  } catch (error) {
    registrationInProgress = false;
    console.error('[Registry] ❌ Tool registration failed:', error.message);
    throw error;
  }
}

/**
 * Get current registration results - PRESERVED FROM ORIGINAL
 * @returns {Object} Current registration state
 * @private
 */
function _getRegistrationResults() {
  if (!registryInstance) {
    return { success: false, error: 'Registry not initialized' };
  }
  
  return {
    success: true,
    registry: registryInstance,
    summary: registryInstance.getStats(),
    validation: validationManager ? validationManager.getValidationSummary() : null,
    hotReload: hotReloadManager ? hotReloadManager.getStatus() : null
  };
}

/**
 * Get registry instance (for external access) - PRESERVED FROM ORIGINAL
 * @returns {CoreRegistry|null}
 */
function getRegistryInstance() {
  return registryInstance || g[GLOBAL_KEY].registryInstance || null;
}

/**
 * Cleanup and shutdown - PRESERVED FROM ORIGINAL
 * @returns {Promise<void>}
 */
async function cleanup() {
  console.log('[Registry] 🧹 Starting cleanup...');
  
  if (hotReloadManager) {
    hotReloadManager.cleanup();
  }
  
  if (validationManager) {
    validationManager.clearResults();
  }
  
  if (registryInstance) {
    await registryInstance.cleanup();
  }
  
  registryInstance = null;
  hotReloadManager = null;
  validationManager = null;
  registrationInProgress = false;
  registrationComplete = false;
  
  console.log('[Registry] ✅ Cleanup complete');
}

// DUPLICATE EXPORTS COMMENTED OUT - USING FINAL EXPORT BELOW
/*
module.exports = {
  registerAllTools,
  registerAllResources,
  getResourceCounts,
  getRegistry,
  getHotReloadManager,
  getValidationManager,
  getRegistryInstance,
  cleanup
};
*/

/**
 * Get or create the registry singleton - PRESERVED FROM ORIGINAL
 * @returns {CoreRegistry}
 */
function getRegistry() {
  if (!registryInstance) {
    registryInstance = new CoreRegistry();
    
    // Initialize companion managers
    if (!hotReloadManager) {
      hotReloadManager = new HotReloadManager(registryInstance);
      hotReloadManager.enable(); // Enable hot-reload by default
    }
    
    if (!validationManager) {
      validationManager = new ToolValidationManager();
    }
  }
  return registryInstance;
}

/**
 * Get the hot-reload manager
 * @returns {HotReloadManager}
 */
function getHotReloadManager() {
  getRegistry(); // Ensure registry is initialized
  return hotReloadManager;
}

/**
 * Get the validation manager
 * @returns {ToolValidationManager}
 */
function getValidationManager() {
  getRegistry(); // Ensure registry is initialized
  return validationManager;
}

/**
 * Main tool registration function - MCP SDK compliant
 * 
 * Implements clean, specification-based tool registration:
 * 1. Load tool modules
 * 2. Validate tool definitions
 * 3. Register tools using standard MCP interface
 * 4. Track registration in internal registry
 * 
 * @param {Object} server - MCP server instance
 * @returns {Promise<Object>} Registration results
 */
async function registerAllTools(server) {
  // Prevent multiple concurrent registrations
  if (registrationInProgress) {
    console.log('[Registry] ⚠️  Registration already in progress, waiting...');
    while (registrationInProgress) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    return _getRegistrationResults();
  }

  // Return existing results if already complete
  if (registrationComplete && registryInstance) {
    console.log('[Registry] ✅ Tools already registered, returning existing results');
    return _getRegistrationResults();
  }

  registrationInProgress = true;
  
  try {
    console.log('[Registry] ========================================');
    console.log('[Registry] 🚀 MCP Open Discovery v2.0 - Clean Registry');
    console.log('[Registry] 📋 MCP Schema Specification: 2025-06-18');
    console.log('[Registry] ========================================');
    
  const registry = getRegistry();
  serverInstance = server; // store for dynamic operations
    const validator = getValidationManager();
    
    // Initialize the registry
    await registry.initialize();
    
    // Define tool modules with clean structure
    const toolModules = [
      { 
        name: 'memory_tools_sdk',
        category: 'Memory',
        requiresInit: true
      },
      { 
        name: 'network_tools_sdk',
        category: 'Network'
      },
      { 
        name: 'nmap_tools_sdk',
        category: 'NMAP'
      },
      { 
        name: 'proxmox_tools_sdk',
        category: 'Proxmox'
      },
      { 
        name: 'snmp_tools_sdk',
        category: 'SNMP'
      },
      { 
        name: 'zabbix_tools_sdk',
        category: 'Zabbix'
      },
      { 
        name: 'test_simple_sdk',
        category: 'Test'
      },
      { 
        name: 'test_raw_schema_sdk',
        category: 'Test'
      },
      { 
        name: 'debug_validation_sdk',
        category: 'Debug'
      },
      { 
        name: 'credentials_tools_sdk',
        category: 'Credentials'
      },
      { 
        name: 'registry_tools_sdk',
        category: 'Registry'
      }
    ];

    let totalTools = 0;
    const results = {};

    // Process each module
    for (const moduleConfig of toolModules) {
      try {
        console.log(`[Registry] 🔄 Processing ${moduleConfig.name}...`);
        
        // Load the module
        const module = require(`../${moduleConfig.name}`);
        
        // Special initialization for modules that need it
        if (moduleConfig.requiresInit && module.initialize) {
          console.log(`[Registry] � Initializing ${moduleConfig.name}...`);
          await module.initialize();
        }
        
        // Validate module structure
        if (!module.tools || !Array.isArray(module.tools)) {
          console.warn(`[Registry] ⚠️  Module ${moduleConfig.name} has no tools array`);
          results[moduleConfig.category] = 0;
          continue;
        }
        
        if (!module.handleToolCall || typeof module.handleToolCall !== 'function') {
          console.warn(`[Registry] ⚠️  Module ${moduleConfig.name} has no handleToolCall function`);
          results[moduleConfig.category] = 0;
          continue;
        }
        
        // Start module registration tracking
        registry.startModule(moduleConfig.name, moduleConfig.category);
        
        let registeredCount = 0;
        
        // Register each tool using clean MCP interface
        for (const tool of module.tools) {
          // Validate tool definition
          if (!tool.name || typeof tool.name !== 'string') {
            console.warn(`[Registry] ⚠️  Invalid tool name in ${moduleConfig.name}`);
            continue;
          }
          
          // Register tool with MCP server
          const success = registerMCPTool(server, tool, module.handleToolCall);
          
          if (success) {
            // Track in internal registry
            registry.registerTool(tool.name);
            registeredCount++;
            totalTools++;
          }
        }
        
        results[moduleConfig.category] = registeredCount;
        console.log(`[Registry] ✅ Registered ${registeredCount}/${module.tools.length} ${moduleConfig.category} tools`);
        
        // Complete module registration
        await registry.completeModule();
        
        // Set up hot-reload watching
        if (hotReloadManager) {
          const filePath = require.resolve(`../${moduleConfig.name}`);
          hotReloadManager.watchModule(moduleConfig.name, filePath);
        }
        
      } catch (error) {
        console.error(`[Registry] ❌ Failed to process ${moduleConfig.name}:`, error.message);
        results[moduleConfig.category] = `Error: ${error.message}`;
      }
    }

    // Mark registration as complete
    registrationComplete = true;
    registrationInProgress = false;
    
    console.log('[Registry] ========================================');
    console.log(`[Registry] ✅ Registration Complete: ${totalTools} tools`);
    console.log('[Registry] ========================================');
    
    return {
      success: true,
      source: 'mcp_specification_compliant',
      registry: registry,
      summary: registry.getStats(),
      modules: toolModules.length,
      tools: totalTools,
      categories: results
    };
    
  } catch (error) {
    registrationInProgress = false;
    console.error('[Registry] ❌ Tool registration failed:', error.message);
    throw error;
  }
}

/**
 * Get current registration results
 * @returns {Object} Current registration state
 * @private
 */
function _getRegistrationResults() {
  if (!registryInstance) {
    return { success: false, error: 'Registry not initialized' };
  }
  
  return {
    success: true,
    registry: registryInstance,
    summary: registryInstance.getStats(),
    validation: validationManager ? validationManager.getValidationSummary() : null,
    hotReload: hotReloadManager ? hotReloadManager.getStatus() : null
  };
}

/**
 * Get registry instance (for external access)
 * @returns {CoreRegistry|null}
 */
function getRegistryInstance() {
  return registryInstance;
}

/** Get the MCP server instance (if initialized) */
function getServerInstance() {
  return serverInstance;
}

/** Get or create plugin manager */
function getPluginManager() {
  if (!pluginManager) {
    pluginManager = new PluginManager(getRegistry());
  }
  return pluginManager;
}

/**
 * Cleanup and shutdown
 * @returns {Promise<void>}
 */
async function cleanup() {
  console.log('[Registry] 🧹 Starting cleanup...');
  
  if (hotReloadManager) {
    hotReloadManager.cleanup();
  }
  
  if (validationManager) {
    validationManager.clearResults();
  }
  
  if (registryInstance) {
    await registryInstance.cleanup();
  }
  
  registryInstance = null;
  hotReloadManager = null;
  validationManager = null;
  registrationInProgress = false;
  registrationComplete = false;
  
  console.log('[Registry] ✅ Cleanup complete');
}

module.exports = {
  registerAllTools,
  registerAllResources,
  getResourceCounts,
  getRegistry,
  getHotReloadManager,
  getValidationManager,
  getRegistryInstance,
  getServerInstance,
  getPluginManager,
  dynamicLoadModule,
  dynamicUnloadModule,
  reregisterModuleTools,
  registerMCPTool,
  cleanup
};
