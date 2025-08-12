/**
 * Core Registry - MCP Open Discovery Tool Registry (REFACTORED)
 * 
 * Clean, focused registry manager with clear separation of concerns:
 * - Tool lifecycle management (register/unregister/reload)
 * - Database persistence coordination
 * - State tracking and validation
 * - Hot-reload capabilities
 * 
 * DESIGN PRINCIPLES:
 * - Single Responsibility: Each method has one clear purpose
 * - Fail Fast: Validate inputs and state early
 * - Immutable State: Use defensive copying where needed
 * - Clear Error Messages: Descriptive error handling
 */

const fs = require('fs');
const path = require('path');
const { DatabaseLayer } = require('./database_layer');

/**
 * Registry states for lifecycle management
 */
const REGISTRY_STATES = {
  UNINITIALIZED: 'uninitialized',
  INITIALIZING: 'initializing', 
  READY: 'ready',
  LOADING_FROM_DB: 'loading_from_db',
  REGISTERING_TOOLS: 'registering_tools',
  ERROR: 'error'
};

/**
 * Core Registry - Clean implementation
 */
class CoreRegistry {
  constructor() {
    // Core state tracking
    this.state = REGISTRY_STATES.UNINITIALIZED;
    this.registeredTools = new Set();
    this.categories = new Map(); // category -> Set<toolName>
    this.modules = new Map();    // moduleName -> ModuleInfo
    
    // Database layer
    this.db = new DatabaseLayer();
    this.dbInitialized = false;
    
    // Hot-reload capabilities
    this.hotReloadEnabled = true;
    this.moduleWatchers = new Map();
    this.moduleCache = new Map();
    
    // Current operation tracking
    this.currentModule = null;
    
    console.log('[Core Registry] Initialized - Clean Architecture v2.0');
  }

  /**
   * Initialize the registry and database
   * @returns {Promise<void>}
   */
  async initialize() {
    if (this.state !== REGISTRY_STATES.UNINITIALIZED) {
      console.log(`[Core Registry] Already initialized (state: ${this.state})`);
      return;
    }

    this.state = REGISTRY_STATES.INITIALIZING;
    
    try {
      console.log('[Core Registry] Initializing database connection...');
      await this.db.initialize();
      this.dbInitialized = true;
      
      this.state = REGISTRY_STATES.READY;
      console.log('[Core Registry] ✅ Initialization complete');
    } catch (error) {
      this.state = REGISTRY_STATES.ERROR;
      console.error('[Core Registry] ❌ Initialization failed:', error.message);
      throw new Error(`Registry initialization failed: ${error.message}`);
    }
  }

  /**
   * Check if tools already exist in the database
   * @returns {Promise<boolean>}
   */
  async hasExistingTools() {
    this._ensureInitialized();
    
    try {
      const modules = await this.db.getModules();
      const tools = await this.db.getTools();
      
      const hasData = modules.length > 0 && tools.length > 0;
      console.log(`[Core Registry] Database check: ${modules.length} modules, ${tools.length} tools - ${hasData ? 'EXISTS' : 'EMPTY'}`);
      
      return hasData;
    } catch (error) {
      console.error('[Core Registry] Error checking existing tools:', error.message);
      return false;
    }
  }

  /**
   * Deprecated alias for compatibility (use hasExistingTools instead)
   * @returns {Promise<boolean>}
   */
  async areToolsAlreadyRegistered() {
    // For backward compatibility only
    return this.hasExistingTools();
  }

