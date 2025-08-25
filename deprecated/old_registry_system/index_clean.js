/**
 * Tool Registry Index - MCP SDK Specification Compliant
 * 
 * Clean implementation focused on MCP SDK specifications:
 * - Standard JSON Schema conversion from Zod
 * - Single tool registration method per MCP spec
 * - Minimal, targeted schema cleanup
 * - Direct implementation of MCP Tool interface
 * 
 * Based on MCP Schema 2025-06-18 specification
 */

const { zodToJsonSchema } = require('zod-to-json-schema');
const { CoreRegistry } = require('./core_registry');
const { HotReloadManager } = require('./hot_reload_manager');
const { ToolValidationManager } = require('./tool_validation_manager');
const { registerAllResources, getResourceCounts } = require('./resource_manager');

// Registry singleton instances
let registryInstance = null;
let hotReloadManager = null;
let validationManager = null;
let registrationInProgress = false;
let registrationComplete = false;

/**
 * Convert Zod schema to MCP-compliant JSON Schema
 * 
 * Follows MCP Tool specification:
 * interface Tool {
 *   name: string;
 *   description?: string;
 *   inputSchema: JSONSchema; // Standard JSON Schema
 * }
 * 
 * @param {Object} zodSchema - Zod schema object
 * @returns {Object} MCP-compliant JSON Schema
 */
function convertZodToMCPSchema(zodSchema) {
  if (!zodSchema) {
    // Return minimal valid schema for tools with no parameters
    return {
      type: "object",
      properties: {},
      additionalProperties: false
    };
  }

  try {
    // Use standard zod-to-json-schema library for conversion
    const jsonSchema = zodToJsonSchema(zodSchema, {
      target: 'jsonSchema7',
      strictTuples: false,
      definitions: {}
    });

    // MCP-specific cleanup: remove properties that may interfere with SDK validation
    const cleanSchema = {
      ...jsonSchema
    };

    // Remove $schema meta-property (not needed by MCP SDK)
    delete cleanSchema.$schema;
    
    // Remove $defs if present (use definitions instead)
    if (cleanSchema.$defs) {
      cleanSchema.definitions = cleanSchema.$defs;
      delete cleanSchema.$defs;
    }

    // Ensure type is object for parameter schemas
    if (!cleanSchema.type) {
      cleanSchema.type = "object";
    }

    // Ensure properties exist
    if (!cleanSchema.properties) {
      cleanSchema.properties = {};
    }

    // Set additionalProperties to false for strict validation (MCP standard)
    if (cleanSchema.additionalProperties === undefined) {
      cleanSchema.additionalProperties = false;
    }

    return cleanSchema;

  } catch (error) {
    console.warn(`[Registry] Schema conversion failed: ${error.message}`);
    // Return safe fallback schema
    return {
      type: "object",
      properties: {},
      additionalProperties: false
    };
  }
}

/**
 * Register a single tool with MCP server using standard interface
 * 
 * Implements MCP Tool registration as per specification:
 * - Uses server.registerTool() method
 * - Provides proper Tool configuration object
 * - Handles parameter validation and execution
 * 
 * @param {Object} server - MCP server instance
 * @param {Object} tool - Tool definition with name, description, inputSchema
 * @param {Function} handleToolCall - Tool execution handler
 */
function registerMCPTool(server, tool, handleToolCall) {
  try {
    // Convert Zod schema to MCP-compliant JSON Schema
    const inputSchema = convertZodToMCPSchema(tool.inputSchema);
    
    // Create MCP Tool configuration per specification
    const toolConfig = {
      description: tool.description || `Execute ${tool.name} tool`,
      inputSchema: inputSchema
    };

    // Create execution handler that follows MCP CallToolResult specification
    const mcpHandler = async (args) => {
      try {
        console.log(`[MCP Tool] Executing ${tool.name}`);
        
        // Call the module's handleToolCall function
        const result = await handleToolCall(tool.name, args || {});
        
        // Ensure result follows MCP CallToolResult interface
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

    // Register with MCP server using standard method
    server.registerTool(tool.name, toolConfig, mcpHandler);
    
    console.log(`[Registry] ✅ Registered MCP tool: ${tool.name}`);
    return true;
    
  } catch (error) {
    console.error(`[Registry] ❌ Failed to register tool ${tool.name}:`, error.message);
    return false;
  }
}

/**
 * Get or create the registry singleton
 * @returns {CoreRegistry}
 */
function getRegistry() {
  if (!registryInstance) {
    registryInstance = new CoreRegistry();
    
    // Initialize companion managers
    if (!hotReloadManager) {
      hotReloadManager = new HotReloadManager(registryInstance);
      hotReloadManager.enable();
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
  getRegistry();
  return hotReloadManager;
}

/**
 * Get the validation manager
 * @returns {ToolValidationManager}
 */
function getValidationManager() {
  getRegistry();
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
          console.log(`[Registry] 🔧 Initializing ${moduleConfig.name}...`);
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
  cleanup
};
