/**
 * SDK Tool Registry for MCP Open Discovery Server
 * 
 * Central registry for all MCP SDK-compatible tools with dynamic tracking.
 * Replaces old module_loader.js with proper SDK integration and real-time tool counting.
 * 
 * Phase 1: ✅ Dynamic tool counting with foundation for future dynamic loading
 * Phase 2: ✅ SQLite persistence layer for "Open MCP Dynamic Tools Registry" 
 * Phase 3: 🔄 Dynamic module loading & hot-reload capabilities
 * Future: File-based discovery, management UI, dependency management
 */

const { getCredentialTools, getCredentialResources } = require('./credentials_tools_sdk');
const { registerAllResources } = require('./resource_registry');
const { DynamicRegistryDB } = require('./dynamic_registry_db');
const { registerRegistryTools } = require('./registry_tools_sdk');

/**
 * Dynamic Tool Registration Tracker with Database Persistence & Hot-Reload
 *
 * Tracks tools as they register in real-time. This is Phase 1+2+3 of the
 * "Open MCP Dynamic Tools Registry" system that supports:
 * - ✅ Runtime tool counting and tracking
 * - ✅ SQLite persistence for module history and analytics
 * - 🔄 Dynamic module loading and hot-reload capabilities
 * - 🔄 Module state management and dependency tracking
 * - 🔮 Future: File-based discovery, management UI
 */
class ToolRegistrationTracker {
  constructor() {
    this.categories = new Map();  // category -> Set of tool names
    this.modules = new Map();     // module -> { category, tools, active, server, unloadFunc }
    this.totalCount = 0;
    this.currentModule = null;    // Track which module is currently registering
    this.db = new DynamicRegistryDB(); // SQLite persistence layer
    this.dbInitialized = false;

    // Phase 3: Hot-reload capabilities
    this.moduleWatchers = new Map(); // file path -> watcher instance
    this.serverInstance = null;      // Reference to MCP server for dynamic updates
    this.hotReloadEnabled = false;   // Enable/disable hot-reload
    this.moduleCache = new Map();    // Cache module exports for reloading
  }

  /**
   * Initialize database connection
   */
  async initializeDB() {
    if (!this.dbInitialized) {
      try {
        console.log('[MCP SDK] [DEBUG] Creating DynamicRegistryDB instance...');
        if (!this.db) {
          this.db = new DynamicRegistryDB();
          console.log('[MCP SDK] [DEBUG] DynamicRegistryDB instance created');
        }

        console.log('[MCP SDK] [DEBUG] Calling db.initialize()...');
        await this.db.initialize();
        console.log('[MCP SDK] [DEBUG] db.initialize() completed successfully');

        this.dbInitialized = true;
        console.log('[MCP SDK] Dynamic Registry database initialized');
      } catch (error) {
        console.error('[MCP SDK] [DEBUG] Database initialization error details:');
        console.error('[MCP SDK] [DEBUG] Error message:', error.message);
        console.error('[MCP SDK] [DEBUG] Error stack:', error.stack);
        console.error('[MCP SDK] [DEBUG] Error name:', error.name);
        console.error('[MCP SDK] [DEBUG] Error code:', error.code);

        this.dbInitialized = false;
        this.db = null;

        console.warn('[MCP SDK] Failed to initialize database, continuing without persistence:', error.message);
        // Don't throw - continue without database
      }
    }
  }

  /**
   * Start tracking a module's tool registration
   * @param {string} moduleName - Name of the module being registered
   * @param {string} category - Category of tools (network, memory, etc.)
   */
  async startModule(moduleName, category) {
    this.currentModule = {
      name: moduleName,
      category,
      tools: new Set(),
      startTime: Date.now()
    };

    if (!this.categories.has(category)) {
      this.categories.set(category, new Set());
    }

    console.log(`[MCP SDK] Starting registration for ${moduleName} (${category})`);
  }

  /**
   * Track a tool registration
   * @param {string} toolName - Name of the tool being registered
   */
  track(toolName) {
    if (!this.currentModule) {
      console.warn(`[MCP SDK] Tool ${toolName} registered without module context`);
      return;
    }

    const { category } = this.currentModule;
    this.categories.get(category).add(toolName);
    this.currentModule.tools.add(toolName);
    this.totalCount++;

    console.log(`[MCP SDK] ✓ Registered tool: ${toolName}`);
  }

