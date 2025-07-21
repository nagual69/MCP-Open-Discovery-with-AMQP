/**
 * ToolRegistrationTracker - Dynamic MCP Tool Registry with Hot-Reload
 * 
 * Core system for managing MCP tool modules with:
 * - Dynamic loading/unloading
 * - Hot-reload capabilities with file watchers
 * - Module dependency tracking
 * - Performance analytics
 * - SQLite persistence integration
 */

const fs = require('fs').promises;
const fswatcher = require('fs');
const path = require('path');
const { DynamicRegistryDB } = require('./dynamic_registry_db');

class ToolRegistrationTracker {
  constructor(server, dbPath = null) {
    this.server = server;
    this.modules = new Map();
    this.moduleWatchers = new Map(); 
    this.hotReloadEnabled = true;
    this.dbInitialized = false;
    
    // Initialize database if path provided
    if (dbPath) {
      this.initializeDatabase(dbPath);
    }
  }

  async initializeDatabase(dbPath) {
    try {
      this.db = new DynamicRegistryDB(dbPath);
      await this.db.initialize();
      this.dbInitialized = true;
      
      // Check if hot-reload was previously enabled
      const config = await this.db.getConfig('hot_reload');
      if (config) {
        this.hotReloadEnabled = config.value === 'true';
      }
      
      console.log(`[ToolTracker] Database initialized: ${dbPath}`);
    } catch (error) {
      console.warn(`[ToolTracker] Database init failed: ${error.message}`);
    }
  }

