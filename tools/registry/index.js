/**
 * Tool Registry Index - MCP Types Integration (Unified)
 * 
 * Single source of truth for registering tools/resources with the MCP server.
 * - Standardizes on server.registerTool and Zod raw shapes
 * - Integrates ToolValidationManager (strict or warn mode)
 * - Wires HotReloadManager reloads → handler re-registration
 * - Exposes dynamic load/unload/re-register helpers
 */

const { adaptToolToMCPTypes, createParameterValidator, jsonSchemaToZodShape, getZodRawShape, isZodSchema, isJsonSchema } = require('./mcp_types_adapter');
const { CoreRegistry } = require('./core_registry');
const { HotReloadManager } = require('./hot_reload_manager');
const { ToolValidationManager } = require('./tool_validation_manager');
const { registerAllResources, getResourceCounts } = require('./resource_manager');
const path = require('path');
const { PluginManager } = require('./plugin_manager');
const { DiscoveryEngine } = require('./discovery_engine');

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
// Track plugin capability snapshots for diffing on hot reload
const pluginCapabilities = new Map(); // pluginId -> { tools:Set, resources:Set, prompts:Set }

const DEBUG_REGISTRY = process.env.DEBUG_REGISTRY === '1' || process.env.DEBUG_REGISTRY === 'true';
const rlog = (...args) => { if (DEBUG_REGISTRY) console.log('[Registry][DEBUG]', ...args); };

function _saveGlobals() {
  g[GLOBAL_KEY].registryInstance = registryInstance;
  g[GLOBAL_KEY].hotReloadManager = hotReloadManager;
  g[GLOBAL_KEY].validationManager = validationManager;
  g[GLOBAL_KEY].serverInstance = serverInstance;
  g[GLOBAL_KEY].pluginManager = pluginManager;
  g[GLOBAL_KEY].pluginCapabilities = pluginCapabilities;
}

// Boot summary (Task9): log key env feature flags once when module loads
if (!g[GLOBAL_KEY]._bootFlagsLogged) {
  g[GLOBAL_KEY]._bootFlagsLogged = true;
  const flags = {
    SCHEMA_PATH: process.env.SCHEMA_PATH || null,
    STRICT_CAPABILITIES: process.env.STRICT_CAPABILITIES || process.env.PLUGIN_STRICT_CAPABILITIES || null,
    PLUGIN_ALLOW_RUNTIME_DEPS: process.env.PLUGIN_ALLOW_RUNTIME_DEPS || null,
    REQUIRE_SIGNATURES: process.env.REQUIRE_SIGNATURES || null,
    PLUGIN_REQUIRE_SIGNED: process.env.PLUGIN_REQUIRE_SIGNED || null
  };
  try {
    console.log('[Registry] Feature Flags:', JSON.stringify(flags));
  } catch {}
}

/**
 * Explicit test/helper injection to set the server instance safely.
 * Prefer this over mutating globals directly in tests.
 * @param {Object} server
 */
