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
const { loadSpecPlugin, topoSortByDependencies, computeDistHash, computeDistHashDetailed } = require('./plugin_loader');
let AdmZip;
try { AdmZip = require('adm-zip'); } catch {}
// Optional credentials manager (used for trusted signing key retrieval)
let credentialsManager;
try { credentialsManager = require('../credentials_manager'); } catch {}

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
    // Security/policy flags
    this.policy = {
      requireChecksum: false,
      requireSignature: false,
      strictCapabilities: false,
      ...(options.policy || {})
    };
    if (process.env.PLUGIN_REQUIRE_SIGNED === 'true') {
      this.policy.requireSignature = true;
    }
    // Signature stub (Task10): allow REQUIRE_SIGNATURES (legacy alias) to demand signature presence
    if (process.env.REQUIRE_SIGNATURES === 'true' && !this.policy.requireSignature) {
      this.policy.requireSignature = true; // unify flag semantics
      console.log('[Plugin Manager] REQUIRE_SIGNATURES enabled (alias -> policy.requireSignature)');
    }
    // Cache for trusted keys
    this._trustedKeysCache = null;
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
      // Enforce v2 only
      if (manifest.manifestVersion && manifest.manifestVersion !== '2') {
        console.warn(`[Plugin Manager] ⚠️  Skipping non-v2 manifest at ${pluginPath}`);
        return;
      }

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
      // Plugin is a directory - look for mcp-plugin.json (spec), plugin.json, or package.json
      const mcpSpecPath = path.join(pluginPath, 'mcp-plugin.json');
      const packagePath = path.join(pluginPath, 'package.json');
      const pluginJsonPath = path.join(pluginPath, 'plugin.json');
      
      if (fs.existsSync(mcpSpecPath)) {
        manifestPath = mcpSpecPath;
      } else if (fs.existsSync(pluginJsonPath)) {
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

      // Two plugin flavors: Spec plugin (mcp-plugin.json) vs legacy tool-module
    if (plugin.manifest && plugin.manifest.entry) {
        // Validate dist hash for spec plugin if present (v2 requirement)
        try {
          if (plugin.manifest.manifestVersion === '2') {
            // Phase2 Task17: migrate existing lock file early (before hash check) if present
            try {
              const rootDir = fs.statSync(plugin.path).isDirectory() ? plugin.path : path.dirname(plugin.path);
              const lockPath = path.join(rootDir, 'install.lock.json');
              if (fs.existsSync(lockPath)) {
                let existing = {};
                try { existing = JSON.parse(await fs.promises.readFile(lockPath,'utf8')); } catch {}
                const needsUpgrade = !('dependenciesPolicy' in existing) || !('fileCountActual' in existing) || !('schemaPathOverride' in existing);
                if (needsUpgrade) {
                  await this._writeExtendedLock(rootDir, plugin.manifest, {
                    signatureVerified: existing.signatureVerified || plugin._signatureVerified,
                    signerKeyId: existing.signerKeyId || plugin._signerKeyId
                  });
                  console.log(`[Plugin Manager] 🔄 Migrated lock file to v2 schema for ${plugin.id}`);
                }
              }
            } catch (mErr) {
              console.warn(`[Plugin Manager] Lock migration skipped for ${plugin.id}: ${mErr.message}`);
            }
            const rootDir = fs.statSync(plugin.path).isDirectory() ? plugin.path : path.dirname(plugin.path);
            const distDir = path.join(rootDir, 'dist');
            if (!plugin.manifest.dist || !plugin.manifest.dist.hash) {
              throw new Error('v2 plugin missing dist.hash');
            }
            if (!fs.existsSync(distDir)) throw new Error('dist directory missing for plugin');
            const match = plugin.manifest.dist.hash.match(/^sha256:([a-fA-F0-9]{64})$/);
            if (!match) throw new Error('Invalid dist.hash format');
            const computed = computeDistHash(distDir);
            if (computed.toLowerCase() !== match[1].toLowerCase()) {
              throw new Error(`dist hash mismatch (manifest ${match[1]} != computed ${computed})`);
            }
            // Strict signature verification (if configured)
            try {
              await this._verifyPluginSignatureIfRequired(plugin, rootDir);
            } catch (sigErr) {
              // Quarantine plugin directory before failing
              try { await this._quarantinePlugin(plugin, rootDir, sigErr.message); } catch (qErr) {
                console.warn(`[Plugin Manager] Quarantine failed for ${plugin.id}: ${qErr.message}`);
              }
              throw sigErr;
            }
          }
        } catch (hashErr) {
          plugin.state = PluginState.ERROR;
          plugin.error = hashErr.message;
          throw hashErr;
        }
        // Spec-compliant plugin: call createPlugin() via loader
        const rootDir = fs.statSync(plugin.path).isDirectory() ? plugin.path : path.dirname(plugin.path);
        const serverRef = this.registry.getServerInstance ? this.registry.getServerInstance() : require('./index').getServerInstance();
        const { loadSpecPlugin } = require('./plugin_loader');
        const result = await loadSpecPlugin(
          serverRef,
          rootDir,
          plugin.manifest,
          { strictCapabilities: !!this.policy.strictCapabilities, validationManager: this.validationManager }
        );
        // Record capability snapshot internally (tools/resources/prompts sets)
        try {
          if (result && result.captured) {
            const { getRegistry } = require('./index');
            const reg = getRegistry();
            if (reg && typeof reg.registerPluginCapabilities === 'function') {
              reg.registerPluginCapabilities(plugin.id, {
                tools: result.captured.tools.map(t => t.name),
                resources: result.captured.resources.map(r => r.name),
                prompts: result.captured.prompts.map(p => p.name)
              });
            }
            // Phase2 Task16: persist capability snapshot onto plugin object for future diff / reporting
            plugin.capabilitySnapshot = {
              tools: result.captured.tools.map(t => t.name),
              resources: result.captured.resources.map(r => r.name),
              prompts: result.captured.prompts.map(p => p.name),
              at: new Date().toISOString()
            };
          }
        } catch (capErr) {
          console.warn(`[Plugin Manager] Capability snapshot failed for ${plugin.id}: ${capErr.message}`);
        }
        plugin.instance = { type: 'spec-plugin' };
        plugin.state = PluginState.LOADED;
        plugin.error = null;
        // Wire plugin dist directory into hot reload manager if available
        try {
          const { getHotReloadManager } = require('./index');
          const hrm = getHotReloadManager && getHotReloadManager();
          const distDir = path.join(rootDir, 'dist');
          if (hrm && fs.existsSync(distDir)) {
            hrm.watchPlugin(plugin.id, distDir);
          }
        } catch (e) {
          console.warn(`[Plugin Manager] Hot reload watch failed for ${plugin.id}: ${e.message}`);
        }
        // Write/Update install.lock.json with extended v2 metadata (Task7)
        try {
          await this._writeExtendedLock(rootDir, plugin.manifest, {
            signatureVerified: plugin._signatureVerified || false,
            signerKeyId: plugin._signerKeyId || null
          });
        } catch (e) {
          console.warn(`[Plugin Manager] ⚠️  Failed to write extended lock file for ${plugin.name}: ${e.message}`);
        }
      } else {
        // Legacy: Load the plugin module
        const pluginModule = await this._loadPluginModule(plugin);
        // Pre-check
        await this._prevalidatePluginTools(plugin, pluginModule);
        // Initialize the plugin
        if (pluginModule.initialize) {
          await pluginModule.initialize(this._createPluginContext(plugin));
        }
        plugin.instance = pluginModule;
        plugin.state = PluginState.LOADED;
        plugin.error = null;
      }

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
   * Reload a spec plugin (basic implementation): unload (without removal), then load again and emit pluginReloaded.
   * @param {string} pluginId
   */
  async reloadPlugin(pluginId) {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) throw new Error(`Plugin ${pluginId} not found`);
    if (!(plugin.manifest && plugin.manifest.entry)) throw new Error('Reload only supported for spec plugins');
    const rootDir = fs.statSync(plugin.path).isDirectory() ? plugin.path : path.dirname(plugin.path);
    const manifestPath = path.join(rootDir, 'mcp-plugin.json');
    // Refresh manifest & dist hash before unloading/loading to avoid stale hash mismatch
    let refreshedManifest = plugin.manifest;
    try {
      if (fs.existsSync(manifestPath)) {
        const raw = JSON.parse(await fs.promises.readFile(manifestPath, 'utf8'));
        refreshedManifest = raw;
        plugin.manifest = raw; // update early
      }
    } catch (e) {
      console.warn(`[Plugin Manager] Reload manifest pre-read failed for ${pluginId}: ${e.message}`);
    }
    // Unload if loaded/active
    if (plugin.state === PluginState.LOADED || plugin.state === PluginState.ACTIVE) {
      try { await this.unloadPlugin(pluginId); } catch {}
    }
    const ok = await this.loadPlugin(pluginId);
    if (!ok) throw new Error(`Reload failed for ${pluginId}`);
    // Re-read manifest (final confirmation post-load)
    try {
      if (fs.existsSync(manifestPath)) {
        const updated = JSON.parse(await fs.promises.readFile(manifestPath, 'utf8'));
        plugin.manifest = updated;
        this.emit('pluginReloaded', plugin, updated);
      } else {
        this.emit('pluginReloaded', plugin, plugin.manifest);
      }
    } catch (e) {
      console.warn(`[Plugin Manager] Reload manifest read failed for ${pluginId}: ${e.message}`);
      this.emit('pluginReloaded', plugin, plugin.manifest);
    }
    return true;
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

    // Enforce policy requirements
    if (this.policy.requireChecksum && !opts.checksum) {
      throw new Error('Checksum is required by policy for remote installs');
    }
    if (this.policy.requireSignature && !(opts.signature && opts.publicKey)) {
      throw new Error('Signature and publicKey are required by policy for remote installs');
    }

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
   * Load all discovered spec plugins honoring dependency order.
   * Uses manifest.name and manifest.dependencies to topologically sort.
   * @param {Object} [opts]
   * @param {boolean} [opts.activate] also activate after load
   * @returns {Promise<{loaded: string[], failed: Array<{id: string, error: string}>}>}
   */
  async loadAllSpecPlugins(opts = {}) {
    const activate = !!opts.activate;
    // Build list of spec plugins
    const specPlugins = Array.from(this.plugins.values()).filter(p => p.manifest && p.manifest.entry);
    if (specPlugins.length === 0) return { loaded: [], failed: [] };

    // Topologically sort by manifest dependencies
    let order;
    try {
      order = topoSortByDependencies(specPlugins.map(p => p.manifest));
    } catch (e) {
      // If topo sort fails, return error for all
      return { loaded: [], failed: specPlugins.map(p => ({ id: p.id, error: e.message })) };
    }

    // Map back to plugin IDs by manifest.name
    const nameToPlugin = new Map(specPlugins.map(p => [p.manifest.name, p]));
    const loaded = [];
    const failed = [];
    for (const m of order) {
      const plugin = nameToPlugin.get(m.name);
      if (!plugin) {
        failed.push({ id: m.name, error: 'Discovered manifest not found in plugins map' });
        continue;
      }
      try {
        const ok = await this.loadPlugin(plugin.id);
        if (!ok) {
          failed.push({ id: plugin.id, error: this.plugins.get(plugin.id)?.error || 'Unknown load error' });
          continue;
        }
        if (activate) await this.activatePlugin(plugin.id);
        loaded.push(plugin.id);
      } catch (e) {
        failed.push({ id: plugin.id, error: e.message });
      }
    }

    return { loaded, failed };
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
   * Install a plugin directly from a ZIP buffer already on disk (Phase1 basic implementation)
   * @param {string} zipPath absolute or relative path to .zip
   * @param {Object} [opts]
   * @param {boolean} [opts.autoLoad]
   * @returns {Promise<Object>} result { success, id, path }
   */
  async installFromZip(zipPath, opts = {}) {
    const abs = path.isAbsolute(zipPath) ? zipPath : path.resolve(zipPath);
    if (!fs.existsSync(abs)) throw new Error(`ZIP not found: ${abs}`);
    const data = await fs.promises.readFile(abs);
    const suggestedName = path.basename(abs).replace(/\.zip$/i, '');
    const staged = await this._stageAndValidateZip(data, { suggestedName });
    const finalized = await this._finalizeInstall(staged);
    // Attempt to produce extended lock file (Task7)
    try {
      const manifestPath = path.join(finalized.path, 'mcp-plugin.json');
      if (fs.existsSync(manifestPath)) {
        const manifest = JSON.parse(await fs.promises.readFile(manifestPath, 'utf8'));
        await this._writeExtendedLock(finalized.path, manifest, {});
      }
    } catch (e) {
      console.warn(`[Plugin Manager] ⚠️  Failed to write extended lock file (zip) for ${staged.id}: ${e.message}`);
    }
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
  error: plugin.error,
  type: plugin.manifest?.type || (plugin.manifest?.entry ? 'spec-plugin' : 'tool-module')
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
      types: {},
      dependencyPolicies: {},
      signed: { verified: 0, unsigned: 0 },
      sandbox: { sandboxRequired: 0 },
    };
    for (const plugin of this.plugins.values()) {
      stats.states[plugin.state] = (stats.states[plugin.state] || 0) + 1;
      const type = (plugin.manifest && plugin.manifest.type) || (plugin.manifest?.entry ? 'spec-plugin' : 'unknown');
      stats.types[type] = (stats.types[type] || 0) + 1;
      if (plugin.manifest && plugin.manifest.dist) {
        const pol = plugin.manifest.dependenciesPolicy || 'bundled-only';
        stats.dependencyPolicies[pol] = (stats.dependencyPolicies[pol] || 0) + 1;
      }
      if (plugin._signatureVerified) stats.signed.verified++; else stats.signed.unsigned++;
      if (plugin.manifest && plugin.manifest.dependenciesPolicy === 'sandbox-required') stats.sandbox.sandboxRequired++;
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

  _verifySignature(data, signatureBase64, publicKeyMaterial, algorithm = 'RSA-SHA256') {
    try {
      const sig = Buffer.from(signatureBase64, 'base64');
      // Detect Ed25519 vs RSA/ECDSA based on key material
      const isPossiblyRawEd25519 = /^[A-Za-z0-9+/=]{43,88}$/.test(publicKeyMaterial.trim()) && !publicKeyMaterial.includes('BEGIN');
      const isPem = /BEGIN PUBLIC KEY/.test(publicKeyMaterial) || /BEGIN RSA PUBLIC KEY/.test(publicKeyMaterial) || /BEGIN CERTIFICATE/.test(publicKeyMaterial);
      if (isPossiblyRawEd25519 && sig.length === 64) {
        // Treat as raw 32-byte Ed25519 public key (base64) signing canonical data (UTF-8 bytes) directly
        if (typeof crypto.verify === 'function') {
          return crypto.verify(null, Buffer.from(data, 'utf8'), { key: Buffer.from(publicKeyMaterial, 'base64'), format: 'der', type: 'spki' }, sig);
        }
      }
      if (isPem) {
        // Use crypto.createVerify for RSA/ECDSA (algorithm param)
        const verify = crypto.createVerify(algorithm);
        verify.update(data);
        verify.end();
        return verify.verify(publicKeyMaterial, sig);
      }
      // Attempt node:crypto ed25519 verify API if available with keyObject
      if (crypto.createPublicKey) {
        try {
          const keyObj = crypto.createPublicKey(publicKeyMaterial);
          if (keyObj.asymmetricKeyType === 'ed25519') {
            return crypto.verify(null, Buffer.from(data, 'utf8'), keyObj, sig);
          }
        } catch {}
      }
      console.warn('[Plugin Manager] ⚠️  Unrecognized public key material format for signature verification');
      return false;
    } catch (e) {
      console.warn('[Plugin Manager] ⚠️  Signature verify error:', e.message);
      return false;
    }
  }

  // -------- Signature & Trust Helpers --------
  async _loadTrustedKeysStrict() {
    if (!credentialsManager) return [];
    if (this._trustedKeysCache) return this._trustedKeysCache;
    const idsEnv = (process.env.PLUGIN_TRUSTED_KEY_IDS || '').trim();
    const ids = idsEnv ? idsEnv.split(/[,;\s]+/).filter(Boolean) : [];
    const keys = [];
    for (const id of ids) {
      try {
        const cred = credentialsManager.getCredential(id);
        if (cred.type !== 'certificate' || !cred.certificate) {
          console.warn(`[Plugin Manager] Trusted key id ${id} invalid (not certificate or missing field)`);
          continue;
        }
        keys.push({ id, publicKeyPem: cred.certificate });
      } catch (e) {
        console.warn(`[Plugin Manager] Failed to load trusted key ${id}: ${e.message}`);
      }
    }
    this._trustedKeysCache = keys;
    return keys;
  }

  async _verifyPluginSignatureIfRequired(plugin, rootDir) {
    const sigPath = path.join(rootDir, 'mcp-plugin.sig');
    const hasSigFile = fs.existsSync(sigPath);
    const requireSig = !!this.policy.requireSignature;
    if (!hasSigFile) {
      if (requireSig) throw new Error('Signature required but mcp-plugin.sig not found');
      return; // Nothing to verify
    }
    const trusted = await this._loadTrustedKeysStrict();
    if (trusted.length === 0) {
      if (requireSig) throw new Error('No trusted signing keys configured (PLUGIN_TRUSTED_KEY_IDS)');
      console.warn('[Plugin Manager] ⚠️  Signature present but no trusted keys configured; skipping verification');
      return;
    }
    let raw = await fs.promises.readFile(sigPath, 'utf8');
    raw = raw.trim();
    let signatureB64 = raw;
    if (raw.startsWith('{')) {
      try { const obj = JSON.parse(raw); signatureB64 = obj.signature || obj.sig || signatureB64; } catch {}
    }
    if (!signatureB64) throw new Error('Signature file empty');
    const canonicalData = plugin.manifest.dist?.hash || '';
    for (const key of trusted) {
      if (this._verifySignature(canonicalData, signatureB64, key.publicKeyPem, 'RSA-SHA256') ||
          this._verifySignature(canonicalData, signatureB64, key.publicKeyPem, 'sha256')) {
        plugin._signatureVerified = true;
        plugin._signerKeyId = key.id;
        console.log(`[Plugin Manager] 🔐 Signature OK for ${plugin.id} (key ${key.id})`);
        return;
      }
    }
    if (requireSig) throw new Error('Signature verification failed for all trusted keys');
    console.warn(`[Plugin Manager] ⚠️  Signature verification failed for ${plugin.id} (non-strict mode, continuing)`);
  }

  async _quarantinePlugin(plugin, rootDir, reason) {
    try {
      const quarantineRoot = path.join(this.pluginDirs[0], '.quarantine');
      await fs.promises.mkdir(quarantineRoot, { recursive: true });
      const ts = Date.now();
      const dest = path.join(quarantineRoot, `${plugin.id}-${ts}`);
      await fs.promises.rename(rootDir, dest);
      plugin.path = dest;
      console.warn(`[Plugin Manager] 🛑 Plugin ${plugin.id} quarantined: ${reason}`);
    } catch (e) {
      console.warn(`[Plugin Manager] Quarantine move failed for ${plugin.id}: ${e.message}`);
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
    if (!manifest || manifest.manifestVersion !== '2') {
      throw new Error('Zip plugin must contain a v2 manifest (manifestVersion="2")');
    }
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
  const { IntegrityError, PolicyError } = require('./errors');
  if (!staged || !staged.id || !staged.srcPath) throw new IntegrityError('Invalid staged install');
    if (staged.type === 'file') {
      const dest = path.join(this.defaultInstallDir, `${staged.id}.js`);
  if (fs.existsSync(dest)) throw new PolicyError(`Plugin already exists: ${staged.id}`);
      await fs.promises.copyFile(staged.srcPath, dest);
      return { id: staged.id, path: dest };
    } else if (staged.type === 'dir') {
      const destDir = path.join(this.defaultInstallDir, staged.id);
  if (fs.existsSync(destDir)) throw new PolicyError(`Plugin already exists: ${staged.id}`);
      await fs.promises.mkdir(destDir, { recursive: true });
      // Copy directory recursively
      await this._copyDir(staged.srcPath, destDir);
      return { id: staged.id, path: destDir };
    }
  throw new PolicyError('Unknown staged type');
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

  // === Extended lock writer (Task7) ===
  async _writeExtendedLock(rootDir, manifest, extra = {}) {
    try {
      if (!manifest || manifest.manifestVersion !== '2') return; // only for v2 plugins
      const lockPath = path.join(rootDir, 'install.lock.json');
      let existing = {};
      if (fs.existsSync(lockPath)) {
        try { existing = JSON.parse(await fs.promises.readFile(lockPath, 'utf8')); } catch {}
      }
      // Collect dist metrics if dist directory exists
      let distMetrics = {};
      const distDir = path.join(rootDir, 'dist');
      if (fs.existsSync(distDir) && fs.statSync(distDir).isDirectory()) {
        try {
          const { fileCount, totalBytes } = computeDistHashDetailed(distDir);
          distMetrics = { fileCount, totalBytes };
        } catch (e) {
          console.warn(`[Plugin Manager] Dist metrics failed for lock write: ${e.message}`);
        }
      }
      const externalDeps = Array.isArray(manifest.externalDependencies) ? manifest.externalDependencies : [];
      const lock = {
        name: manifest.name,
        version: manifest.version,
        distHash: manifest.dist?.hash || null,
        installedAt: existing.installedAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        signatureVerified: extra.signatureVerified || false,
        signerKeyId: extra.signerKeyId || null,
        dependenciesPolicy: manifest.dependenciesPolicy || 'bundled-only',
        externalDependenciesCount: externalDeps.length,
        coverage: manifest.dist?.coverage || null,
        fileCountDeclared: manifest.dist?.fileCount || null,
        totalBytesDeclared: manifest.dist?.totalBytes || null,
        fileCountActual: distMetrics.fileCount || null,
        totalBytesActual: distMetrics.totalBytes || null,
        schemaPathOverride: process.env.SCHEMA_PATH || null,
        strictCapabilities: this.policy.strictCapabilities || false,
        requireSignature: this.policy.requireSignature || false
      };
      await fs.promises.writeFile(lockPath, JSON.stringify(lock, null, 2), 'utf8');
    } catch (e) {
      console.warn(`[Plugin Manager] ⚠️  Extended lock write failed: ${e.message}`);
    }
  }
}

module.exports = { PluginManager, PluginState };