  /**
   * Finish tracking a module's registration (enhanced for Phase 3)
   */
  async finishModule() {
    if (!this.currentModule) return;

    const { name, category, tools, startTime } = this.currentModule;
    const loadDuration = Date.now() - startTime;

    console.log(`[MCP SDK] [DEBUG] Finishing module ${name} with ${tools.size} tools`);

    // Store in memory (enhanced for hot-reload)
    try {
      this.modules.set(name, {
        category,
        tools: Array.from(tools),
        active: true,
        loadedAt: new Date().toISOString(),
        loadDuration,
        // Phase 3: Hot-reload support
        server: this.serverInstance,
        unloadFunc: null // Can be set by modules for cleanup
      });
      console.log(`[MCP SDK] [DEBUG] In-memory storage successful for ${name}`);
    } catch (memError) {
      console.error(`[MCP SDK] [DEBUG] In-memory storage failed for ${name}:`, memError);
    }

    // Persist to database with comprehensive error handling
    if (this.dbInitialized && this.db) {
      console.log(`[MCP SDK] [DEBUG] Attempting database persistence for ${name}...`);
      try {
        const moduleId = await this.db.recordModuleRegistration(
          name,
          category,
          Array.from(tools)
        );
        console.log(`[MCP SDK] [DEBUG] Database persistence successful for ${name} (ID: ${moduleId})`);
      } catch (error) {
        console.error(`[MCP SDK] [DEBUG] Database persistence failed for ${name}:`, error.message);
        console.error(`[MCP SDK] [DEBUG] Database error stack:`, error.stack);
        // Continue execution even if database operation fails
      }
    } else {
      console.log(`[MCP SDK] [DEBUG] Skipping database persistence (initialized: ${this.dbInitialized}, db: ${!!this.db})`);    
    }

    // Phase 3: Hot-reload support - register module in cache
    if (this.hotReloadEnabled) {
      console.log(`[MCP SDK] [DEBUG] Registering ${name} in module cache for hot-reload`);
      this.moduleCache.set(name, {
        path: '', // Path will be set on load
        exportName: '', // Export name will be set on load
        category,
        registerFunction: null // To be set on load
      });
    }

    console.log(`[MCP SDK] ✅ Completed ${name}: ${tools.size} ${category} tools (${loadDuration}ms)`);
    this.currentModule = null;
  }

  /**
   * Phase 3: Enhanced module registration with tracking (moved from global function)
   * @param {McpServer} server - The MCP server instance
   * @param {string} moduleName - Name of the module
   * @param {string} category - Tool category
   * @param {Function} registerFunc - The module's register function
   */
  async registerModuleWithTracking(server, moduleName, category, registerFunc) {
    // Wrap the server.tool method to intercept registrations
    const originalTool = server.tool.bind(server);

    await this.startModule(moduleName, category);

    server.tool = (name, description, inputSchema, handler) => {
      this.track(name);
      return originalTool(name, description, inputSchema, handler);
    };

    try {
      // Execute the module's registration
      await registerFunc(server);
    } finally {
      // Restore original method
      server.tool = originalTool;
      await this.finishModule();
    }
  }

  /**
   * Get current tool counts by category
   * @returns {Object} Real-time tool counts
   */
  getCounts() {
    const counts = {};
    for (const [category, tools] of this.categories) {
      counts[category] = tools.size;
    }
    counts.total = this.totalCount;
    return counts;
  }

  /**
   * Get detailed module information (for future dynamic registry UI)
   * @returns {Object} Module details
   */
  getModules() {
    return Object.fromEntries(this.modules);
  }

  /**
   * Generate comprehensive registration report with database insights
   * @returns {Object} Complete registration report
   */
  async getRegistrationReport() {
    const categories = {};
    for (const [category, tools] of this.categories) {
      categories[category] = tools.size;
    }

    const report = {
      summary: {
        total: this.totalCount,
        modules: this.modules.size,
        categories: this.categories.size
      },
      categories,
      modules: this.getModules(),
      timestamp: new Date().toISOString()
    };

    // Add database insights if available
    if (this.dbInitialized) {
      try {
        const stats = await this.db.getRegistryStats();
        report.database = {
          enabled: true,
          stats,
          historical_modules: stats.modules.total,
          total_registrations: stats.tools.total
        };
      } catch (error) {
        report.database = {
          enabled: true,
          error: error.message
        };
      }
    } else {
      report.database = { enabled: false };
    }

    return report;
  }