  /**
   * Register a module and its tools with the server
   */
  async registerModule(modulePath, moduleName, category, exportName = 'handleToolCall') {
    try {
      console.log(`[ToolTracker] Loading module: ${moduleName} from ${modulePath}`);

      // Load the module dynamically
      delete require.cache[require.resolve(modulePath)];
      const moduleObj = require(modulePath);

      if (!moduleObj.tools || !Array.isArray(moduleObj.tools)) {
        throw new Error(`Module ${moduleName} does not export valid tools array`);
      }

      if (!moduleObj[exportName] || typeof moduleObj[exportName] !== 'function') {
        throw new Error(`Module ${moduleName} does not export ${exportName} function`);
      }

      // Register each tool with the server
      const registeredTools = [];
      for (const tool of moduleObj.tools) {
        try {
          this.server.tool(
            tool.name,
            tool.description,
            tool.inputSchema,
            async (args) => moduleObj[exportName](tool.name, args)
          );
          registeredTools.push(tool.name);
        } catch (error) {
          console.error(`[ToolTracker] Failed to register tool ${tool.name}: ${error.message}`);
        }
      }

      // Store module metadata
      const moduleInfo = {
        name: moduleName,
        path: modulePath,
        category: category,
        exportName: exportName,
        tools: registeredTools,
        loadedAt: new Date(),
        reloadCount: 0
      };

      this.modules.set(moduleName, moduleInfo);

      // Persist to database
      if (this.dbInitialized) {
        await this.db.registerModule(moduleName, modulePath, category, registeredTools.length);
        for (const toolName of registeredTools) {
          await this.db.registerTool(toolName, moduleName, true, 'active');
        }
      }

      // Set up file watcher for hot-reload
      if (this.hotReloadEnabled) {
        this.setupFileWatcher(modulePath, moduleName);
      }

      console.log(`[ToolTracker] ✅ Module ${moduleName} registered with ${registeredTools.length} tools`);
      return registeredTools.length;

    } catch (error) {
      console.error(`[ToolTracker] Failed to register module ${moduleName}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Unregister a module and all its tools
   */
  async unregisterModule(moduleName) {
    try {
      const moduleInfo = this.modules.get(moduleName);
      if (!moduleInfo) {
        throw new Error(`Module ${moduleName} not found`);
      }

      console.log(`[ToolTracker] Unloading module: ${moduleName}`);

      // Remove tools from server (Note: MCP SDK doesn't have built-in tool removal)
      // This is a limitation we document
      console.log(`[ToolTracker] ⚠️  Note: ${moduleInfo.tools.length} tools from ${moduleName} remain registered (MCP SDK limitation)`);

      // Clean up file watcher
      if (this.moduleWatchers.has(moduleName)) {
        this.moduleWatchers.get(moduleName).close();
        this.moduleWatchers.delete(moduleName);
      }

      // Remove from module cache
      delete require.cache[require.resolve(moduleInfo.path)];

      // Update database
      if (this.dbInitialized) {
        await this.db.unregisterModule(moduleName);
      }

      // Remove from tracking
      this.modules.delete(moduleName);

      console.log(`[ToolTracker] ✅ Module ${moduleName} unregistered`);
      return true;

    } catch (error) {
      console.error(`[ToolTracker] Failed to unregister module ${moduleName}: ${error.message}`);
      return false;
    }
  }

  /**
   * Hot-reload a module with file watching
   */
  async reloadModule(moduleName) {
    try {
      const moduleInfo = this.modules.get(moduleName);
      if (!moduleInfo) {
        throw new Error(`Module ${moduleName} not found`);
      }

      console.log(`[ToolTracker] Hot-reloading module: ${moduleName}`);

      // Increment reload counter
      moduleInfo.reloadCount++;

      // Clear require cache
      delete require.cache[require.resolve(moduleInfo.path)];

      // Re-register the module
      await this.registerModule(
        moduleInfo.path,
        moduleInfo.name,
        moduleInfo.category,
        moduleInfo.exportName
      );

      // Update database analytics
      if (this.dbInitialized) {
        await this.db.recordModuleEvent(moduleName, 'hot_reload', {
          reload_count: moduleInfo.reloadCount,
          timestamp: new Date().toISOString()
        });
      }

      console.log(`[ToolTracker] ✅ Module ${moduleName} hot-reloaded (count: ${moduleInfo.reloadCount})`);

    } catch (error) {
      console.error(`[ToolTracker] Hot-reload failed for ${moduleName}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Set up file watcher for automatic hot-reload
   */
  setupFileWatcher(modulePath, moduleName) {
    try {
      if (this.moduleWatchers.has(moduleName)) {
        this.moduleWatchers.get(moduleName).close();
      }

      const watcher = fswatcher.watch(modulePath, (eventType) => {
        if (eventType === 'change') {
          console.log(`[ToolTracker] File changed: ${modulePath}, auto-reloading...`);
          this.reloadModule(moduleName).catch(error => {
            console.error(`[ToolTracker] Auto-reload failed: ${error.message}`);
          });
        }
      });

      this.moduleWatchers.set(moduleName, watcher);
      console.log(`[ToolTracker] 👀 File watcher active for: ${moduleName}`);

    } catch (error) {
      console.warn(`[ToolTracker] Could not set up file watcher for ${modulePath}: ${error.message}`);
    }
  }

  /**
   * Get comprehensive module status
   */
  getModuleStatus() {
    const modules = [];
    for (const [name, info] of this.modules) {
      modules.push({
        name: name,
        category: info.category,
        tools: info.tools.length,
        loadedAt: info.loadedAt,
        reloadCount: info.reloadCount,
        hasWatcher: this.moduleWatchers.has(name)
      });
    }

    return {
      totalModules: this.modules.size,
      totalTools: modules.reduce((sum, m) => sum + m.tools, 0),
      hotReloadEnabled: this.hotReloadEnabled,
      activeWatchers: this.moduleWatchers.size,
      modules: modules
    };
  }

  /**
   * Get analytics from database
   */
  async getAnalytics() {
    if (!this.dbInitialized) {
      return { message: 'Database not initialized' };
    }

    try {
      const stats = await this.db.getModuleStats();
      const events = await this.db.getModuleEvents(null, 10); // Last 10 events
      
      return {
        database_stats: stats,
        recent_events: events,
        tracking_active: true
      };
    } catch (error) {
      return { 
        error: error.message,
        tracking_active: false
      };
    }
  }

  /**
   * Dynamic module loading interface
   */
  async loadModule(modulePath, moduleName, category, exportName = 'handleToolCall') {
    return await this.registerModule(modulePath, moduleName, category, exportName);
  }

  /**
   * Dynamic module unloading interface  
   */
  async unloadModule(moduleName) {
    return await this.unregisterModule(moduleName);
  }

  /**
   * Clean up all watchers and resources
   */
  cleanup() {
    console.log(`[ToolTracker] Cleaning up ${this.moduleWatchers.size} file watchers...`);
    
    for (const [moduleName, watcher] of this.moduleWatchers) {
      try {
        watcher.close();
      } catch (error) {
        console.warn(`[ToolTracker] Error closing watcher for ${moduleName}: ${error.message}`);
      }
    }
    
    this.moduleWatchers.clear();
    
    if (this.dbInitialized && this.db) {
      this.db.close();
    }
    
    console.log(`[ToolTracker] ✅ Cleanup complete`);
  }
}

module.exports = { ToolRegistrationTracker };
