/**
 * Tool Registry Index - MCP Open Discovery (CLEAN REFACTORED VERSION)
 * 
 * This completely replaces the previous 601-line complex implementation
 * with a clean, focused orchestrator using proper separation of concerns.
 * 
 * NEW CLEAN ARCHITECTURE:
 * - CoreRegistry: Tool lifecycle and state management
 * - HotReloadManager: Module hot-reloading capabilities  
 * - ToolValidationManager: Tool validation and compliance
 * - DatabaseLayer: Persistent storage abstraction
 * 
 * BENEFITS:
 * - Clear separation of concerns (vs. mixed responsibilities)
 * - Focused single-purpose classes (vs. monolithic 600+ line files)
 * - Proper error handling and validation
 * - Hot-reload capabilities with file watching
 * - Comprehensive tool validation with MCP compliance
 * - Clean database-first startup flow
 */

const { CoreRegistry } = require('./core_registry');
const { HotReloadManager } = require('./hot_reload_manager');
const { ToolValidationManager } = require('./tool_validation_manager');
const { registerAllResources, getResourceCounts } = require('./resource_manager');
const { hasArrayParameters, getRegistrationSchema, getRegistrationMethod, analyzeParameters } = require('./parameter_type_detector');
const { zodToJsonSchema } = require('zod-to-json-schema');

// Registry singleton instances with proper lifecycle
let registryInstance = null;
let hotReloadManager = null;
let validationManager = null;
let registrationInProgress = false;
let registrationComplete = false;

/**
 * Convert Zod schema to JSON Schema for MCP SDK compatibility
 * This handles the fact that our tools use Zod schemas but MCP requires JSON Schema
 */