  /**
   * Get module history from database
   */
  async getModuleHistory(limit = 50) {
    if (!this.dbInitialized) return [];

    try {
      return await this.db.getModuleHistory(limit);
    } catch (error) {
      console.warn('[MCP SDK] Failed to get module history:', error.message);
      return [];
    }
  }

  /**
   * Get registry analytics
   */
  async getAnalytics() {
    if (!this.dbInitialized) {
      return {
        enabled: false,
        message: 'Database persistence not available'
      };
    }

    try {
      const [stats, activeModules, history] = await Promise.all([
        this.db.getRegistryStats(),
        this.db.getActiveModules(),
        this.db.getModuleHistory(10)
      ]);

      return {
        enabled: true,
        current_session: {
          modules: this.modules.size,
          tools: this.totalCount,
          categories: this.categories.size
        },
        database: stats,
        active_modules: activeModules,
        recent_history: history
      };
    } catch (error) {
      return {
        enabled: true,
        error: error.message
      };
    }
  }

  /**
   * Phase 3: Initialize hot-reload capabilities
   * @param {McpServer} server - The MCP server instance
   * @param {Object} options - Hot-reload configuration
   */
  initializeHotReload(server, options = {}) {
    this.serverInstance = server;
    this.hotReloadEnabled = options.enabled !== false;

    if (this.hotReloadEnabled) {
      console.log('[MCP SDK] 🔥 Hot-reload capabilities initialized');

      // Update database config for hot-reload
      if (this.dbInitialized) {
        this.db.updateConfig('hot_reload', 'true');
      }
    }
  }

  /**
   * Phase 3: Dynamically load a module at runtime
   * @param {string} modulePath - Path to the module file
   * @param {string} moduleName - Name for the module
   * @param {string} category - Category of tools
   * @param {string} exportName - Name of the export function (e.g., 'registerNetworkTools')
   */
  async loadModule(modulePath, moduleName, category, exportName) {
    console.log(`[MCP SDK] 🔄 Dynamically loading module: ${moduleName} from ${modulePath}`);

    try {
      // Clear module from require cache for fresh reload
      delete require.cache[require.resolve(modulePath)];

      // Import the module
      const moduleExports = require(modulePath);
      const registerFunction = moduleExports[exportName];

      if (!registerFunction || typeof registerFunction !== 'function') {
        throw new Error(`Export function '${exportName}' not found in module ${modulePath}`);
      }

      // Store in cache for future reloads
      this.moduleCache.set(moduleName, {
        path: modulePath,
        exportName,
        category,
        registerFunction
      });

      // Register with tracking
      await this.registerModuleWithTracking(this.serverInstance, moduleName, category, registerFunction);

      // Set up file watcher if hot-reload is enabled
      if (this.hotReloadEnabled && require('fs').existsSync(modulePath)) {
        this.setupModuleWatcher(modulePath, moduleName, category, exportName);
      }

      console.log(`[MCP SDK] ✅ Module ${moduleName} loaded successfully with ${this.modules.get(moduleName)?.tools?.length || 0} tools`);

      return true;
    } catch (error) {
      console.error(`[MCP SDK] ❌ Failed to load module ${moduleName}:`, error.message);

      // Record failure in database
      if (this.dbInitialized) {
        await this.db.recordModuleUnload(moduleName, `Load failed: ${error.message}`);
      }

      throw error;
    }
  }

