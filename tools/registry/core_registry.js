/**
 * Core Registry - MCP Open Discovery Dynamic Tool Registry
 * 
 * Consolidated registry orchestrator that manages:
 * - Tool registration and tracking across all modules
 * - Hot-reload capabilities with file watching
 * - Module lifecycle management (load/unload/reload)
 * - Integration with database persistence layer
 * 
 * Security: Single entry point for all registry operations
 * Maintainability: Clear separation of concerns with database layer
 */

const fs = require('fs');
const path = require('path');
const { DatabaseLayer } = require('./database_layer');

/**
 * Core Dynamic Tool Registration System
 * 
 * Manages the complete lifecycle of MCP tools with hot-reload capabilities.
 * This replaces the previous scattered registry files with a unified approach.
 */
class CoreRegistry {
  constructor() {
    this.categories = new Map();      // category -> Set of tool names
    this.modules = new Map();         // module -> { category, tools, active, server, unloadFunc }
    this.totalCount = 0;
    this.currentModule = null;        // Track which module is currently registering
    this.db = new DatabaseLayer();    // SQLite persistence layer
    this.dbInitialized = false;
    
    // ARCHITECTURAL FIX: Add deduplication tracking
    this.registeredTools = new Set(); // Track all registered tool names
    this.serverInstances = new Set();  // Track MCP server instances to prevent duplicates
    
    // Hot-reload capabilities
    this.moduleWatchers = new Map();  // file path -> watcher instance
    this.serverInstance = null;       // Reference to MCP server for dynamic updates
    this.hotReloadEnabled = true;     // Enable/disable hot-reload system-wide
    this.moduleCache = new Map();     // Cache module exports for reloading
    
    console.log('[Core Registry] Initialized with hot-reload capabilities and deduplication guards');
  }

  /**
   * Initialize database connection
   */
  async initializeDB() {
    if (!this.dbInitialized) {
      try {
        console.log('[Core Registry] [DEBUG] Initializing database layer...');
        await this.db.initialize();
        this.dbInitialized = true;
        console.log('[Core Registry] Database layer initialized successfully');
      } catch (error) {
        console.error('[Core Registry] Database initialization failed:', error.message);
        throw error;
      }
    }
  }

  /**
   * Start tracking a new module
   */
  startModule(moduleName, category) {
    console.log(`[Core Registry] Starting registration for ${moduleName} (${category})`);
    this.currentModule = { name: moduleName, category, tools: new Set(), startTime: Date.now() };
    
    if (!this.categories.has(category)) {
      this.categories.set(category, new Set());
    }
  }

  /**
   * Register a tool with the current module
   * 
   * ARCHITECTURAL FIX: Comprehensive deduplication to prevent the registration
   * catastrophe identified in forensic analysis.
   */
  registerTool(toolName, server) {
    if (!this.currentModule) {
      throw new Error('No module started. Call startModule() first.');
    }
    
    // DEDUPLICATION CHECK: Prevent duplicate tool registration
    if (this.registeredTools.has(toolName)) {
      console.log(`[Core Registry] ⚠️  SKIPPING duplicate tool: ${toolName} (already registered)`);
      return; // Skip duplicate registration
    }
    
    // Track the server instance to detect multi-server issues
    this.serverInstances.add(server);
    if (this.serverInstances.size > 1) {
      console.warn(`[Core Registry] ⚠️  WARNING: Multiple server instances detected (${this.serverInstances.size})`);
      console.warn(`[Core Registry] This should NOT happen with the singleton pattern!`);
    }
    
    console.log(`[Core Registry] ✓ Registered tool: ${toolName}`);
    this.currentModule.tools.add(toolName);
    this.categories.get(this.currentModule.category).add(toolName);
    this.registeredTools.add(toolName); // Track for deduplication
    this.totalCount++;
  }