  /**
   * Load existing tools from database and register them with MCP server
   * @param {Object} server - MCP server instance
   * @returns {Promise<LoadResult>}
   */
  async loadToolsFromDatabase(server) {
    this._ensureInitialized();
    this.state = REGISTRY_STATES.LOADING_FROM_DB;
    
    try {
      console.log('[Core Registry] 📂 Loading and registering tools from database...');
      
      const modules = await this.db.getModules();
      const tools = await this.db.getTools();
      
      // Rebuild internal state from database
      await this._rebuildStateFromDatabase(modules, tools);
      
      // Register tools with MCP server (this is the missing piece)
      await this._registerDatabaseToolsWithServer(server, modules, tools);
      
      this.state = REGISTRY_STATES.READY;
      
      const result = {
        modules: modules.length,
        tools: tools.length,
        categories: this.categories.size,
        loadedFromDatabase: true
      };
      
      console.log(`[Core Registry] ✅ Loaded and registered ${result.modules} modules with ${result.tools} tools from database`);
      
      return result;
    } catch (error) {
      this.state = REGISTRY_STATES.ERROR;
      console.error('[Core Registry] ❌ Failed to load from database:', error.message);
      throw error;
    }
  }

  /**
   * Load existing tools from database instead of re-registering
   * @returns {Promise<LoadResult>}
   */
  async loadFromDatabase() {
    this._ensureInitialized();
    this.state = REGISTRY_STATES.LOADING_FROM_DB;
    
    try {
      console.log('[Core Registry] 📂 Loading tools from database...');
      
      const modules = await this.db.getModules();
      const tools = await this.db.getTools();
      
      // Rebuild internal state from database
      await this._rebuildStateFromDatabase(modules, tools);
      
      this.state = REGISTRY_STATES.READY;
      
      const result = {
        modules: modules.length,
        tools: tools.length,
        categories: this.categories.size,
        loadedFromDatabase: true
      };
      
      console.log(`[Core Registry] ✅ Loaded ${result.modules} modules with ${result.tools} tools from database`);
      
      return result;
    } catch (error) {
      this.state = REGISTRY_STATES.ERROR;
      console.error('[Core Registry] ❌ Failed to load from database:', error.message);
      throw error;
    }
  }

  /**
   * Start registering a new module
   * @param {string} moduleName - Name of the module
   * @param {string} category - Module category
   */
  startModule(moduleName, category) {
    this._ensureInitialized();
    
    if (this.currentModule) {
      throw new Error(`Cannot start module ${moduleName}: module ${this.currentModule.name} is still in progress`);
    }
    
    console.log(`[Core Registry] 🔄 Starting module: ${moduleName} (${category})`);
    
    this.currentModule = {
      name: moduleName,
      category,
      tools: new Set(),
      startTime: Date.now()
    };
    
    // Initialize category if new
    if (!this.categories.has(category)) {
      this.categories.set(category, new Set());
    }
  }

  /**
   * Register a tool within the current module
   * @param {string} toolName - Name of the tool
   */
  registerTool(toolName) {
    this._ensureCurrentModule();
    
    // Check for duplicates
    if (this.registeredTools.has(toolName)) {
      console.log(`[Core Registry] ⚠️  Skipping duplicate tool: ${toolName}`);
      return;
    }
    
    // Register the tool
    this.registeredTools.add(toolName);
    this.currentModule.tools.add(toolName);
    this.categories.get(this.currentModule.category).add(toolName);
    
    console.log(`[Core Registry] ✅ Registered tool: ${toolName}`);
  }

  /**
   * Complete the current module registration
   * @returns {Promise<void>}
   */
  async completeModule() {
    this._ensureCurrentModule();
    
    const duration = Date.now() - this.currentModule.startTime;
    const moduleInfo = {
      name: this.currentModule.name,
      category: this.currentModule.category,
      tools: Array.from(this.currentModule.tools),
      toolCount: this.currentModule.tools.size,
      loadedAt: new Date(),
      loadDuration: duration,
      active: true
    };
    
    // Store in registry
    this.modules.set(this.currentModule.name, moduleInfo);
    
    // Persist to database
    if (this.dbInitialized) {
      try {
        await this.db.recordModuleRegistration(
          moduleInfo.name,
          moduleInfo.category,
          moduleInfo.tools,
          duration
        );
        console.log(`[Core Registry] 💾 Persisted ${moduleInfo.name} to database`);
      } catch (error) {
        console.error(`[Core Registry] ❌ Database persistence failed for ${moduleInfo.name}:`, error.message);
      }
    }
    
    // Cache for hot-reload
    if (this.hotReloadEnabled) {
      this.moduleCache.set(moduleInfo.name, moduleInfo);
    }
    
    console.log(`[Core Registry] ✅ Completed ${moduleInfo.name}: ${moduleInfo.toolCount} tools (${duration}ms)`);
    
    this.currentModule = null;
  }