  /**
   * Phase 3: Unload a module and its tools
   * @param {string} moduleName - Name of the module to unload
   */
  async unloadModule(moduleName) {
    console.log(`[MCP SDK] 🔄 Unloading module: ${moduleName}`);

    const moduleInfo = this.modules.get(moduleName);
    if (!moduleInfo) {
      console.warn(`[MCP SDK] Module ${moduleName} not found for unloading`);
      return false;
    }

    try {
      // Remove tools from categories
      const { category, tools } = moduleInfo;
      if (this.categories.has(category)) {
        const categoryTools = this.categories.get(category);
        tools.forEach(tool => {
          categoryTools.delete(tool);
          this.totalCount--;
        });

        // Remove category if empty
        if (categoryTools.size === 0) {
          this.categories.delete(category);
        }
      }

      // Execute unload function if available
      if (moduleInfo.unloadFunc && typeof moduleInfo.unloadFunc === 'function') {
        await moduleInfo.unloadFunc();
      }

      // Remove from modules
      this.modules.delete(moduleName);

      // Stop file watcher
      if (this.moduleWatchers.has(moduleName)) {
        this.moduleWatchers.get(moduleName).close();
        this.moduleWatchers.delete(moduleName);
      }

      // Record unload in database
      if (this.dbInitialized) {
        await this.db.recordModuleUnload(moduleName, 'Manual unload');
      }

      console.log(`[MCP SDK] ✅ Module ${moduleName} unloaded successfully`);
      return true;
    } catch (error) {
      console.error(`[MCP SDK] ❌ Failed to unload module ${moduleName}:`, error.message);
      return false;
    }
  }

  /**
   * Phase 3: Reload a module (unload + load)
   * @param {string} moduleName - Name of the module to reload
   */
  async reloadModule(moduleName) {
    console.log(`[MCP SDK] 🔄 Reloading module: ${moduleName}`);

    const cachedModule = this.moduleCache.get(moduleName);
    if (!cachedModule) {
      throw new Error(`Module ${moduleName} not found in cache - cannot reload`);
    }

    // Unload first
    await this.unloadModule(moduleName);

    // Load again
    await this.loadModule(
      cachedModule.path,
      moduleName,
      cachedModule.category,
      cachedModule.exportName
    );

    console.log(`[MCP SDK] ✅ Module ${moduleName} reloaded successfully`);
  }

  /**
   * Phase 3: Set up file watcher for hot-reload
   * @param {string} filePath - Path to watch
   * @param {string} moduleName - Module name
   * @param {string} category - Tool category
   * @param {string} exportName - Export function name
   */
  setupModuleWatcher(filePath, moduleName, category, exportName) {
    if (!this.hotReloadEnabled) return;

    try {
      const fs = require('fs');
      const watcher = fs.watch(filePath, { persistent: false }, (eventType) => {
        if (eventType === 'change') {
          console.log(`[MCP SDK] 🔥 File changed: ${filePath} - triggering hot-reload for ${moduleName}`);

          // Debounce rapid file changes
          clearTimeout(this.reloadTimeouts?.get(moduleName));
          if (!this.reloadTimeouts) this.reloadTimeouts = new Map();

          this.reloadTimeouts.set(moduleName, setTimeout(async () => {
            try {
              await this.reloadModule(moduleName);
              console.log(`[MCP SDK] 🔥 Hot-reload completed for ${moduleName}`);
            } catch (error) {
              console.error(`[MCP SDK] ❌ Hot-reload failed for ${moduleName}:`, error.message);
            }
          }, 500)); // 500ms debounce
        }
      });

      this.moduleWatchers.set(moduleName, watcher);
      console.log(`[MCP SDK] 👁️ Watching ${filePath} for changes (${moduleName})`);
    } catch (error) {
      console.warn(`[MCP SDK] Failed to set up file watcher for ${filePath}:`, error.message);
    }
  }

  /**
   * Phase 3: Get module status and hot-reload information
   */
  getModuleStatus() {
    const status = {
      hot_reload: {
        enabled: this.hotReloadEnabled,
        watched_modules: this.moduleWatchers.size,
        cached_modules: this.moduleCache.size
      },
      modules: {},
      categories: {}
    };

    // Module details
    for (const [name, info] of this.modules) {
      status.modules[name] = {
        category: info.category,
        tools: info.tools.length,
        active: info.active,
        loaded_at: info.loadedAt,
        duration: info.loadDuration,
        watchable: this.moduleWatchers.has(name),
        cached: this.moduleCache.has(name)
      };
    }

    // Category summaries
    for (const [category, tools] of this.categories) {
      status.categories[category] = tools.size;
    }

    return status;
  }