  /**
   * Complete module registration with persistence
   */
  async completeModule() {
    if (!this.currentModule) {
      throw new Error('No module to complete');
    }

    const duration = Date.now() - this.currentModule.startTime;
    const module = {
      category: this.currentModule.category,
      tools: Array.from(this.currentModule.tools),
      active: true,
      loadedAt: new Date().toISOString(),
      loadDuration: duration
    };

    this.modules.set(this.currentModule.name, module);

    // Persist to database if initialized
    if (this.dbInitialized) {
      try {
        await this.db.recordModuleRegistration(
          this.currentModule.name, 
          this.currentModule.category,
          Array.from(this.currentModule.tools),
          duration
        );
        console.log(`[Core Registry] [DEBUG] Database persistence successful for ${this.currentModule.name}`);
      } catch (error) {
        console.error(`[Core Registry] [ERROR] Database persistence failed for ${this.currentModule.name}:`, error.message);
      }
    }

    // Cache for hot-reload if enabled
    if (this.hotReloadEnabled) {
      this.moduleCache.set(this.currentModule.name, module);
      console.log(`[Core Registry] [DEBUG] Cached ${this.currentModule.name} for hot-reload`);
    }

    console.log(`[Core Registry] ✅ Completed ${this.currentModule.name}: ${this.currentModule.tools.size} ${this.currentModule.category} tools (${duration}ms)`);
    
    this.currentModule = null;
  }

  /**
   * Get comprehensive registry status
   */
  getStatus() {
    const status = {
      hot_reload: {
        enabled: this.hotReloadEnabled,
        watched_modules: this.moduleWatchers.size,
        cached_modules: this.moduleCache.size
      },
      // ARCHITECTURAL FIX: Add deduplication diagnostics
      deduplication: {
        uniqueTools: this.registeredTools.size,
        totalRegistrations: this.totalCount,
        serverInstances: this.serverInstances.size,
        duplicateDetected: this.registeredTools.size !== this.totalCount
      },
      modules: {}
    };

    // Convert modules to status format
    for (const [name, module] of this.modules) {
      status.modules[name] = {
        category: module.category,
        tools: module.tools.length,
        active: module.active,
        loaded_at: module.loadedAt,
        duration: module.loadDuration,
        watchable: this.moduleWatchers.has(name),
        cached: this.moduleCache.has(name)
      };
    }

    return status;
  }

  /**
   * Get analytics with database statistics
   */
  async getAnalytics() {
    const analytics = {
      enabled: true,
      current_session: {
        modules: this.modules.size,
        tools: this.totalCount,
        categories: this.categories.size
      }
    };

    if (this.dbInitialized) {
      try {
        const dbStats = await this.db.getRegistryStats();
        analytics.database = dbStats;
      } catch (error) {
        console.error('[Core Registry] Failed to get database analytics:', error.message);
        analytics.database = { error: error.message };
      }
    }

    return analytics;
  }

  /**
   * Get tool counts by category
   */
  getToolCounts() {
    const counts = {};
    for (const [category, tools] of this.categories) {
      counts[category] = tools.size;
    }
    return {
      total: this.totalCount,
      categories: counts
    };
  }

  /**
   * Enable hot-reload file watching for a module
   */
  enableHotReload(moduleName, filePath) {
    if (!this.hotReloadEnabled || this.moduleWatchers.has(moduleName)) {
      return;
    }

    try {
      const watcher = fs.watchFile(filePath, { interval: 1000 }, (curr, prev) => {
        if (curr.mtime > prev.mtime) {
          console.log(`[Core Registry] [Hot-Reload] File changed: ${filePath}`);
          this.reloadModule(moduleName).catch(error => {
            console.error(`[Core Registry] [Hot-Reload] Failed to reload ${moduleName}:`, error.message);
          });
        }
      });
      
      this.moduleWatchers.set(moduleName, filePath);
      console.log(`[Core Registry] [Hot-Reload] Watching ${moduleName} at ${filePath}`);
    } catch (error) {
      console.error(`[Core Registry] [Hot-Reload] Failed to watch ${moduleName}:`, error.message);
    }
  }

  /**
   * Reload a module (placeholder for future implementation)
   */
  async reloadModule(moduleName) {
    console.log(`[Core Registry] [Hot-Reload] Reloading module: ${moduleName}`);
    // Future implementation will handle module reloading
    return { success: true, message: `Module ${moduleName} reload requested` };
  }

