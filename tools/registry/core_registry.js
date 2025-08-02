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
