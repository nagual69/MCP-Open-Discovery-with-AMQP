/**
 * Hot-Reload Manager - MCP Open Discovery
 * 
 * Focused manager for module hot-reloading capabilities:
 * - File system watching
 * - Module cache management  
 * - Safe reload operations
 * - Validation after reload
 * 
 * DESIGN PRINCIPLES:
 * - Single Purpose: Only handles hot-reload functionality
 * - Safe Operations: Validate before/after reload
 * - Clear Lifecycle: Enable/disable, watch/unwatch patterns
 * - Error Recovery: Graceful handling of reload failures
 */

const fs = require('fs');
const path = require('path');
const chokidar = require('chokidar');

/**
 * Hot-Reload states
 */
const HOTRELOAD_STATES = {
  DISABLED: 'disabled',
  ENABLED: 'enabled',
  WATCHING: 'watching',
  RELOADING: 'reloading',
  ERROR: 'error'
};

/**
 * Hot-Reload Manager - Clean implementation
 */
class HotReloadManager {
  constructor(registry, logger = console) {
    this.registry = registry;
    this.logger = logger;
    
    // State management
    this.state = HOTRELOAD_STATES.DISABLED;
    this.enabled = false;
    
    // Watching infrastructure
    this.watchers = new Map();        // moduleName -> FSWatcher
    this.moduleFilePaths = new Map(); // moduleName -> absolute file path
    this.lastReloadTimes = new Map(); // moduleName -> timestamp
    
    // Cache management
    this.moduleCache = new Map();     // moduleName -> module exports
    this.reloadStats = new Map();     // moduleName -> reload statistics
  this.pendingReloads = new Map();  // moduleName -> timeout id (debounce)
  this.onAfterReload = null;        // callback(moduleName, result)
  this.pluginWatchers = new Map(); // pluginId -> FSWatcher (dist)
    
    // Configuration
    this.watchOptions = {
      ignored: /(^|[\/\\])\../, // ignore dotfiles
      persistent: true,
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: 1000,
        pollInterval: 100
      }
    };
    