  /**
   * Phase 3: Enhanced finishModule with hot-reload support
   */
  async finishModule() {
    if (!this.currentModule) return;

    const { name, category, tools, startTime } = this.currentModule;
    const loadDuration = Date.now() - startTime;

    console.log(`[MCP SDK] [DEBUG] Finishing module ${name} with ${tools.size} tools`);

    // Store in memory (this should always work)
    try {
      this.modules.set(name, {
        category,
        tools: Array.from(tools),
        active: true,
        loadedAt: new Date().toISOString(),
        loadDuration
      });
      console.log(`[MCP SDK] [DEBUG] In-memory storage successful for ${name}`);
    } catch (memError) {
      console.error(`[MCP SDK] [DEBUG] In-memory storage failed for ${name}:`, memError);
    }

    // Persist to database with comprehensive error handling
    if (this.dbInitialized && this.db) {
      console.log(`[MCP SDK] [DEBUG] Attempting database persistence for ${name}...`);
      try {
        const moduleId = await this.db.recordModuleRegistration(
          name,
          category,
          Array.from(tools)
        );
        console.log(`[MCP SDK] [DEBUG] Database persistence successful for ${name} (ID: ${moduleId})`);
      } catch (error) {
        console.error(`[MCP SDK] [DEBUG] Database persistence failed for ${name}:`, error.message);
        console.error(`[MCP SDK] [DEBUG] Database error stack:`, error.stack);
        // Continue execution even if database operation fails
      }
    } else {
      console.log(`[MCP SDK] [DEBUG] Skipping database persistence (initialized: ${this.dbInitialized}, db: ${!!this.db})`);    
    }

    // Phase 3: Hot-reload support - register module in cache
    if (this.hotReloadEnabled) {
      console.log(`[MCP SDK] [DEBUG] Registering ${name} in module cache for hot-reload`);
      this.moduleCache.set(name, {
        path: '', // Path will be set on load
        exportName: '', // Export name will be set on load
        category,
        registerFunction: null // To be set on load
      });
    }

    console.log(`[MCP SDK] ✅ Completed ${name}: ${tools.size} ${category} tools (${loadDuration}ms)`);
    this.currentModule = null;
  }
}

// Global tracker instance
const toolTracker = new ToolRegistrationTracker();

/**
 * Register credential management tools with tracking
 * @param {McpServer} server - The MCP server instance
 */
async function registerCredentialToolsWithTracking(server) {
  const originalTool = server.tool.bind(server);

  await toolTracker.startModule('credentials_tools_sdk', 'credentials');

  server.tool = (name, description, inputSchema, handler) => {
    toolTracker.track(name);
    return originalTool(name, description, inputSchema, handler);
  };

  try {
    const credentialTools = getCredentialTools();
    for (const tool of credentialTools) {
      const inputShape = tool.inputSchema.shape || tool.inputSchema;
      server.tool(tool.name, tool.description, inputShape, tool.handler);
    }
  } catch (error) {
    console.error(`[MCP SDK] Error registering credential tools: ${error.message}`);
  } finally {
    server.tool = originalTool;
    await toolTracker.finishModule();
  }
}

/**
 * Register all available tools with the MCP server (enhanced for Phase 3)
 * @param {McpServer} server - The MCP server instance
 * @param {Object} options - Configuration options (e.g., ciMemory, hotReload)
 * @returns {Promise<void>}
 */