  /**
   * Toggle hot-reload system-wide
   */
  toggleHotReload(enabled) {
    this.hotReloadEnabled = enabled;
    if (!enabled) {
      // Clear all watchers
      for (const [moduleName, filePath] of this.moduleWatchers) {
        fs.unwatchFile(filePath);
      }
      this.moduleWatchers.clear();
      console.log('[Core Registry] Hot-reload disabled and all watchers cleared');
    }
    console.log(`[Core Registry] Hot-reload ${enabled ? 'enabled' : 'disabled'}`);
    return { hotReloadEnabled: this.hotReloadEnabled };
  }

  /**
   * Unload a module and remove its tools from the registry
   */
  async unloadModule(moduleName, options = {}) {
    const { force = false, preserve_config = true } = options;
    
    if (!this.modules.has(moduleName)) {
      throw new Error(`Module ${moduleName} is not loaded`);
    }
    
    const module = this.modules.get(moduleName);
    
    // Check if module is safe to unload (if not forced)
    if (!force && module.active) {
      console.warn(`[Core Registry] Module ${moduleName} is active - use force=true to unload`);
      throw new Error(`Module ${moduleName} is active and cannot be safely unloaded`);
    }
    
    try {
      // Remove tools from categories
      for (const toolName of module.tools) {
        this.categories.get(module.category)?.delete(toolName);
        this.registeredTools.delete(toolName);
        this.totalCount--;
      }
      
      // Clear file watcher
      if (this.moduleWatchers.has(moduleName)) {
        const filePath = this.moduleWatchers.get(moduleName);
        fs.unwatchFile(filePath);
        this.moduleWatchers.delete(moduleName);
      }
      
      // Clear module cache
      this.moduleCache.delete(moduleName);
      
      // Mark module as inactive
      module.active = false;
      module.unloadedAt = new Date().toISOString();
      
      // Remove from modules map
      this.modules.delete(moduleName);
      
      // Update database if configured
      if (this.dbInitialized && preserve_config) {
        await this.db.markModuleUnloaded(moduleName);
      }
      
      console.log(`[Core Registry] ✅ Module ${moduleName} unloaded successfully`);
      
      return {
        tools_removed: module.tools.length,
        watchers_cleared: 1,
        cache_cleared: true,
        config_preserved: preserve_config
      };
      
    } catch (error) {
      console.error(`[Core Registry] Failed to unload module ${moduleName}:`, error.message);
      throw error;
    }
  }

  /**
   * Enhanced reload module with proper implementation
   */
  async reloadModule(moduleName, options = {}) {
    const { clear_cache = true, validate_tools = true } = options;
    
    if (!this.modules.has(moduleName)) {
      throw new Error(`Module ${moduleName} is not loaded`);
    }
    
    const module = this.modules.get(moduleName);
    
    try {
      console.log(`[Core Registry] [Hot-Reload] Starting reload of module: ${moduleName}`);
      
      // Clear require cache if requested
      if (clear_cache && this.moduleCache.has(moduleName)) {
        const cachedPath = this.moduleCache.get(moduleName);
        delete require.cache[require.resolve(cachedPath)];
        console.log(`[Core Registry] [Hot-Reload] Cleared cache for ${moduleName}`);
      }
      
      // Get the module file path from watcher or cache
      let modulePath = this.moduleWatchers.get(moduleName) || this.moduleCache.get(moduleName);
      
      if (!modulePath) {
        throw new Error(`Module path not found for ${moduleName} - cannot reload`);
      }
      
      // Validate module file exists
      if (!fs.existsSync(modulePath)) {
        throw new Error(`Module file not found: ${modulePath}`);
      }
      
      // Store old tool count for comparison
      const oldToolCount = module.tools.length;
      
      // Temporarily unload the module
      await this.unloadModule(moduleName, { force: true, preserve_config: true });
      
      // Start fresh module registration
      this.startModule(moduleName, module.category);
      
      // Reload the module
      const moduleExports = require(modulePath);
      
      if (!moduleExports.tools || !moduleExports.handleToolCall) {
        throw new Error('Module must export tools array and handleToolCall function');
      }
      
      // Validate tools if requested
      if (validate_tools) {
        for (const tool of moduleExports.tools) {
          if (!tool.name || !tool.description || !tool.inputSchema) {
            throw new Error(`Invalid tool definition in ${moduleName}: missing required properties`);
          }
        }
      }
      
      // Re-register tools with the server
      const server = global.mcpServerInstance;
      if (!server) {
        throw new Error('MCP server instance not available for reload');
      }
      
      for (const tool of moduleExports.tools) {
        const inputSchema = tool.inputSchema?.shape || tool.inputSchema;
        server.registerTool(tool.name, tool.description, inputSchema, 
          async (args) => await moduleExports.handleToolCall(tool.name, args)
        );
        this.registerTool(tool.name, server);
      }
      
      // Complete module registration
      await this.completeModule();
      
      // Re-enable hot-reload watching
      if (this.hotReloadEnabled) {
        this.enableHotReload(moduleName, modulePath);
      }
      
      // Update cache
      this.moduleCache.set(moduleName, modulePath);
      
      console.log(`[Core Registry] [Hot-Reload] ✅ Module ${moduleName} reloaded successfully`);
      
      return {
        success: true,
        old_tool_count: oldToolCount,
        new_tool_count: moduleExports.tools.length,
        cache_cleared: clear_cache,
        tools_validated: validate_tools,
        reload_time: new Date().toISOString()
      };
      
    } catch (error) {
      console.error(`[Core Registry] [Hot-Reload] Failed to reload ${moduleName}:`, error.message);
      throw error;
    }
  }

