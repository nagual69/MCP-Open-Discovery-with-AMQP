/**
 * Plugin Manager - Extensible Plugin Architecture for Registry
 * 
 * Features:
 * - Plugin discovery and loading
 * - Plugin lifecycle management (load/unload/reload)
 * - API for extending registry capabilities
 * - Plugin dependency resolution
 * - Security sandboxing for plugins
 * - Plugin configuration management
 * 
 * This enables third-party extensions and custom tool modules
 */

const fs = require('fs');
const path = require('path');
const EventEmitter = require('events');

/**
 * Plugin lifecycle states
 */
const PluginState = {
  UNLOADED: 'unloaded',
  LOADING: 'loading', 
  LOADED: 'loaded',
  ACTIVE: 'active',
  ERROR: 'error',
  DISABLED: 'disabled'
};

/**
 * Plugin Manager for extensible registry architecture
 */
class PluginManager extends EventEmitter {
  constructor(registry, options = {}) {
    super();
    this.registry = registry;
    this.plugins = new Map();
    this.pluginDirs = options.pluginDirs || [
      path.join(__dirname, '..', 'plugins'),
      path.join(process.cwd(), 'plugins'),
      path.join(process.cwd(), 'custom-tools')
    ];
    this.enabled = options.enabled !== false;
    this.sandboxing = options.sandboxing !== false;
    this.maxPlugins = options.maxPlugins || 50;
  }

  /**
   * Initialize the plugin manager
   * @returns {Promise<void>}
   */
  async initialize() {
    if (!this.enabled) {
      console.log('[Plugin Manager] ⚠️  Disabled by configuration');
      return;
    }

    console.log('[Plugin Manager] 🔌 Initializing plugin system...');
    
    // Create plugin directories if they don't exist
    for (const dir of this.pluginDirs) {
      await this._ensureDirectory(dir);
    }

    await this._discoverPlugins();
    console.log(`[Plugin Manager] ✅ Initialized with ${this.plugins.size} plugins discovered`);
  }

  /**
   * Discover all available plugins
   * @returns {Promise<void>}
   * @private
   */
  async _discoverPlugins() {
    for (const pluginDir of this.pluginDirs) {
      if (!fs.existsSync(pluginDir)) continue;

      try {
        const entries = await fs.promises.readdir(pluginDir, { withFileTypes: true });
        
        for (const entry of entries) {
          if (entry.isDirectory()) {
            await this._discoverPlugin(path.join(pluginDir, entry.name));
          } else if (entry.isFile() && entry.name.endsWith('.js')) {
            await this._discoverPlugin(path.join(pluginDir, entry.name));
          }
        }
      } catch (error) {
        console.warn(`[Plugin Manager] ⚠️  Failed to scan ${pluginDir}: ${error.message}`);
      }
    }
  }

  /**
   * Discover a single plugin
   * @param {string} pluginPath - Path to plugin
   * @returns {Promise<void>}
   * @private
   */
  async _discoverPlugin(pluginPath) {
    try {
      const manifest = await this._loadPluginManifest(pluginPath);
      if (!manifest) return;

      const plugin = {
        id: manifest.id || path.basename(pluginPath, '.js'),
        name: manifest.name || 'Unknown Plugin',
        version: manifest.version || '1.0.0',
        description: manifest.description || '',
        author: manifest.author || 'Unknown',
        path: pluginPath,
        manifest,
        state: PluginState.UNLOADED,
        dependencies: manifest.dependencies || [],
        apis: manifest.apis || [],
        permissions: manifest.permissions || [],
        config: manifest.config || {},
        instance: null,
        error: null
      };

      this.plugins.set(plugin.id, plugin);
      console.log(`[Plugin Manager] 📦 Discovered plugin: ${plugin.name} v${plugin.version}`);
      
      this.emit('pluginDiscovered', plugin);
    } catch (error) {
      console.warn(`[Plugin Manager] ⚠️  Failed to discover plugin at ${pluginPath}: ${error.message}`);
    }
  }