    this.logger.log('[Hot-Reload] Manager initialized');
  }

  /**
   * Enable hot-reload capabilities
   */
  enable() {
    if (this.enabled) {
      this.logger.log('[Hot-Reload] Already enabled');
      return;
    }
    
    this.enabled = true;
    this.state = HOTRELOAD_STATES.ENABLED;
    this.logger.log('[Hot-Reload] ✅ Enabled');

    // Auto-restore file watchers for any previously known module file paths
    try {
      let restored = 0;
      for (const [moduleName, filePath] of this.moduleFilePaths) {
        if (!this.watchers.has(moduleName)) {
          this.watchModule(moduleName, filePath);
          if (this.watchers.has(moduleName)) restored++;
        }
      }
      if (restored > 0) {
        this.logger.log(`[Hot-Reload] 🔁 Restored watchers for ${restored} module(s)`);
      }
    } catch (err) {
      this.logger.warn('[Hot-Reload] Failed to restore watchers on enable:', err.message);
    }
  }

  /**
   * Disable hot-reload capabilities
   */
  disable() {
    if (!this.enabled) {
      this.logger.log('[Hot-Reload] Already disabled');
      return;
    }
    
    // Stop all watchers
    this.stopAllWatchers();
    
    this.enabled = false;
    this.state = HOTRELOAD_STATES.DISABLED;
    this.logger.log('[Hot-Reload] ❌ Disabled');
  }

  /**
   * Toggle hot-reload state
   * @returns {Object} New state
   */
  toggle() {
    if (this.enabled) {
      this.disable();
    } else {
      this.enable();
    }
    
    return this.getStatus();
  }

  /**
   * Start watching a module file for changes
   * @param {string} moduleName - Name of the module
   * @param {string} moduleFilePath - Absolute path to module file
   */
  watchModule(moduleName, moduleFilePath) {
    if (!this.enabled) {
      this.logger.log(`[Hot-Reload] Cannot watch ${moduleName}: hot-reload disabled`);
      return;
    }

    if (this.watchers.has(moduleName)) {
      this.logger.log(`[Hot-Reload] Already watching: ${moduleName}`);
      return;
    }

    if (!fs.existsSync(moduleFilePath)) {
      this.logger.warn(`[Hot-Reload] Module file not found: ${moduleFilePath}`);
      return;
    }

    try {
      const watcher = chokidar.watch(moduleFilePath, this.watchOptions);
      
      watcher.on('change', async (filePath) => {
        this.logger.log(`[Hot-Reload] 📝 File changed: ${path.basename(filePath)}`);
        // Simple debounce per module to avoid cascades
        const existing = this.pendingReloads.get(moduleName);
        if (existing) clearTimeout(existing);
        const tid = setTimeout(async () => {
          this.pendingReloads.delete(moduleName);
          const res = await this.reloadModule(moduleName).catch(err => ({ success: false, error: err.message }));
          if (this.onAfterReload) {
            try { await this.onAfterReload(moduleName, res); } catch (e) { this.logger.warn('[Hot-Reload] onAfterReload error:', e.message); }
          }
        }, 250);
        this.pendingReloads.set(moduleName, tid);
      });

      watcher.on('error', (error) => {
        this.logger.error(`[Hot-Reload] Watcher error for ${moduleName}:`, error.message);
        this.stopWatching(moduleName);
      });

      this.watchers.set(moduleName, watcher);
      this.moduleFilePaths.set(moduleName, moduleFilePath);
      
      this.state = HOTRELOAD_STATES.WATCHING;
      this.logger.log(`[Hot-Reload] 👁️  Watching: ${moduleName}`);
      
    } catch (error) {
      this.logger.error(`[Hot-Reload] Failed to watch ${moduleName}:`, error.message);
    }
  }

  /**
   * Stop watching a specific module
   * @param {string} moduleName - Name of the module
   */
  stopWatching(moduleName) {
    const watcher = this.watchers.get(moduleName);
    if (!watcher) {
      this.logger.log(`[Hot-Reload] Not watching: ${moduleName}`);
      return;
    }

    try {
      watcher.close();
      this.watchers.delete(moduleName);
  // IMPORTANT: Do NOT delete moduleFilePaths here so we can restore later
  this.logger.log(`[Hot-Reload] 🛑 Stopped watching: ${moduleName} (path retained for restore)`);
    } catch (error) {
      this.logger.warn(`[Hot-Reload] Error stopping watcher for ${moduleName}:`, error.message);
    }
  }

  /**
   * Stop all watchers
   */
  stopAllWatchers() {
    const moduleNames = Array.from(this.watchers.keys());
    for (const moduleName of moduleNames) {
      this.stopWatching(moduleName);
    }
    
    if (moduleNames.length > 0) {
      this.logger.log(`[Hot-Reload] 🛑 Stopped watching ${moduleNames.length} modules`);
    }
  // Clear any pending debounces
  for (const [, tid] of this.pendingReloads) { try { clearTimeout(tid); } catch {} }
  this.pendingReloads.clear();
  // Stop plugin watchers
  for (const [, w] of this.pluginWatchers) { try { w.close(); } catch {} }
  this.pluginWatchers.clear();
  }

  /**
   * Reload a specific module
   * @param {string} moduleName - Name of the module to reload
   * @param {Object} options - Reload options
   * @returns {Promise<Object>} Reload result
   */
  async reloadModule(moduleName, options = {}) {
    const {
      clearCache = true,
      validateTools = true,
      force = false
    } = options;

    if (!this.enabled && !force) {
      throw new Error('Hot-reload is disabled');
    }

    this.state = HOTRELOAD_STATES.RELOADING;
    const startTime = Date.now();

    try {
      this.logger.log(`[Hot-Reload] 🔄 Reloading module: ${moduleName}`);

      // Get module file path
      const moduleFilePath = this.moduleFilePaths.get(moduleName);
      if (!moduleFilePath) {
        throw new Error(`Module file path not found for: ${moduleName}`);
      }

      // Clear require cache if requested
      if (clearCache) {
        this._clearModuleCache(moduleFilePath);
      }

      // Reload the module
      const reloadedModule = require(moduleFilePath);
      
      // Validate the reloaded module
      if (validateTools) {
        this._validateReloadedModule(reloadedModule, moduleName);
      }

      // Update cache
      this.moduleCache.set(moduleName, reloadedModule);
      this.lastReloadTimes.set(moduleName, Date.now());

      // Update statistics
      const duration = Date.now() - startTime;
      this._updateReloadStats(moduleName, duration, true);

      this.state = HOTRELOAD_STATES.WATCHING;
      
      const result = {
        success: true,
        moduleName,
        duration,
        timestamp: new Date(),
        toolsValidated: validateTools,
        cacheCleared: clearCache
      };

      this.logger.log(`[Hot-Reload] ✅ Reloaded ${moduleName} (${duration}ms)`);
      return result;

    } catch (error) {
      this.state = HOTRELOAD_STATES.ERROR;
      this._updateReloadStats(moduleName, Date.now() - startTime, false, error.message);
      
      this.logger.error(`[Hot-Reload] ❌ Failed to reload ${moduleName}:`, error.message);
      
      return {
        success: false,
        moduleName,
        error: error.message,
        duration: Date.now() - startTime,
        timestamp: new Date()
      };
    }
  }

  /**
   * Get hot-reload status and statistics
   * @returns {Object} Status information
   */
  getStatus() {
    const status = {
      enabled: this.enabled,
      state: this.state,
      watchedModules: this.watchers.size,
      cachedModules: this.moduleCache.size,
      totalReloads: 0,
      successfulReloads: 0,
      failedReloads: 0
    };

    // Calculate reload statistics
    for (const [moduleName, stats] of this.reloadStats) {
      status.totalReloads += stats.totalReloads;
      status.successfulReloads += stats.successfulReloads;
      status.failedReloads += stats.failedReloads;
    }

    // Add module details
    status.modules = {};
    for (const [moduleName, filePath] of this.moduleFilePaths) {
      const stats = this.reloadStats.get(moduleName) || {};
      const lastReload = this.lastReloadTimes.get(moduleName);
      
      status.modules[moduleName] = {
        watching: this.watchers.has(moduleName),
        filePath: filePath,
        lastReload: lastReload ? new Date(lastReload) : null,
        reloads: stats.totalReloads || 0,
        lastError: stats.lastError || null
      };
    }

    return status;
  }

  /**
   * Cleanup and shutdown
   */
  cleanup() {
    this.logger.log('[Hot-Reload] 🧹 Starting cleanup...');
    
    this.stopAllWatchers();
    this.moduleCache.clear();
    this.reloadStats.clear();
    this.lastReloadTimes.clear();
    this.moduleFilePaths.clear();
  for (const [, tid] of this.pendingReloads) { try { clearTimeout(tid); } catch {} }
  this.pendingReloads.clear();
  for (const [, w] of this.pluginWatchers) { try { w.close(); } catch {} }
  this.pluginWatchers.clear();
    
    this.state = HOTRELOAD_STATES.DISABLED;
    this.enabled = false;
    
    this.logger.log('[Hot-Reload] ✅ Cleanup complete');
  }

  // ========== PRIVATE METHODS ==========

  /**
   * Clear module from require cache
   * @param {string} moduleFilePath - Absolute path to module
   * @private
   */
  _clearModuleCache(moduleFilePath) {
    // Clear the main module
    delete require.cache[require.resolve(moduleFilePath)];
    
    // Clear any child modules in the same directory
    const moduleDir = path.dirname(moduleFilePath);
    const cacheKeys = Object.keys(require.cache);
    
    for (const key of cacheKeys) {
      if (key.startsWith(moduleDir) && key !== moduleFilePath) {
        delete require.cache[key];
      }
    }
    
    this.logger.log(`[Hot-Reload] 🗑️  Cleared cache for: ${path.basename(moduleFilePath)}`);
  }

  /**
   * Validate reloaded module structure
   * @param {Object} reloadedModule - The reloaded module
   * @param {string} moduleName - Name of the module
   * @private
   */
  _validateReloadedModule(reloadedModule, moduleName) {
    if (!reloadedModule) {
      throw new Error(`Reloaded module is null/undefined: ${moduleName}`);
    }

    if (!reloadedModule.tools || !Array.isArray(reloadedModule.tools)) {
      throw new Error(`Reloaded module missing 'tools' array: ${moduleName}`);
    }

    if (!reloadedModule.handleToolCall || typeof reloadedModule.handleToolCall !== 'function') {
      throw new Error(`Reloaded module missing 'handleToolCall' function: ${moduleName}`);
    }

    // Validate each tool has required properties
    for (let i = 0; i < reloadedModule.tools.length; i++) {
      const tool = reloadedModule.tools[i];
      if (!tool.name || !tool.description || !tool.inputSchema) {
        throw new Error(`Invalid tool at index ${i} in module ${moduleName}`);
      }
    }

    this.logger.log(`[Hot-Reload] ✅ Validated ${reloadedModule.tools.length} tools in ${moduleName}`);
  }

  /**
   * Update reload statistics for a module
   * @param {string} moduleName - Name of the module
   * @param {number} duration - Reload duration in ms
   * @param {boolean} success - Whether reload was successful
   * @param {string} error - Error message if failed
   * @private
   */
  _updateReloadStats(moduleName, duration, success, error = null) {
    if (!this.reloadStats.has(moduleName)) {
      this.reloadStats.set(moduleName, {
        totalReloads: 0,
        successfulReloads: 0,
        failedReloads: 0,
        averageDuration: 0,
        lastError: null,
        lastReload: null
      });
    }

    const stats = this.reloadStats.get(moduleName);
    stats.totalReloads++;
    stats.lastReload = new Date();

    if (success) {
      stats.successfulReloads++;
      stats.lastError = null;
    } else {
      stats.failedReloads++;
      stats.lastError = error;
    }

    // Update average duration
    stats.averageDuration = Math.round(
      (stats.averageDuration * (stats.totalReloads - 1) + duration) / stats.totalReloads
    );
  }

  /**
   * Set a callback that runs after each reload completes.
   * @param {(moduleName: string, result: object) => Promise<void>|void} cb
   */
  setAfterReloadCallback(cb) {
    this.onAfterReload = typeof cb === 'function' ? cb : null;
  }

  /**
   * Watch a spec plugin dist directory for changes (simplified). On change, emit a log; integration with plugin reload is future work.
   * @param {string} pluginId
   * @param {string} distDir absolute path
   */
  watchPlugin(pluginId, distDir) {
    if (!this.enabled) return;
    if (!fs.existsSync(distDir) || !fs.statSync(distDir).isDirectory()) return;
    if (this.pluginWatchers.has(pluginId)) return;
    try {
      const manifestPath = path.join(path.dirname(distDir), 'mcp-plugin.json');
      const watcher = chokidar.watch([distDir, manifestPath], { ...this.watchOptions, depth: 5 });
      const schedulePluginReload = (reason, filePath) => {
        const rel = filePath ? path.relative(distDir, filePath) : '';
        this.logger.log(`[Hot-Reload] 🔁 Plugin ${pluginId} ${reason}: ${rel}`);
        const key = `plugin:${pluginId}`;
        const existing = this.pendingReloads.get(key);
        if (existing) { try { clearTimeout(existing); } catch {} }
        const tid = setTimeout(async () => {
          this.pendingReloads.delete(key);
          try {
            const { getPluginManager } = require('./index');
            const pm = typeof getPluginManager === 'function' ? getPluginManager() : null;
            if (!pm || typeof pm.reloadPlugin !== 'function') {
              this.logger.warn(`[Hot-Reload] Plugin reload not available for ${pluginId}`);
              return;
            }
            this.logger.log(`[Hot-Reload] 🔄 Reloading plugin due to ${reason}: ${pluginId}`);
            await pm.reloadPlugin(pluginId);
            this.logger.log(`[Hot-Reload] ✅ Plugin reloaded: ${pluginId}`);
          } catch (e) {
            this.logger.warn(`[Hot-Reload] ⚠️ Plugin reload failed (${pluginId}): ${e.message}`);
          }
        }, 400);
        this.pendingReloads.set(key, tid);
      };
  watcher.on('change',   (filePath) => schedulePluginReload('change', filePath));
  watcher.on('add',      (filePath) => schedulePluginReload('add', filePath));
  watcher.on('unlink',   (filePath) => schedulePluginReload('unlink', filePath));
  watcher.on('addDir',   (filePath) => schedulePluginReload('addDir', filePath));
  watcher.on('unlinkDir',(filePath) => schedulePluginReload('unlinkDir', filePath));
      watcher.on('error', err => {
        this.logger.warn(`[Hot-Reload] Plugin watcher error (${pluginId}): ${err.message}`);
      });
      this.pluginWatchers.set(pluginId, watcher);
      this.logger.log(`[Hot-Reload] 👁️  Watching plugin dist: ${pluginId}`);
    } catch (e) {
      this.logger.warn(`[Hot-Reload] Failed to watch plugin ${pluginId}: ${e.message}`);
    }
  }
}

module.exports = {
  HotReloadManager,
  HOTRELOAD_STATES
};