  /**
   * Get current registry statistics
   * @returns {Object} Registry statistics
   */
  getStats() {
    const stats = {
      state: this.state,
      modules: this.modules.size,
      tools: this.registeredTools.size,
      categories: this.categories.size,
      dbInitialized: this.dbInitialized,
      hotReloadEnabled: this.hotReloadEnabled
    };
    
    // Add category breakdown
    stats.categoryBreakdown = {};
    for (const [category, tools] of this.categories) {
      stats.categoryBreakdown[category] = tools.size;
    }
    
    return stats;
  }

  // getToolCounts is now merged into getStats()

  /**
   * Get hot-reload status
   * @returns {Object} Hot-reload status
   */
  getHotReloadStatus() {
    return {
      enabled: this.hotReloadEnabled,
      watchedModules: this.moduleWatchers.size,
      cachedModules: this.moduleCache.size
    };
  }

  /**
   * Get analytics for database
   * @returns {Promise<Object>} Analytics data
   */
  async getAnalytics() {
    if (!this.dbInitialized) {
      return { error: 'Database not initialized' };
    }
    
    try {
      const stats = await this.db.getRegistryStats();
      return {
        enabled: true,
        current_session: this.getStats(),
        database: stats
      };
    } catch (error) {
      console.error('[Core Registry] Analytics error:', error.message);
      return { error: error.message };
    }
  }

  /**
   * Clean shutdown
   * @returns {Promise<void>}
   */
  async cleanup() {
    console.log('[Core Registry] 🧹 Starting cleanup...');
    
    // Clear hot-reload watchers
    for (const [moduleName, watcher] of this.moduleWatchers) {
      try {
        watcher.close();
        console.log(`[Core Registry] Stopped watching: ${moduleName}`);
      } catch (error) {
        console.warn(`[Core Registry] Failed to close watcher for ${moduleName}:`, error.message);
      }
    }
    this.moduleWatchers.clear();
    
    // Close database connection
    if (this.dbInitialized) {
      try {
        await this.db.close();
        console.log('[Core Registry] Database connection closed');
      } catch (error) {
        console.warn('[Core Registry] Database close error:', error.message);
      }
    }
    
    this.state = REGISTRY_STATES.UNINITIALIZED;
    console.log('[Core Registry] ✅ Cleanup complete');
  }

  // ========== PRIVATE METHODS ==========

  /**
   * Ensure registry is initialized
   * @private
   */
  _ensureInitialized() {
    if (this.state === REGISTRY_STATES.UNINITIALIZED) {
      throw new Error('Registry not initialized. Call initialize() first.');
    }
    if (this.state === REGISTRY_STATES.ERROR) {
      throw new Error('Registry is in error state. Restart required.');
    }
  }

  /**
   * Ensure there's a current module
   * @private
   */
  _ensureCurrentModule() {
    this._ensureInitialized();
    if (!this.currentModule) {
      throw new Error('No module in progress. Call startModule() first.');
    }
  }