async function registerAllTools(server, options = {}) {
  console.log('[MCP SDK] Starting tool registration with dynamic tracking, database persistence & hot-reload...');

  try {
    // Phase 3: Initialize hot-reload capabilities
    toolTracker.initializeHotReload(server, {
      enabled: options.hotReload !== false
    });

    // Database persistence with enhanced error handling
    console.log('[MCP SDK] [DEBUG] Attempting database initialization...');
    try {
      await toolTracker.initializeDB();
      console.log('[MCP SDK] [DEBUG] Database initialization successful');
    } catch (dbError) {
      console.error('[MCP SDK] [DEBUG] Database initialization failed:', dbError);
      console.error('[MCP SDK] [DEBUG] Stack trace:', dbError.stack);
      // Continue without database - don't let this crash the server
    }

    // Initialize memory tools with CI store
    if (options.ciMemory) {
      const { initialize: initializeMemoryTools } = await import('./memory_tools_sdk.js');
      initializeMemoryTools(options.ciMemory);
    }

    // Register each category with tracking (Phase 3: using instance method)
    await toolTracker.registerModuleWithTracking(server, 'network_tools_sdk', 'network',
      async (s) => {
        const { registerNetworkTools } = await import('./network_tools_sdk.js');
        registerNetworkTools(s);
      }
    );

    await toolTracker.registerModuleWithTracking(server, 'memory_tools_sdk', 'memory',
      async (s) => {
        const { registerMemoryTools } = await import('./memory_tools_sdk.js');
        registerMemoryTools(s);
      }
    );

    await toolTracker.registerModuleWithTracking(server, 'nmap_tools_sdk', 'nmap',
      async (s) => {
        const { registerNmapTools } = await import('./nmap_tools_sdk.js');
        registerNmapTools(s);
      }
    );

    await toolTracker.registerModuleWithTracking(server, 'proxmox_tools_sdk', 'proxmox',
      async (s) => {
        const { registerProxmoxTools } = await import('./proxmox_tools_sdk.js');
        registerProxmoxTools(s);
      }
    );

    await toolTracker.registerModuleWithTracking(server, 'snmp_tools_sdk', 'snmp',
      async (s) => {
        const { registerSnmpTools } = await import('./snmp_tools_sdk.js');
        registerSnmpTools(s);
      }
    );

    await toolTracker.registerModuleWithTracking(server, 'zabbix_tools_sdk', 'zabbix',
      async (s) => {
        const { registerZabbixTools } = await import('./zabbix_tools_sdk.js');
        registerZabbixTools(s);
      }
    );

    await registerCredentialToolsWithTracking(server);

    // Phase 3: Register dynamic module management tools from separate module
    await toolTracker.registerModuleWithTracking(server, 'registry_tools_sdk', 'registry',
      async (s) => {
        registerRegistryTools(s, toolTracker);
      }
    );

    // Register all resources
    await registerAllResources(server);

    // Generate comprehensive registration report with database insights
    const report = await toolTracker.getRegistrationReport();
    console.log('[MCP SDK] Tool Registration Complete!');
    console.log(report);

    // Phase 3: Show hot-reload status
    if (toolTracker.hotReloadEnabled) {
      const status = toolTracker.getModuleStatus();
      console.log('[MCP SDK] 🔥 Hot-reload Status:', {
        enabled: status.hot_reload.enabled,
        modules: status.hot_reload.cached_modules,
        watchers: status.hot_reload.watched_modules
      });
    }

    return report.summary.total;

  } catch (error) {
    console.error(`[MCP SDK] Error during tool registration: ${error.message}`);
    const partialReport = await toolTracker.getRegistrationReport();
    console.log('[MCP SDK] Partial registration report:');
    console.log(partialReport);
    throw error;
  }
}

/**
 * Get count of tools with database-enhanced information
 * Uses dynamic tracking for real-time accuracy
 * @returns {Object} Tool counts by category
 */
async function getToolCounts() {
  const report = await toolTracker.getRegistrationReport();

  // If tracker has data, use it; otherwise fall back to estimates
  if (report.summary.total > 0) {
    return {
      ...report.categories,
      total: report.summary.total,
      database: report.database
    };
  }

  // Fallback estimates (will be replaced by real counts after registration)
  return {
    network: 9,      // ✅ Updated: tcp_connect + whois (removed telnet)
    memory: 8,       // ✅ Converted + Enhanced with persistent storage
    nmap: 5,         // ✅ Converted
    proxmox: 10,     // ✅ Converted
    snmp: 12,        // ✅ Converted
    zabbix: 7,       // 🆕 NEW - Enterprise monitoring integration
    credentials: 5,  // ✅ Added - Credential management tools
    total: 56,       // Dynamic total will replace this
    database: { enabled: false }
  };
}

module.exports = {
  registerAllTools,
  getToolCounts,
  toolTracker,
  ToolRegistrationTracker,
  DynamicRegistryDB
};