function setServerInstance(server) {
  serverInstance = server;
  _saveGlobals();
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
  console.log(`[Registry] Registering tool: ${tool.name}`);
    
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
 */
async function dynamicLoadModule(options = {}) {
  const srv = getServerInstance();
  if (!srv) {
    throw new Error('Server instance not available for dynamic load');
  }
  const registry = getRegistry();
  const validator = getValidationManager();
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
  // Validate batch before registering (align with main registration flow)
  try {
    if (validator && Array.isArray(mod.tools)) {
      const batch = validator.validateToolBatch(mod.tools, moduleName);
      rlog('Dynamic load validation summary:', batch.summary);
    }
  } catch {}
  let registered = 0;
  for (const tool of mod.tools) {
    // If validator present, skip invalid tools in strict mode
    if (validator) {
      const v = validator.getValidationResult(tool.name) || { valid: true, errors: [] };
      if (!v.valid && validator.config?.strictMode) {
        console.error(`[Registry] ❌ Skipping invalid tool (strict): ${tool.name}`, v.errors);
        continue;
      } else if (!v.valid) {
        console.warn(`[Registry] ⚠️  Registering tool with warnings: ${tool.name}`);
      }
    }
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
  // Validate batch before re-registering (best effort)
  const validator = getValidationManager();
  try {
    if (validator && Array.isArray(mod.tools)) {
      const batch = validator.validateToolBatch(mod.tools, moduleName);
      rlog('Re-register validation summary:', batch.summary);
    }
  } catch {}
  let updated = 0, failed = 0;
  for (const tool of mod.tools) {
    try {
      if (validator) {
        const v = validator.getValidationResult(tool.name) || { valid: true, errors: [] };
        if (!v.valid && validator.config?.strictMode) {
          console.error(`[Registry] ❌ Skipping invalid tool on re-register (strict): ${tool.name}`, v.errors);
          failed++;
          continue;
        }
      }
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
      // Bind reloads → re-register tool handlers via callback
      hotReloadManager.setAfterReloadCallback(async (moduleName, res) => {
        if (res && res.success) {
          try {
            const rr = await reregisterModuleTools(moduleName);
            rlog('Re-registered tools after reload:', rr);
          } catch (e) {
            console.warn('[Registry] Re-register after reload failed:', e.message);
          }
        }
      });
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
async function registerAllTools(server, options = {}) {
  const { useDiscovery = (process.env.REGISTRY_USE_DISCOVERY === '1' || process.env.REGISTRY_USE_DISCOVERY === 'true') } = options;
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
    console.log('[Registry] 🚀 MCP Open Discovery - Registry Initialization');
    console.log('[Registry] 📋 MCP Schema Specification: 2025-06-18');
    console.log('[Registry] ========================================');
    
    const registry = getRegistry();
    serverInstance = server; // store for dynamic operations
    try { g[GLOBAL_KEY].serverInstance = server; } catch {}
    const validator = getValidationManager();
    
    // Initialize the registry
    await registry.initialize();
    
    let toolModules;
    if (useDiscovery) {
      console.log('[Registry] 🔍 Using DiscoveryEngine to find modules...');
      const de = new DiscoveryEngine();
      const discovered = await de.discoverToolModules();
      toolModules = discovered.map(m => ({ name: m.name, category: m.category }));
      console.log(`[Registry] 🔍 Discovery found ${toolModules.length} modules`);
    } else {
      toolModules = [
        { name: 'memory_tools_sdk', category: 'Memory', requiresInit: true },
        { name: 'network_tools_sdk', category: 'Network' },
        { name: 'nmap_tools_sdk', category: 'NMAP' },
        { name: 'proxmox_tools_sdk', category: 'Proxmox' },
        { name: 'snmp_tools_sdk', category: 'SNMP' },
        { name: 'zabbix_tools_sdk', category: 'Zabbix' },
        { name: 'marketplace_tools_sdk', category: 'Marketplace' },
        { name: 'debug_validation_sdk', category: 'Debug' },
        { name: 'credentials_tools_sdk', category: 'Credentials' },
        { name: 'registry_tools_sdk', category: 'Registry' }
      ];
    }

    let totalTools = 0;
    const results = {};

    for (const moduleConfig of toolModules) {
      try {
        console.log(`[Registry] 🔄 Processing ${moduleConfig.name}...`);
        const mod = require(`../${moduleConfig.name}`);
        if (mod.initialize) {
          console.log(`[Registry] 🔧 Initializing ${moduleConfig.name}...`);
          await mod.initialize();
        }
        if (!mod.tools || !Array.isArray(mod.tools)) {
          console.warn(`[Registry] ⚠️  Module ${moduleConfig.name} has no tools array`);
          results[moduleConfig.category] = 0;
          continue;
        }
        if (!mod.handleToolCall || typeof mod.handleToolCall !== 'function') {
          console.warn(`[Registry] ⚠️  Module ${moduleConfig.name} has no handleToolCall function`);
          results[moduleConfig.category] = 0;
          continue;
        }

        registry.startModule(moduleConfig.name, moduleConfig.category);
        let registeredCount = 0;

        // Validate batch before registering
        const batch = validationManager.validateToolBatch(mod.tools, moduleConfig.name);
        rlog('Validation batch summary:', batch.summary);

        for (const tool of mod.tools) {
          if (!tool.name || typeof tool.name !== 'string') {
            console.warn(`[Registry] ⚠️  Invalid tool name in ${moduleConfig.name}`);
            continue;
          }
          const v = validationManager.getValidationResult(tool.name) || { valid: true, errors: [] };
          if (!v.valid && validationManager.config.strictMode) {
            console.error(`[Registry] ❌ Skipping invalid tool (strict): ${tool.name}`, v.errors);
            continue;
          } else if (!v.valid) {
            console.warn(`[Registry] ⚠️  Registering tool with warnings: ${tool.name}`);
          }

          const success = registerMCPTool(server, tool, mod.handleToolCall);
          if (success) {
            registry.registerTool(tool.name);
            registeredCount++;
            totalTools++;
          }
        }

        results[moduleConfig.category] = registeredCount;
        console.log(`[Registry] ✅ Registered ${registeredCount}/${mod.tools.length} ${moduleConfig.category} tools`);

        await registry.completeModule();
        if (hotReloadManager) {
          const filePath = require.resolve(`../${moduleConfig.name}`);
          hotReloadManager.watchModule(moduleConfig.name, filePath);
        }

      } catch (error) {
        console.error(`[Registry] ❌ Failed to process ${moduleConfig.name}:`, error.message);
        results[moduleConfig.category] = `Error: ${error.message}`;
      }
    }

    registrationComplete = true;

    // After core modules, attempt to load spec plugins (tools/resources/prompts)
    try {
      const pm = getPluginManager();
      await pm.initialize?.();
      const { loaded, failed } = await pm.loadAllSpecPlugins({ activate: true });
      if (loaded?.length) console.log(`[Registry] 🔌 Loaded ${loaded.length} spec plugin(s)`);
      if (failed?.length) console.warn('[Registry] ⚠️ Plugin load failures:', failed);
      // Boot-time security summary
      try {
        const stats = pm.getStats();
        console.log('[Registry] 🔒 Plugin Security Summary:', JSON.stringify({
          total: stats.total,
          dependencyPolicies: stats.dependencyPolicies,
          signed: stats.signed,
          sandbox: stats.sandbox
        }));
      } catch {}
    } catch (e) {
      console.warn('[Registry] ⚠️ Plugin manager initialization failed:', e.message);
    }
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

// Exports are defined once at the end of the file

/** Cleanup and shutdown */
async function cleanup() {
  console.log('[Registry] 🧹 Starting cleanup...');
  if (hotReloadManager) hotReloadManager.cleanup();
  if (validationManager) validationManager.clearResults();
  if (registryInstance) await registryInstance.cleanup();
  registryInstance = null;
  hotReloadManager = null;
  validationManager = null;
  registrationInProgress = false;
  registrationComplete = false;
  console.log('[Registry] ✅ Cleanup complete');
}

/** Get the MCP server instance (if initialized) */
function getServerInstance() {
  return serverInstance;
}

/** Get or create plugin manager */
function getPluginManager() {
  if (!pluginManager) {
    pluginManager = new PluginManager(getRegistry(), { validationManager: getValidationManager() });
    // Wire plugin events for capability bookkeeping
    try {
      pluginManager.on('pluginLoaded', (p) => {
        if (p.manifest && p.manifest.capabilities) {
          const caps = p.manifest.capabilities;
          const tools = new Set((caps.tools || []).map(t=>t.name));
          const resources = new Set((caps.resources || []).map(r=>r.name));
          const prompts = new Set((caps.prompts || []).map(r=>r.name));
          pluginCapabilities.set(p.id, { tools, resources, prompts });
          const reg = getRegistry();
          reg.registerPluginCapabilities(p.id, { tools: [...tools], resources: [...resources], prompts: [...prompts] });
        }
      });
      // Placeholder for future plugin reload event (if emitted)
      pluginManager.on('pluginReloaded', (p, newManifest) => {
        if (!newManifest || !newManifest.capabilities) return;
        const prev = pluginCapabilities.get(p.id);
        const caps = newManifest.capabilities;
        const newCapNames = {
          tools: (caps.tools||[]).map(t=>t.name),
          resources: (caps.resources||[]).map(r=>r.name),
          prompts: (caps.prompts||[]).map(r=>r.name)
        };
        const diff = diffPluginCapabilities(p.id, newCapNames);
        pluginCapabilities.set(p.id, {
          tools: new Set(newCapNames.tools),
          resources: new Set(newCapNames.resources),
          prompts: new Set(newCapNames.prompts)
        });
  applyPluginCapabilityDiff(p.id, diff);
      });
    } catch {}
  }
  return pluginManager;
}

/**
 * Compute diff of plugin capabilities after a reload (placeholder for future hot reload integration)
 * @param {string} pluginId
 * @param {{tools:string[],resources:string[],prompts:string[]}} newCaps
 */
function diffPluginCapabilities(pluginId, newCaps) {
  const prev = pluginCapabilities.get(pluginId) || { tools:new Set(), resources:new Set(), prompts:new Set() };
  const toSet = (arr=[]) => new Set(arr);
  const next = { tools: toSet(newCaps.tools), resources: toSet(newCaps.resources), prompts: toSet(newCaps.prompts) };
  const diff = (prevSet, nextSet) => ({ added:[...nextSet].filter(x=>!prevSet.has(x)), removed:[...prevSet].filter(x=>!nextSet.has(x)) });
  return { tools: diff(prev.tools, next.tools), resources: diff(prev.resources, next.resources), prompts: diff(prev.prompts, next.prompts) };
}

/**
 * Apply capability diff: unregister removed items from server (if supported) and internal registry.
 * @param {string} pluginId
 * @param {{tools:{added:string[],removed:string[]},resources:{added:string[],removed:string[]},prompts:{added:string[],removed:string[]}}} diff
 */
async function applyPluginCapabilityDiff(pluginId, diff) {
  const srv = getServerInstance();
  const reg = getRegistry();
  const results = { pluginId, removed: { tools:[], resources:[], prompts:[] }, errors: [] };
  // Tools
  for (const t of diff.tools.removed) {
    if (srv && typeof srv.unregisterTool === 'function') {
      try { await srv.unregisterTool(t); } catch (e) { results.errors.push(`srv tool ${t}: ${e.message}`); }
    }
    try { await reg.unregisterToolInternal(t); results.removed.tools.push(t); } catch (e) { results.errors.push(`internal tool ${t}: ${e.message}`); }
  }
  // Resources
  for (const r of diff.resources.removed) {
    if (srv && typeof srv.unregisterResource === 'function') {
      try { await srv.unregisterResource(r); } catch (e) { results.errors.push(`srv resource ${r}: ${e.message}`); }
    }
    try { reg.unregisterResourceInternal(r); results.removed.resources.push(r); } catch (e) { results.errors.push(`internal resource ${r}: ${e.message}`); }
  }
  // Prompts
  for (const p of diff.prompts.removed) {
    if (srv && typeof srv.unregisterPrompt === 'function') {
      try { await srv.unregisterPrompt(p); } catch (e) { results.errors.push(`srv prompt ${p}: ${e.message}`); }
    }
    try { reg.unregisterPromptInternal(p); results.removed.prompts.push(p); } catch (e) { results.errors.push(`internal prompt ${p}: ${e.message}`); }
  }
  if (diff.tools.added.length) {
    console.log('[Registry] ➕ New plugin tools detected (registration handled at load):', diff.tools.added.join(', '));
  }
  const noSrvAPI = (diff.resources.removed.length && !(srv && typeof srv.unregisterResource === 'function')) || (diff.prompts.removed.length && !(srv && typeof srv.unregisterPrompt === 'function'));
  if (noSrvAPI) console.log('[Registry] (info) Removed resources/prompts detected but server lacks unregister API');
  console.log('[Registry] Capability diff applied:', JSON.stringify(results));
  return results;
}

// (cleanup defined earlier; removed duplicate)

// Aggregate a concise plugin security report for external surfaces (marketplace, health, etc.)
function getPluginSecurityReport() {
  try {
    const pm = getPluginManager();
    const stats = pm.getStats();
    return {
      totalPlugins: stats.total,
      dependencyPolicies: stats.dependencyPolicies,
      signatures: stats.signed,
      sandbox: stats.sandbox
    };
  } catch (e) {
    return { error: e.message };
  }
}

module.exports = {
  registerAllTools,
  registerAllResources,
  getResourceCounts,
  getRegistry,
  getHotReloadManager,
  getValidationManager,
  getRegistryInstance,
  setServerInstance,
  getServerInstance,
  getPluginManager,
  dynamicLoadModule,
  dynamicUnloadModule,
  reregisterModuleTools,
  registerMCPTool,
  getPluginSecurityReport,
  cleanup
};
