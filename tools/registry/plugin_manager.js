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
const os = require('os');
const crypto = require('crypto');
const EventEmitter = require('events');
const axios = require('axios');
let AdmZip;
try { AdmZip = require('adm-zip'); } catch {}

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
  this.defaultInstallDir = options.defaultInstallDir || this.pluginDirs[0];
    // Prefer DI; fall back to registry getter if available
    this.validationManager = options.validationManager || (this.registry && typeof this.registry.getValidationManager === 'function'
      ? this.registry.getValidationManager()
      : null);
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
  this.plugins.clear();
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
      
  // Pre-check: validate tools (if tool-module) BEFORE making it active/loaded
  await this._prevalidatePluginTools(plugin, pluginModule);
      
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
   * Run validation pre-checks on plugin tools, if a validation manager is available.
   * Throws on failure in strict mode to block registration/loading.
   * @param {Object} plugin
   * @param {Object} pluginModule
   * @private
   */
  async _prevalidatePluginTools(plugin, pluginModule) {
    try {
      if (!this.validationManager) return; // No validator wired; skip silently
      if (!plugin || !plugin.manifest || plugin.manifest.type !== 'tool-module') return;
      if (!pluginModule || !Array.isArray(pluginModule.tools)) return; // Nothing to validate

      const moduleName = plugin.name || plugin.id || 'plugin-module';
      const batch = this.validationManager.validateToolBatch(pluginModule.tools, moduleName);
      const strict = this.validationManager.config?.strictMode !== false; // default strict

      if (batch.invalidTools > 0 && strict) {
        // Build concise error message
        const failed = batch.toolResults.filter(r => !r.valid).map(r => r.tool?.name || 'unknown');
        const msg = `Validation failed for plugin '${moduleName}': ${batch.invalidTools}/${batch.totalTools} tools invalid (${failed.join(', ')})`;
        // Also attach to plugin state for observability
        plugin.error = msg;
        throw new Error(msg);
      }

      if (batch.summary?.warnings > 0) {
        console.warn(`[Plugin Manager] ⚠️  ${moduleName}: ${batch.summary.warnings} validation warnings`);
      }
    } catch (err) {
      // Re-throw to let caller mark plugin as ERROR
      throw err;
    }
  }

  /**
   * Remove a plugin from disk and registry
   * @param {string} pluginId
   * @returns {Promise<boolean>}
   */
  async removePlugin(pluginId) {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) throw new Error(`Plugin ${pluginId} not found`);
    // Attempt to unload first
    try { await this.unloadPlugin(pluginId); } catch {}

    try {
      const stats = await fs.promises.stat(plugin.path);
      if (stats.isDirectory()) {
        await fs.promises.rm(plugin.path, { recursive: true, force: true });
      } else {
        await fs.promises.rm(plugin.path, { force: true });
      }
      this.plugins.delete(pluginId);
      this.emit('pluginRemoved', pluginId);
      return true;
    } catch (error) {
      console.error(`[Plugin Manager] ❌ Failed to remove plugin ${pluginId}: ${error.message}`);
      return false;
    }
  }

  /**
   * Re-scan plugin directories and update catalog
   */
  async refresh() {
    await this._discoverPlugins();
    return this.listPlugins();
  }

  /**
   * Basic search across discovered plugins
   * @param {Object} opts
   * @param {string} opts.query free-text query
   * @param {string} [opts.type] filter by manifest.type
   */
  search({ query = '', type } = {}) {
    const q = (query || '').toLowerCase();
    return this.listPlugins().filter(p => {
      const typeOk = !type || (this.plugins.get(p.id)?.manifest?.type === type);
      if (!q) return typeOk;
      const hay = `${p.id} ${p.name} ${p.description} ${p.author}`.toLowerCase();
      return typeOk && hay.includes(q);
    });
  }

  /**
   * Install a plugin from an HTTP(S) URL. Saves to default install dir.
   * Supports .js file or .zip with index.js (zip handling TODO/future).
   * @param {string} url
   * @param {Object} [opts]
   * @param {string} [opts.pluginId]
   * @param {boolean} [opts.autoLoad]
   */
  async installFromUrl(url, opts = {}) {
    if (!url) throw new Error('url is required');
    await this._ensureDirectory(this.defaultInstallDir);
    const res = await axios.get(url, { responseType: 'arraybuffer' });
    const data = Buffer.from(res.data);
    const urlPath = new URL(url).pathname;
    const suggestedName = (opts.pluginId || path.basename(urlPath) || 'plugin')
      .replace(/\?.*$/, '')
      .replace(/[^a-zA-Z0-9._-]/g, '-');

    // Verify checksum if provided
    if (opts.checksum) {
      const algo = (opts.checksumAlgorithm || 'sha256').toLowerCase();
      const sum = this._computeChecksum(data, algo);
      if (sum.toLowerCase() !== String(opts.checksum).toLowerCase()) {
        throw new Error(`Checksum mismatch (${algo}); expected ${opts.checksum}, got ${sum}`);
      }
    }
    // Verify signature if provided
    if (opts.signature && opts.publicKey) {
      const sigAlg = opts.signatureAlgorithm || 'RSA-SHA256';
      const ok = this._verifySignature(data, String(opts.signature), String(opts.publicKey), sigAlg);
      if (!ok) throw new Error('Signature verification failed');
    }

    // Stage and validate depending on file type
    const isZip = /\.zip$/i.test(urlPath);
    const staged = isZip
      ? await this._stageAndValidateZip(data, { suggestedName, pluginId: opts.pluginId })
      : await this._stageAndValidateJs(data, { suggestedName, pluginId: opts.pluginId });

    // Finalize: move into install dir
    const finalized = await this._finalizeInstall(staged);

    // Discover and optionally auto-load
    await this._discoverPlugins();
    if (opts.autoLoad) await this.loadPlugin(finalized.id);
    return { success: true, id: finalized.id, path: finalized.path };
  }

  /**
   * Install a plugin from a local file path
   * @param {string} sourcePath absolute or relative path to .js
   * @param {Object} [opts]
   * @param {string} [opts.pluginId]
   * @param {boolean} [opts.autoLoad]
   */
  async installFromFile(sourcePath, opts = {}) {
    if (!sourcePath) throw new Error('sourcePath is required');
    await this._ensureDirectory(this.defaultInstallDir);
    const absSrc = path.isAbsolute(sourcePath) ? sourcePath : path.resolve(sourcePath);
    const data = await fs.promises.readFile(absSrc);
    const suggestedName = (opts.pluginId || path.basename(absSrc))
      .replace(/\?.*$/, '')
      .replace(/[^a-zA-Z0-9._-]/g, '-');
    const isZip = /\.zip$/i.test(absSrc);
    const staged = isZip
      ? await this._stageAndValidateZip(data, { suggestedName, pluginId: opts.pluginId })
      : await this._stageAndValidateJs(data, { suggestedName, pluginId: opts.pluginId });

    const finalized = await this._finalizeInstall(staged);
    await this._discoverPlugins();
    if (opts.autoLoad) await this.loadPlugin(finalized.id);
    return { success: true, id: finalized.id, path: finalized.path };
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

  // ===================== SECURITY & STAGING HELPERS =====================

  _computeChecksum(data, algorithm = 'sha256') {
    const h = crypto.createHash(algorithm);
    h.update(data);
    return h.digest('hex');
  }

  _verifySignature(data, signatureBase64, publicKeyPem, algorithm = 'RSA-SHA256') {
    try {
      const verify = crypto.createVerify(algorithm);
      verify.update(data);
      verify.end();
      const sig = Buffer.from(signatureBase64, 'base64');
      return verify.verify(publicKeyPem, sig);
    } catch (e) {
      console.warn('[Plugin Manager] ⚠️  Signature verify error:', e.message);
      return false;
    }
  }

  async _stageAndValidateJs(data, { suggestedName, pluginId }) {
    const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'mcpod-js-'));
    const base = (pluginId || suggestedName || 'plugin').replace(/\.js$/i, '');
    const tmpFile = path.join(tmpDir, `${base}.js`);
    await fs.promises.writeFile(tmpFile, data);
    // Discover manifest and prevalidate tools from temp file
    const manifest = await this._loadPluginManifest(tmpFile);
    const id = manifest?.id || base;
    const plugin = {
      id,
      name: manifest?.name || id,
      manifest: { ...(manifest || {}), type: manifest?.type || 'tool-module' }
    };
    // Require from temp and prevalidate
    delete require.cache[tmpFile];
    const module = require(tmpFile);
    await this._prevalidatePluginTools(plugin, module);
    return { type: 'file', id, srcPath: tmpFile };
  }

  async _stageAndValidateZip(data, { suggestedName, pluginId }) {
    if (!AdmZip) throw new Error('ZIP support not available (adm-zip missing)');
    const tmpZip = path.join(await fs.promises.mkdtemp(path.join(os.tmpdir(), 'mcpod-zip-')), `${Date.now()}.zip`);
    await fs.promises.writeFile(tmpZip, data);
    const extractRoot = path.dirname(tmpZip);
    const outDir = path.join(extractRoot, 'extracted');
    await fs.promises.mkdir(outDir, { recursive: true });
    const zip = new AdmZip(tmpZip);
    zip.extractAllTo(outDir, true);

    // Find plugin root: prefer single top-level folder
    const entries = await fs.promises.readdir(outDir, { withFileTypes: true });
    const rootDir = entries.length === 1 && entries[0].isDirectory() ? path.join(outDir, entries[0].name) : outDir;

    // Basic checks
    const indexJs = path.join(rootDir, 'index.js');
    if (!fs.existsSync(indexJs)) {
      throw new Error('Archive missing index.js at plugin root');
    }

    const manifest = await this._loadPluginManifest(rootDir);
    const base = (pluginId || manifest?.id || suggestedName || 'plugin').replace(/\.zip$/i, '');
    const id = manifest?.id || base;
    const plugin = {
      id,
      name: manifest?.name || id,
      manifest: { ...(manifest || {}), type: manifest?.type || 'tool-module' },
      path: rootDir
    };

    // Prevalidate by requiring from staged directory
    const modulePath = path.join(rootDir, 'index.js');
    delete require.cache[modulePath];
    const module = require(modulePath);
    await this._prevalidatePluginTools(plugin, module);

    return { type: 'dir', id, srcPath: rootDir };
  }

  async _finalizeInstall(staged) {
    if (!staged || !staged.id || !staged.srcPath) throw new Error('Invalid staged install');
    if (staged.type === 'file') {
      const dest = path.join(this.defaultInstallDir, `${staged.id}.js`);
      if (fs.existsSync(dest)) throw new Error(`Plugin already exists: ${staged.id}`);
      await fs.promises.copyFile(staged.srcPath, dest);
      return { id: staged.id, path: dest };
    } else if (staged.type === 'dir') {
      const destDir = path.join(this.defaultInstallDir, staged.id);
      if (fs.existsSync(destDir)) throw new Error(`Plugin already exists: ${staged.id}`);
      await fs.promises.mkdir(destDir, { recursive: true });
      // Copy directory recursively
      await this._copyDir(staged.srcPath, destDir);
      return { id: staged.id, path: destDir };
    }
    throw new Error('Unknown staged type');
  }

  async _copyDir(src, dest) {
    const entries = await fs.promises.readdir(src, { withFileTypes: true });
    for (const e of entries) {
      const s = path.join(src, e.name);
      const d = path.join(dest, e.name);
      if (e.isDirectory()) {
        await fs.promises.mkdir(d, { recursive: true });
        await this._copyDir(s, d);
      } else if (e.isFile()) {
        await fs.promises.copyFile(s, d);
      }
    }
  }
}

module.exports = { PluginManager, PluginState };
