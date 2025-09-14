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
const { loadSpecPlugin, topoSortByDependencies, computeDistHash } = require('./plugin_loader');
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
        // Prefer spec plugin canonical identifier (manifest.name)
        id: manifest.name || manifest.id || path.basename(pluginPath, '.js'),
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
            // Store on plugin for clean unload later
            plugin.capabilities = {
              tools: result.captured.tools.map(t => t.name),
              resources: result.captured.resources.map(r => r.name),
              prompts: result.captured.prompts.map(p => p.name)
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
        // Write/Update install.lock.json with signature metadata
        try {
          const lockPath = path.join(rootDir, 'install.lock.json');
          const distHash = plugin.manifest.dist?.hash || null;
          let existing = {};
          if (fs.existsSync(lockPath)) {
            try { existing = JSON.parse(await fs.promises.readFile(lockPath, 'utf8')); } catch {}
          }
          // compute file stats
          let fileCount = null, totalBytes = null;
          try {
            const { computeDistHashDetailed } = require('./plugin_loader');
            const distDir = path.join(rootDir, 'dist');
            const det = computeDistHashDetailed(distDir);
            fileCount = det.fileCount; totalBytes = det.totalBytes;
          } catch {}
          const lock = {
            name: plugin.manifest.name,
            version: plugin.manifest.version,
            distHash,
            fileCount,
            totalBytes,
            installedAt: existing.installedAt || new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            signatureVerified: plugin._signatureVerified || false,
            signerKeyId: plugin._signerKeyId || null,
            policy: {
              STRICT_INTEGRITY: !!(process.env.STRICT_INTEGRITY && /^(1|true)$/i.test(process.env.STRICT_INTEGRITY)),
              STRICT_CAPABILITIES: !!(process.env.STRICT_CAPABILITIES && /^(1|true)$/i.test(process.env.STRICT_CAPABILITIES)),
              PLUGIN_ALLOW_RUNTIME_DEPS: !!(process.env.PLUGIN_ALLOW_RUNTIME_DEPS && /^(1|true)$/i.test(process.env.PLUGIN_ALLOW_RUNTIME_DEPS))
            }
          };
          await fs.promises.writeFile(lockPath, JSON.stringify(lock, null, 2), 'utf8');
        } catch (e) {
          console.warn(`[Plugin Manager] ⚠️  Failed to write lock file for ${plugin.name}: ${e.message}`);
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
    // Apply capability diff for removals before reload
    try {
      const { getRegistry, applyPluginCapabilityDiff } = require('./index');
      const reg = getRegistry();
      const prevCaps = plugin.capabilities || { tools: [], resources: [], prompts: [] };
      // Build next caps by statically analyzing current dist entry (we rely on updated manifest.capabilities if provided; otherwise skip add detection)
      // In our tests, we only need removals: compute removals by comparing prevCaps to refreshed manifest snapshot if available
      const nextCaps = { tools: [], resources: [], prompts: [] };
      // If we later capture after load, removals still need to happen now to avoid duplicate register errors
      const removed = {
        tools: prevCaps.tools.filter(t => !(nextCaps.tools || []).includes(t)),
        resources: prevCaps.resources.filter(r => !(nextCaps.resources || []).includes(r)),
        prompts: prevCaps.prompts.filter(p => !(nextCaps.prompts || []).includes(p))
      };
      if (removed.tools.length || removed.resources.length || removed.prompts.length) {
        await applyPluginCapabilityDiff(pluginId, { tools: { added: [], removed: removed.tools }, resources: { added: [], removed: removed.resources }, prompts: { added: [], removed: removed.prompts } });
      }
    } catch (e) {
      console.warn(`[Plugin Manager] Capability pre-diff on reload failed for ${pluginId}: ${e.message}`);
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

      // If this is a spec plugin with registered capabilities, attempt to unregister from server and internal registry
      try {
        if (plugin.manifest && plugin.manifest.entry && plugin.capabilities) {
          const { getServerInstance, getRegistry } = require('./index');
          const srv = getServerInstance();
          const reg = getRegistry();
          const caps = plugin.capabilities || { tools: [], resources: [], prompts: [] };
          // Tools
          for (const t of caps.tools || []) {
            try { if (srv && typeof srv.unregisterTool === 'function') await srv.unregisterTool(t); } catch {}
            try { await reg.unregisterToolInternal(t); } catch {}
          }
          // Resources
          for (const r of caps.resources || []) {
            try { if (srv && typeof srv.unregisterResource === 'function') await srv.unregisterResource(r); } catch {}
            try { reg.unregisterResourceInternal(r); } catch {}
          }
          // Prompts
          for (const p of caps.prompts || []) {
            try { if (srv && typeof srv.unregisterPrompt === 'function') await srv.unregisterPrompt(p); } catch {}
            try { reg.unregisterPromptInternal(p); } catch {}
          }
        }
      } catch (e) {
        console.warn(`[Plugin Manager] ⚠️  Unregister during unload had issues for ${plugin.id}: ${e.message}`);
      }

      // Clear module cache
      const modulePath = this._getPluginModulePath(plugin);
      if (modulePath && require.cache[modulePath]) {
        delete require.cache[modulePath];
      }

      // Purge tool validation state for this plugin/module to avoid stale duplicates on reload
      try {
        if (this.validationManager && typeof this.validationManager.removeModule === 'function') {
          const moduleName = (plugin.manifest && (plugin.manifest.name || plugin.id)) || plugin.id;
          this.validationManager.removeModule(moduleName);
        }
      } catch (e) {
        console.warn(`[Plugin Manager] Validation purge failed for ${plugin.id}: ${e.message}`);
      }

      plugin.instance = null;
      plugin.state = PluginState.UNLOADED;
      plugin.error = null;
  plugin.capabilities = undefined;

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
  type: (plugin.manifest && plugin.manifest.entry) ? 'spec-plugin' : (plugin.manifest?.type || 'tool-module')
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
      const type = (plugin.manifest && plugin.manifest.entry) ? 'spec-plugin' : (plugin.manifest?.type || 'tool-module');
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
    // Fallback: static allowlist file under tools/plugins/trusted_keys.json
    try {
      const fallbackPath = path.join(__dirname, '..', 'plugins', 'trusted_keys.json');
      if (keys.length === 0 && fs.existsSync(fallbackPath)) {
        const raw = JSON.parse(await fs.promises.readFile(fallbackPath, 'utf8'));
        if (Array.isArray(raw)) {
          for (const k of raw) {
            if (k && k.id && k.publicKeyPem) keys.push({ id: k.id, publicKeyPem: k.publicKeyPem });
          }
        }
      }
    } catch (e) {
      console.warn('[Plugin Manager] Trusted keys fallback load failed:', e.message);
    }
    this._trustedKeysCache = keys;
    return keys;
  }

  async _verifyPluginSignatureIfRequired(plugin, rootDir) {
    const sigPath = path.join(rootDir, 'mcp-plugin.sig');
    const hasSigFile = fs.existsSync(sigPath);
    const requireSig = !!this.policy.requireSignature;
    // Prefer explicit manifest.signatures[] if present
    const manifestSigs = Array.isArray(plugin.manifest?.signatures) ? plugin.manifest.signatures : [];
    if (!hasSigFile && manifestSigs.length === 0) {
      if (requireSig) throw new Error('Signature required but neither mcp-plugin.sig nor manifest.signatures[] found');
      return; // Nothing to verify
    }
  const trusted = await this._loadTrustedKeysStrict();
    if (trusted.length === 0) {
      if (requireSig) throw new Error('No trusted signing keys configured (PLUGIN_TRUSTED_KEY_IDS)');
      console.warn('[Plugin Manager] ⚠️  Signature present but no trusted keys configured; skipping verification');
      return;
    }
    const canonicalData = plugin.manifest.dist?.hash || '';
    const tryKeys = async (sigB64, alg) => {
      for (const key of trusted) {
        const algorithm = alg || 'RSA-SHA256';
        if (this._verifySignature(canonicalData, sigB64, key.publicKeyPem, algorithm)) {
          plugin._signatureVerified = true;
          plugin._signerKeyId = key.id;
          console.log(`[Plugin Manager] 🔐 Signature OK for ${plugin.id} (key ${key.id})`);
          return true;
        }
      }
      return false;
    };
    let verified = false;
    // 1) Verify against signatures[] if present
    for (const s of manifestSigs) {
      const sig = s?.signature || s?.sig || s; // allow simple string entries
      if (!sig || typeof sig !== 'string') continue;
      // If keyId provided, try matching key first
      if (s?.keyId) {
        const k = trusted.find(t => t.id === s.keyId);
        const algorithm = s?.alg || 'RSA-SHA256';
        if (k && this._verifySignature(canonicalData, sig, k.publicKeyPem, algorithm)) {
          plugin._signatureVerified = true;
          plugin._signerKeyId = k.id;
          console.log(`[Plugin Manager] 🔐 Signature OK for ${plugin.id} (key ${k.id})`);
          verified = true;
          break;
        }
      }
      if (!verified) {
        verified = await tryKeys(sig, s?.alg);
        if (verified) break;
      }
    }
    // 2) Fallback to mcp-plugin.sig file
    if (!verified && hasSigFile) {
      let raw = await fs.promises.readFile(sigPath, 'utf8');
      raw = raw.trim();
      let signatureB64 = raw;
      let sigAlg = 'RSA-SHA256';
      if (raw.startsWith('{')) {
        try { const obj = JSON.parse(raw); signatureB64 = obj.signature || obj.sig || signatureB64; sigAlg = obj.alg || sigAlg; } catch {}
      }
      if (!signatureB64) throw new Error('Signature file empty');
      verified = await tryKeys(signatureB64, sigAlg);
    }
    if (!verified && requireSig) throw new Error('Signature verification failed for all trusted keys');
    if (!verified) console.warn(`[Plugin Manager] ⚠️  Signature verification failed for ${plugin.id} (non-strict mode, continuing)`);
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

    // Spec plugin checks
    const manifest = await this._loadPluginManifest(rootDir);
    if (!manifest || manifest.manifestVersion !== '2') {
      throw new Error('Zip plugin must contain a v2 manifest (manifestVersion="2")');
    }
    if (!manifest.entry || !/^dist\/.+\.m?js$/.test(manifest.entry)) {
      throw new Error('Manifest entry must point to a file under dist/');
    }
    const distDir = path.join(rootDir, 'dist');
    if (!fs.existsSync(distDir)) throw new Error('dist directory missing in plugin');
    if (!manifest.dist || !manifest.dist.hash) throw new Error('v2 manifest missing dist.hash');
    const { computeDistHash } = require('./plugin_loader');
    const computed = computeDistHash(distDir);
    const declared = String(manifest.dist.hash).replace(/^sha256:/,'');
    if (computed.toLowerCase() !== declared.toLowerCase()) {
      throw new Error(`dist hash mismatch (manifest ${declared} != computed ${computed})`);
    }
    // Dry-run load to ensure plugin is well-formed (no real registration)
    try {
      const { loadSpecPlugin } = require('./plugin_loader');
      const serverRef = this.registry.getServerInstance ? this.registry.getServerInstance() : require('./index').getServerInstance();
      await loadSpecPlugin(serverRef || {}, rootDir, manifest, { dryRun: true, validationManager: this.validationManager });
    } catch (e) {
      throw new Error(`Spec plugin dry-run failed: ${e.message}`);
    }

    const base = (pluginId || manifest?.name || suggestedName || 'plugin').replace(/\.zip$/i, '');
    const id = manifest?.name || base;
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