  /**
   * Rebuild internal state from database data
   * @param {Array} modules - Module records from database
   * @param {Array} tools - Tool records from database
   * @private
   */
  async _rebuildStateFromDatabase(modules, tools) {
    console.log('[Core Registry] 🔄 Rebuilding state from database...');
    
    // Clear current state
    this.registeredTools.clear();
    this.categories.clear();
    this.modules.clear();
    
    // Rebuild modules
    for (const moduleRecord of modules) {
      const moduleInfo = {
        name: moduleRecord.module_name,
        category: moduleRecord.category,
        tools: [],
        toolCount: 0,
        loadedAt: new Date(moduleRecord.created_at),
        loadDuration: 0,
        active: true,
        loadedFromDatabase: true
      };
      
      this.modules.set(moduleRecord.module_name, moduleInfo);
      
      if (!this.categories.has(moduleRecord.category)) {
        this.categories.set(moduleRecord.category, new Set());
      }
    }
    
    // Rebuild tools
    for (const toolRecord of tools) {
      this.registeredTools.add(toolRecord.tool_name);
      
      const module = this.modules.get(toolRecord.module_name);
      if (module) {
        module.tools.push(toolRecord.tool_name);
        module.toolCount++;
        this.categories.get(module.category).add(toolRecord.tool_name);
      }
    }
    
    console.log('[Core Registry] ✅ State rebuild complete');
  }

  /**
   * Register tools from database with MCP server
   * This requires reloading the actual modules to get tool definitions
   * @param {Object} server - MCP server instance
   * @param {Array} modules - Module records from database
   * @param {Array} tools - Tool records from database
   * @private
   */
  async _registerDatabaseToolsWithServer(server, modules, tools) {
    console.log('[Core Registry] 🔄 Registering database tools with MCP server...');
    
    // Group tools by module
    const moduleTools = new Map();
    for (const moduleRecord of modules) {
      moduleTools.set(moduleRecord.module_name, {
        category: moduleRecord.category,
        tools: tools.filter(t => t.module_name === moduleRecord.module_name)
      });
    }
    
    // Load each module and register its tools
    for (const [moduleName, moduleData] of moduleTools) {
      try {
        console.log(`[Core Registry] 🔄 Loading module: ${moduleName}`);
        
        // Dynamically load the module
        const moduleExports = require(`../${moduleName}`);
        const { tools: moduleToolDefs, handleToolCall, initialize } = moduleExports;
        
        if (!moduleToolDefs || !Array.isArray(moduleToolDefs)) {
          console.warn(`[Core Registry] ⚠️  Module ${moduleName} has no tools array, skipping`);
          continue;
        }
        
        // Special initialization for memory tools
        if (moduleName === 'memory_tools_sdk' && typeof initialize === 'function') {
          console.log(`[Core Registry] 🔧 Initializing ${moduleName}...`);
          await initialize();
        }
        
        // Register tools that exist in database
        for (const toolDef of moduleToolDefs) {
          const toolInDB = moduleData.tools.find(t => t.tool_name === toolDef.name);
          if (toolInDB) {
            try {
              // Convert Zod schema to JSON Schema if needed
              let jsonSchema = toolDef.inputSchema;
              if (toolDef.inputSchema && toolDef.inputSchema._def) {
                // This would need the zodToJsonSchema converter
                console.log(`[Core Registry] ⚠️  Tool ${toolDef.name} has Zod schema - conversion needed`);
                jsonSchema = { type: 'object', properties: {}, additionalProperties: true };
              }
              
              // Register with MCP server
              server.tool(toolDef.name, toolDef.description, jsonSchema, async (args) => {
                return handleToolCall(toolDef.name, args);
              });
              
              console.log(`[Core Registry] ✅ Registered database tool: ${toolDef.name}`);
            } catch (error) {
              console.error(`[Core Registry] ❌ Failed to register tool ${toolDef.name}:`, error.message);
            }
          }
        }
        
      } catch (error) {
        console.error(`[Core Registry] ❌ Failed to load module ${moduleName}:`, error.message);
      }
    }
    
    console.log('[Core Registry] ✅ Database tools registered with MCP server');
  }
}

module.exports = {
  CoreRegistry,
  REGISTRY_STATES
};