function zodToJsonSchema(zodSchema) {
  if (!zodSchema || !zodSchema._def) {
    throw new Error('Invalid Zod schema - missing _def property');
  }

  const def = zodSchema._def;
  
  if (def.typeName === 'ZodObject') {
    const properties = {};
    const required = [];
    
    // ZodObject properties are stored in _def.shape (can be function or property)
    let shape;
    if (typeof def.shape === 'function') {
      shape = def.shape();  // Call the function to get the shape
    } else {
      shape = def.shape;    // Use the property directly
    }
    
    if (shape && typeof shape === 'object') {
      for (const [key, value] of Object.entries(shape)) {
        if (value && value._def) {
          properties[key] = convertZodType(value);
          
          // Check if field is required (not optional and no default)
          if (value._def.typeName !== 'ZodOptional' && value._def.typeName !== 'ZodDefault') {
            // Check if the field is wrapped in ZodOptional
            let isOptional = false;
            if (value.isOptional && typeof value.isOptional === 'function') {
              isOptional = value.isOptional();
            }
            if (!isOptional) {
              required.push(key);
            }
          }
        }
      }
    }
    
    const jsonSchema = {
      type: 'object',
      properties,
      additionalProperties: true // for .passthrough()
    };
    
    // Only add required if there are actually required fields
    if (required.length > 0) {
      jsonSchema.required = required;
    }
    
    return jsonSchema;
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
      const stringSchema = {
        type: 'string',
        description: def.description
      };
      
      // Handle string validations
      if (def.checks) {
        for (const check of def.checks) {
          switch (check.kind) {
            case 'min':
              stringSchema.minLength = check.value;
              break;
            case 'max':
              stringSchema.maxLength = check.value;
              break;
            case 'email':
              stringSchema.format = 'email';
              break;
            case 'url':
              stringSchema.format = 'uri';
              break;
          }
        }
      }
      
      return stringSchema;
      
    case 'ZodNumber':
      const numberSchema = {
        type: 'number',
        description: def.description
      };
      
      // Handle number validations
      if (def.checks) {
        for (const check of def.checks) {
          switch (check.kind) {
            case 'min':
              numberSchema.minimum = check.value;
              break;
            case 'max':
              numberSchema.maximum = check.value;
              break;
            case 'int':
              numberSchema.type = 'integer';
              break;
          }
        }
      }
      
      return numberSchema;
      
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
      
    case 'ZodEnum':
      return {
        type: 'string',
        enum: def.values,
        description: def.description
      };
      
    case 'ZodLiteral':
      return {
        type: typeof def.value,
        const: def.value,
        description: def.description
      };
      
    case 'ZodAny':
      return {
        description: def.description || 'Any value allowed'
      };
      
    case 'ZodUnknown':
      return {
        description: def.description || 'Unknown value type'
      };
      
    case 'ZodRecord':
      return {
        type: 'object',
        additionalProperties: def.valueType ? convertZodType(def.valueType) : true,
        description: def.description
      };
      
    case 'ZodUnion':
      return {
        anyOf: def.options.map(convertZodType),
        description: def.description
      };
      
    case 'ZodIntersection':
      return {
        allOf: [convertZodType(def.left), convertZodType(def.right)],
        description: def.description
      };
      
    case 'ZodNull':
      return {
        type: 'null',
        description: def.description
      };
      
    case 'ZodUndefined':
      return {
        type: 'null',
        description: def.description || 'Undefined value'
      };
      
    default:
      console.warn(`[Zod Converter] Unsupported Zod type: ${def.typeName}, falling back to string`);
      return {
        type: 'string',
        description: def.description || `Unsupported type: ${def.typeName}`
      };
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
 * Main tool registration function called during server startup
 * Implements database-first architecture with clean fallback to fresh registration
 * 
 * @param {Object} server - MCP server instance
 * @returns {Promise<Object>} Registration results
 * 
 * Validated - Function ID#1004 - TOOL REGISTRATION ORCHESTRATOR (CRITICAL PATH)
 */
async function registerAllTools(server) {
  // Prevent multiple concurrent registrations
  if (registrationInProgress) {
    console.log('[Registry] ⚠️  Registration already in progress, waiting...');
    while (registrationInProgress) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    console.log('[Registry] ✅ Using existing registration results');
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
    console.log('[Registry] 🚀 MCP Open Discovery v2.0 - Clean Architecture');
    console.log('[Registry] ========================================');
    
    const registry = getRegistry();
    const validator = getValidationManager();
    
    // Initialize the registry and database
    await registry.initialize();
    
    // DATABASE-FIRST ARCHITECTURE: Check if tools already exist
    const hasExistingTools = await registry.hasExistingTools();
    
    let result;
    if (hasExistingTools) {
      console.log('[Registry] 📂 Loading existing tools from database...');
      result = await _loadFromDatabase(server, registry, validator);
    } else {
      console.log('[Registry] 🔄 Performing fresh tool registration...');
      result = await _registerFreshTools(server, registry, validator);
    }
    
    // Mark registration as complete
    registrationComplete = true;
    registrationInProgress = false;
    
    console.log('[Registry] ========================================');
    console.log('[Registry] ✅ Registration Complete');
    console.log('[Registry] ========================================');
    
    return result;
    
  } catch (error) {
    registrationInProgress = false;
    console.error('[Registry] ❌ Tool registration failed:', error.message);
    throw error;
  }
}

/**
 * Load tools from database (existing installation)
 * @param {Object} server - MCP server instance
 * @param {Object} registry - Registry instance
 * @param {Object} validator - Validation manager
 * @returns {Promise<Object>} Load results
 * @private
 */
async function _loadFromDatabase(server, registry, validator) {
  const loadResult = await registry.loadFromDatabase();
  
  // Initialize memory tools if needed (special case)
  await _initializeMemoryToolsIfNeeded();
  
  // TODO: Register tools with MCP server from database state
  // For now, this is a limitation - we need to store full tool schemas in DB
  console.log('[Registry] ⚠️  Note: Database-to-server registration needs tool schemas in DB');
  
  return {
    success: true,
    source: 'database',
    registry: registry,
    summary: registry.getStats(),
    validation: validator.getValidationSummary(),
    ...loadResult
  };
}

/**
 * Register tools fresh (first-time or reset)
 * @param {Object} server - MCP server instance
 * @param {Object} registry - Registry instance
 * @param {Object} validator - Validation manager
 * @returns {Promise<Object>} Registration results
 * @private
 */
async function _registerFreshTools(server, registry, validator) {
  // Validated - Function ID#1005 - FRESH TOOL REGISTRATION (HOT PATH)
  // Define all tool modules with metadata for hot-reload
  const toolModules = [
    { 
      name: 'memory_tools_sdk',
      category: 'Memory',
      loader: () => require('../memory_tools_sdk'),
      requiresInit: true // Special initialization needed
    },
    { 
      name: 'network_tools_sdk',
      category: 'Network', 
      loader: () => require('../network_tools_sdk')
    },
    { 
      name: 'nmap_tools_sdk',
      category: 'NMAP',
      loader: () => require('../nmap_tools_sdk')
    },
    { 
      name: 'proxmox_tools_sdk',
      category: 'Proxmox',
      loader: () => require('../proxmox_tools_sdk')
    },
    { 
      name: 'snmp_tools_sdk',
      category: 'SNMP',
      loader: () => require('../snmp_tools_sdk')
    },
    { 
      name: 'zabbix_tools_sdk',
      category: 'Zabbix',
      loader: () => require('../zabbix_tools_sdk')
    },
    { 
      name: 'credentials_tools_sdk',
      category: 'Credentials',
      loader: () => require('../credentials_tools_sdk')
    },
    { 
      name: 'registry_tools_sdk',
      category: 'Registry',
      loader: () => require('../registry_tools_sdk')
    }
  ];

  let totalTools = 0;
  const results = {};
  const validationResults = [];

  for (const moduleConfig of toolModules) {
    try {
      console.log(`[Registry] 🔄 Registering ${moduleConfig.name}...`);
      
      // Load the module
      const module = moduleConfig.loader();
      const filePath = require.resolve(`../${moduleConfig.name}`);
      
      // Special initialization for modules that need it
      if (moduleConfig.requiresInit && module.initialize) {
        console.log(`[Registry] 🔧 Initializing ${moduleConfig.name}...`);
        await module.initialize();
      }
      
      // Validate tools before registration
      if (module.tools && Array.isArray(module.tools)) {
        const batchValidation = validator.validateToolBatch(module.tools, moduleConfig.name);
        validationResults.push(batchValidation);
        
        if (batchValidation.invalidTools > 0) {
          console.warn(`[Registry] ⚠️  ${moduleConfig.name} has ${batchValidation.invalidTools} invalid tools`);
        }
      }
      
      // Start module registration
      registry.startModule(moduleConfig.name, moduleConfig.category);
      
      // Register each valid tool
      if (module.tools && Array.isArray(module.tools)) {
        let registeredCount = 0;
        
        for (const tool of module.tools) {
          // Only register valid tools
          const validationResult = validator.getValidationResult(tool.name);
          if (validationResult && validationResult.valid) {
            
            // CRITICAL: Detect parameter types to determine registration method
            // Validated - Function ID#1006 - PARAMETER ANALYSIS (CRITICAL DECISION POINT)
            const paramAnalysis = analyzeParameters(tool);
            const hasArrays = hasArrayParameters(tool);
            const registrationMethod = getRegistrationMethod(tool);
            
            console.log(`[Registry] [DEBUG] Tool ${tool.name}: ${registrationMethod} (hasArrays: ${hasArrays})`);
            console.log(`[Registry] [DEBUG] Parameter types:`, paramAnalysis.parameterTypes);
            
            // Get appropriate schema for registration
            let registrationSchema = getRegistrationSchema(tool);
            
            console.log(`[Registry] [DEBUG] ${tool.name} - Original schema has _def:`, !!tool.inputSchema._def);
            console.log(`[Registry] [DEBUG] ${tool.name} - Registration schema has _def:`, !!registrationSchema._def);
            
            // Convert Zod to JSON Schema for ALL tools (both array and non-array)
            // Both server.tool() and server.registerTool() expect JSON Schema
            if (tool.inputSchema && tool.inputSchema._def) {
              try {
                registrationSchema = zodToJsonSchema(tool.inputSchema);
                console.log(`[Registry] [DEBUG] Converted Zod schema to JSON Schema for ${tool.name}`);
              } catch (error) {
                console.warn(`[Registry] ⚠️  Failed to convert Zod schema for ${tool.name}:`, error.message);
                registrationSchema = { type: 'object', properties: {}, additionalProperties: true };
              }
            } else {
              console.log(`[Registry] [DEBUG] ${tool.name} - No Zod conversion needed (no _def property)`);
            }
            
            // Register using the appropriate MCP SDK method
            // Validated - Function ID#1007 - MCP SDK REGISTRATION (ERROR POINT!)
            if (registrationMethod === 'server.tool') {
              // Array parameter tools - use server.tool() with JSON Schema
              console.log(`[Registry] [DEBUG] Registering ${tool.name} with server.tool() for array parameters`);
              server.tool(tool.name, tool.description, registrationSchema, async (args) => {
                return module.handleToolCall(tool.name, args);
              });
            } else {
              // Simple parameter tools - use server.registerTool() with JSON Schema
              console.log(`[Registry] [DEBUG] Registering ${tool.name} with server.registerTool() for simple parameters`);
              const toolConfig = {
                description: tool.description,
                inputSchema: registrationSchema
              };
              
              server.registerTool(tool.name, toolConfig, async (args) => {
                return module.handleToolCall(tool.name, args);
              });
            }
            
            // Register with our registry
            registry.registerTool(tool.name);
            registeredCount++;
            totalTools++;
          } else {
            console.warn(`[Registry] ⚠️  Skipping invalid tool: ${tool.name}`);
          }
        }
        
        results[moduleConfig.category] = registeredCount;
        console.log(`[Registry] ✅ Registered ${registeredCount}/${module.tools.length} ${moduleConfig.category} tools`);
      } else {
        console.warn(`[Registry] ⚠️  Module ${moduleConfig.name} has no tools array`);
        results[moduleConfig.category] = 0;
      }
      
      // Complete module registration - THIS IS CRITICAL!
      await registry.completeModule();
      
      // Set up hot-reload watching
      if (hotReloadManager) {
        hotReloadManager.watchModule(moduleConfig.name, filePath);
      }
      
    } catch (error) {
      console.error(`[Registry] ❌ Failed to register ${moduleConfig.name}:`, error.message);
      results[moduleConfig.category] = `Error: ${error.message}`;
    }
  }

  return {
    success: true,
    source: 'fresh_registration',
    registry: registry,
    summary: registry.getStats(),
    validation: validator.getValidationSummary(),
    modules: toolModules.length + 1, // +1 for management tools
    tools: totalTools,
    categories: results,
    validationResults
  };
}

/**
 * Initialize memory tools if needed (special case handling)
 * @returns {Promise<void>}
 * @private
 */
async function _initializeMemoryToolsIfNeeded() {
  try {
    const memoryToolsModule = require('../memory_tools_sdk');
    if (memoryToolsModule.initialize && typeof memoryToolsModule.initialize === 'function') {
      console.log('[Registry] 🔧 Initializing memory tools...');
      await memoryToolsModule.initialize();
      console.log('[Registry] ✅ Memory tools initialized successfully');
    }
  } catch (error) {
    console.error('[Registry] ❌ Memory tools initialization failed:', error.message);
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