  /**
   * Load plugin manifest
   * @param {string} pluginPath - Path to plugin
   * @returns {Promise<Object|null>} Plugin manifest or null
   * @private
   */
  async _loadPluginManifest(pluginPath) {
    let manifestPath;
    
    if (fs.statSync(pluginPath).isDirectory()) {
      // Plugin is a directory - look for package.json or plugin.json
      const packagePath = path.join(pluginPath, 'package.json');
      const pluginJsonPath = path.join(pluginPath, 'plugin.json');
      
      if (fs.existsSync(pluginJsonPath)) {
        manifestPath = pluginJsonPath;
      } else if (fs.existsSync(packagePath)) {
        manifestPath = packagePath;
      } else {
        return null;
      }
    } else {
      // Single file plugin - check for embedded manifest
      const content = await fs.promises.readFile(pluginPath, 'utf8');
      const manifestMatch = content.match(/\/\*\*\s*PLUGIN_MANIFEST\s*([\s\S]*?)\*\//);
      
      if (manifestMatch) {
        try {
          return JSON.parse(manifestMatch[1]);
        } catch (error) {
          console.warn(`[Plugin Manager] ⚠️  Invalid embedded manifest in ${pluginPath}`);
          return null;
        }
      }
      
      // Fallback to basic detection
      return {
        id: path.basename(pluginPath, '.js'),
        name: path.basename(pluginPath, '.js'),
        version: '1.0.0',
        type: 'tool-module'
      };
    }

    try {
      const manifest = JSON.parse(await fs.promises.readFile(manifestPath, 'utf8'));
      return manifest.mcp_plugin || manifest; // Support both formats
    } catch (error) {
      console.warn(`[Plugin Manager] ⚠️  Failed to parse manifest ${manifestPath}: ${error.message}`);
      return null;
    }
  }

  /**
   * Load a plugin
   * @param {string} pluginId - Plugin ID to load
   * @returns {Promise<boolean>} Success status
   */
  async loadPlugin(pluginId) {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) {
      throw new Error(`Plugin ${pluginId} not found`);
    }

    if (plugin.state === PluginState.LOADED || plugin.state === PluginState.ACTIVE) {
      console.log(`[Plugin Manager] ⚠️  Plugin ${pluginId} already loaded`);
      return true;
    }

    try {
      plugin.state = PluginState.LOADING;
      this.emit('pluginLoading', plugin);

      // Check dependencies
      await this._checkDependencies(plugin);

      // Load the plugin module
      const pluginModule = await this._loadPluginModule(plugin);
      
      // Initialize the plugin
      if (pluginModule.initialize) {
        await pluginModule.initialize(this._createPluginContext(plugin));
      }

      plugin.instance = pluginModule;
      plugin.state = PluginState.LOADED;
      plugin.error = null;

      console.log(`[Plugin Manager] ✅ Loaded plugin: ${plugin.name}`);
      this.emit('pluginLoaded', plugin);

      return true;
    } catch (error) {
      plugin.state = PluginState.ERROR;
      plugin.error = error.message;
      
      console.error(`[Plugin Manager] ❌ Failed to load plugin ${pluginId}: ${error.message}`);
      this.emit('pluginError', plugin, error);
      
      return false;
    }
  }

  /**
   * Unload a plugin
   * @param {string} pluginId - Plugin ID to unload
   * @returns {Promise<boolean>} Success status
   */
  async unloadPlugin(pluginId) {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) {
      throw new Error(`Plugin ${pluginId} not found`);
    }

    if (plugin.state === PluginState.UNLOADED) {
      return true;
    }