  /**
   * Toggle hot-reload for specific modules
   */
  async toggleModuleHotReload(moduleNames, enabled) {
    const results = {};
    
    for (const moduleName of moduleNames) {
      try {
        if (!this.modules.has(moduleName)) {
          results[moduleName] = { success: false, error: 'Module not found' };
          continue;
        }
        
        if (enabled) {
          // Enable watching for this module
          const modulePath = this.moduleCache.get(moduleName);
          if (modulePath) {
            this.enableHotReload(moduleName, modulePath);
            results[moduleName] = { success: true, watching: true };
          } else {
            results[moduleName] = { success: false, error: 'Module path not found' };
          }
        } else {
          // Disable watching for this module
          if (this.moduleWatchers.has(moduleName)) {
            const filePath = this.moduleWatchers.get(moduleName);
            fs.unwatchFile(filePath);
            this.moduleWatchers.delete(moduleName);
            results[moduleName] = { success: true, watching: false };
          } else {
            results[moduleName] = { success: true, watching: false, note: 'Was not being watched' };
          }
        }
      } catch (error) {
        results[moduleName] = { success: false, error: error.message };
      }
    }
    
    return {
      enabled,
      modules: results,
      global_enabled: this.hotReloadEnabled
    };
  }

  /**
   * Restart all file watchers
   */
  async restartFileWatchers() {
    console.log('[Core Registry] [Hot-Reload] Restarting all file watchers...');
    
    // Store current watchers
    const watchersToRestart = new Map(this.moduleWatchers);
    
    // Clear all watchers
    for (const [moduleName, filePath] of this.moduleWatchers) {
      fs.unwatchFile(filePath);
    }
    this.moduleWatchers.clear();
    
    // Restart watchers
    for (const [moduleName, filePath] of watchersToRestart) {
      this.enableHotReload(moduleName, filePath);
    }
    
    console.log(`[Core Registry] [Hot-Reload] ✅ Restarted ${watchersToRestart.size} file watchers`);
    
    return {
      restarted_count: watchersToRestart.size,
      active_watchers: this.moduleWatchers.size
    };
  }

  /**
   * Cleanup resources
   */
  async cleanup() {
    // Clear all file watchers
    for (const [moduleName, filePath] of this.moduleWatchers) {
      fs.unwatchFile(filePath);
    }
    this.moduleWatchers.clear();

    // Close database connection
    if (this.dbInitialized) {
      await this.db.close();
    }
    
    console.log('[Core Registry] Cleanup completed');
  }
}

module.exports = {
  CoreRegistry
};