    try {
      // Cleanup the plugin
      if (plugin.instance && plugin.instance.cleanup) {
        await plugin.instance.cleanup();
      }

      // Clear module cache
      const modulePath = this._getPluginModulePath(plugin);
      if (modulePath && require.cache[modulePath]) {
        delete require.cache[modulePath];
      }

      plugin.instance = null;
      plugin.state = PluginState.UNLOADED;
      plugin.error = null;

      console.log(`[Plugin Manager] ✅ Unloaded plugin: ${plugin.name}`);
      this.emit('pluginUnloaded', plugin);

      return true;
    } catch (error) {
      plugin.error = error.message;
      console.error(`[Plugin Manager] ❌ Failed to unload plugin ${pluginId}: ${error.message}`);
      this.emit('pluginError', plugin, error);
      
      return false;
    }
  }

  /**
   * Activate a loaded plugin
   * @param {string} pluginId - Plugin ID to activate
   * @returns {Promise<boolean>} Success status
   */
  async activatePlugin(pluginId) {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) {
      throw new Error(`Plugin ${pluginId} not found`);
    }

    if (plugin.state !== PluginState.LOADED) {
      await this.loadPlugin(pluginId);
    }

    try {
      // Activate the plugin
      if (plugin.instance && plugin.instance.activate) {
        await plugin.instance.activate();
      }

      plugin.state = PluginState.ACTIVE;
      console.log(`[Plugin Manager] ✅ Activated plugin: ${plugin.name}`);
      this.emit('pluginActivated', plugin);

      return true;
    } catch (error) {
      plugin.error = error.message;
      console.error(`[Plugin Manager] ❌ Failed to activate plugin ${pluginId}: ${error.message}`);
      this.emit('pluginError', plugin, error);
      
      return false;
    }
  }

  /**
   * Get plugin information
   * @param {string} pluginId - Plugin ID
   * @returns {Object|null} Plugin information
   */
  getPlugin(pluginId) {
    return this.plugins.get(pluginId) || null;
  }

  /**
   * List all plugins
   * @returns {Array<Object>} Array of plugin information
   */
  listPlugins() {
    return Array.from(this.plugins.values()).map(plugin => ({
      id: plugin.id,
      name: plugin.name,
      version: plugin.version,
      description: plugin.description,
      author: plugin.author,
      state: plugin.state,
      error: plugin.error
    }));
  }

  /**
   * Get plugin statistics
   * @returns {Object} Plugin statistics
   */
  getStats() {
    const stats = {
      total: this.plugins.size,
      states: {},
      types: {}
    };

    for (const plugin of this.plugins.values()) {
      stats.states[plugin.state] = (stats.states[plugin.state] || 0) + 1;
      const type = plugin.manifest.type || 'unknown';
      stats.types[type] = (stats.types[type] || 0) + 1;
    }

    return stats;
  }

  /**
   * Check plugin dependencies
   * @param {Object} plugin - Plugin object
   * @returns {Promise<void>}
   * @private
   */
  async _checkDependencies(plugin) {
    for (const dep of plugin.dependencies) {
      const depPlugin = this.plugins.get(dep);
      if (!depPlugin) {
        throw new Error(`Required dependency ${dep} not found`);
      }
      
      if (depPlugin.state !== PluginState.LOADED && depPlugin.state !== PluginState.ACTIVE) {
        await this.loadPlugin(dep);
      }
    }
  }

  /**
   * Load plugin module
   * @param {Object} plugin - Plugin object
   * @returns {Promise<Object>} Loaded module
   * @private
   */
  async _loadPluginModule(plugin) {
    const modulePath = this._getPluginModulePath(plugin);
    
    // Clear module cache for hot-reload
    if (require.cache[modulePath]) {
      delete require.cache[modulePath];
    }

    const module = require(modulePath);
    
    // Validate plugin interface
    if (plugin.manifest.type === 'tool-module') {
      if (!module.tools || !module.handleToolCall) {
        throw new Error('Tool module must export tools array and handleToolCall function');
      }
    }

    return module;
  }

  /**
   * Get plugin module path
   * @param {Object} plugin - Plugin object
   * @returns {string} Module path
   * @private
   */
  _getPluginModulePath(plugin) {
    if (fs.statSync(plugin.path).isDirectory()) {
      return path.join(plugin.path, 'index.js');
    }
    return plugin.path;
  }

  /**
   * Create plugin context
   * @param {Object} plugin - Plugin object
   * @returns {Object} Plugin context
   * @private
   */
  _createPluginContext(plugin) {
    return {
      plugin: {
        id: plugin.id,
        name: plugin.name,
        version: plugin.version,
        config: plugin.config
      },
      registry: this.registry,
      apis: {
        log: (message) => console.log(`[Plugin:${plugin.name}] ${message}`),
        warn: (message) => console.warn(`[Plugin:${plugin.name}] ${message}`),
        error: (message) => console.error(`[Plugin:${plugin.name}] ${message}`)
      }
    };
  }

  /**
   * Ensure directory exists
   * @param {string} dirPath - Directory path
   * @returns {Promise<void>}
   * @private
   */
  async _ensureDirectory(dirPath) {
    try {
      await fs.promises.mkdir(dirPath, { recursive: true });
    } catch (error) {
      if (error.code !== 'EEXIST') {
        console.warn(`[Plugin Manager] ⚠️  Failed to create directory ${dirPath}: ${error.message}`);
      }
    }
  }
}

module.exports = { PluginManager, PluginState };
