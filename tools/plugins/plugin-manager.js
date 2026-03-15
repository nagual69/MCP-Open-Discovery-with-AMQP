// SPDX-License-Identifier: MPL-2.0
// tools/plugins/plugin-manager.js
// Authoritative controller for all plugin lifecycle operations.
// Replaces the old registry/index.js as the primary capability manager.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const AdmZip = require('adm-zip');
const pluginDb = require('./db/plugin-db');

// ── Security: restricted core modules blocked without explicit permissions ──
const RESTRICTED_MODULES = ['fs', 'child_process', 'net', 'dgram', 'tls', 'http', 'https', 'dns'];

// ── AJV manifest JSON Schema validation (optional — skipped gracefully if absent) ──
let _ajvCompiled = null;
const SCHEMA_PATH = process.env.SCHEMA_PATH
  ? (path.isAbsolute(process.env.SCHEMA_PATH) ? process.env.SCHEMA_PATH : path.resolve(process.env.SCHEMA_PATH))
  : path.resolve(__dirname, '..', '..', 'docs', 'mcp-od-marketplace', 'specs', 'schemas', 'mcp-plugin.schema.v2.json');

function _getV2Validator() {
  if (_ajvCompiled) return _ajvCompiled;
  try {
    if (!fs.existsSync(SCHEMA_PATH)) return null;
    const Ajv = require('ajv');
    const ajv = new Ajv({ allErrors: true, strict: false });
    _ajvCompiled = ajv.compile(JSON.parse(fs.readFileSync(SCHEMA_PATH, 'utf8')));
    return _ajvCompiled;
  } catch { return null; }
}

const EXTRACTION_BASE = process.env.PLUGIN_EXTRACTION_DIR ||
  path.join(process.env.DATA_DIR || path.join(process.cwd(), 'data'), 'plugin_extractions');

const MARKETPLACE_BASE_URL = process.env.MARKETPLACE_URL ||
  'https://marketplace.vibeforgesystems.com';

// Global reference to the MCP server instance for capability registration
let mcpServerRef = null;

function setMcpServer(server) {
  mcpServerRef = server;
}

// ============================================================
// INSTALL
// ============================================================

/**
 * Install a plugin from a URL (Marketplace pull) or local file path.
 * Verifies integrity and signatures before storing.
 * Does NOT activate — activation is a separate step.
 */
async function install(source, options = {}) {
  const { actor = 'operator', isBuiltin = false, autoActivate = false } = options;

  let zipBuffer;
  let sourceUrl = null;

  if (typeof source === 'string' && (source.startsWith('http://') || source.startsWith('https://'))) {
    // Pull from Marketplace
    sourceUrl = source;
    zipBuffer = await fetchPluginBundle(source);
  } else {
    // Local import (air-gapped / offline mode)
    const absPath = path.resolve(source);
    if (!fs.existsSync(absPath)) {
      throw new Error(`Local plugin file not found: ${absPath}`);
    }
    zipBuffer = fs.readFileSync(absPath);
  }

  // Extract and validate manifest
  const { manifest, distHash } = await extractAndVerify(zipBuffer);

  const pluginId = `${manifest.name}@${manifest.version}`;

  // Check for duplicate
  const existing = pluginDb.getPlugin(pluginId);
  if (existing && existing.lifecycle_state !== 'uninstalling') {
    throw new Error(`Plugin ${pluginId} is already installed. Use update() to upgrade.`);
  }

  // Verify signatures if required or if signatures are present
  let signatureVerified = 0;
  let signerKeyId = null;
  let signerType = null;

  if (manifest.signatures && manifest.signatures.length > 0) {
    const result = verifySignatures(manifest);
    signatureVerified = result.verified ? 1 : 0;
    signerKeyId = result.keyId;
    signerType = result.keyType;

    if (process.env.REQUIRE_SIGNATURES === 'true' && !result.verified) {
      throw new Error(`Signature verification failed for plugin ${pluginId}: ${result.error}`);
    }
  } else if (process.env.REQUIRE_SIGNATURES === 'true') {
    throw new Error(`Plugin ${pluginId} has no signatures but REQUIRE_SIGNATURES=true`);
  }

  // Store in SQLite
  pluginDb.insertPlugin({
    id: pluginId,
    name: manifest.name,
    version: manifest.version,
    manifest_json: JSON.stringify(manifest),
    bundle_blob: zipBuffer,
    dist_hash: distHash,
    bundle_size_bytes: zipBuffer.length,
    signature_data: manifest.signatures ? JSON.stringify(manifest.signatures) : null,
    signature_verified: signatureVerified,
    signer_key_id: signerKeyId,
    signer_type: signerType,
    lifecycle_state: 'installed',
    is_builtin: isBuiltin ? 1 : 0,
    installed_at: new Date().toISOString(),
    installed_by: actor,
    source_url: sourceUrl,
    source_type: sourceUrl ? 'marketplace' : 'local'
  });

  if (autoActivate) {
    await activate(pluginId, { actor });
  }

  return { pluginId, manifest, signatureVerified: !!signatureVerified };
}

// ============================================================
// ACTIVATE
// ============================================================

/**
 * Activate a plugin: extract bundle, verify hash, load into MCP server.
 * tools/list will include this plugin's tools after activation.
 */
async function activate(pluginId, options = {}) {
  const { actor = 'operator', force = false } = options;

  if (!mcpServerRef) throw new Error('MCP server not initialized — call setMcpServer() first');

  const plugin = pluginDb.getPlugin(pluginId);
  if (!plugin) throw new Error(`Plugin not found: ${pluginId}`);
  if (plugin.lifecycle_state === 'active' && !force) return { alreadyActive: true };

  pluginDb.setPluginLifecycleState(pluginId, 'updating');

  try {
    // Extract bundle to temp directory
    const extractionPath = await extractBundle(pluginId, plugin.bundle_blob, plugin.dist_hash);

    // Load plugin entry point
    const manifest = JSON.parse(plugin.manifest_json);
    const entryPath = path.join(extractionPath, manifest.entry);

    if (!fs.existsSync(entryPath)) {
      throw new Error(`Plugin entry not found after extraction: ${manifest.entry}`);
    }

    // Phase A — Static security scan: detect restricted require() without matching permissions
    const distDir = path.join(extractionPath, 'dist');
    const scanViolations = staticSecurityScan(distDir, manifest);
    if (scanViolations.length > 0) {
      throw new Error(`Security scan blocked ${pluginId}:\n${scanViolations.join('\n')}`);
    }

    // Phase B — Load plugin module
    try { delete require.cache[require.resolve(entryPath)]; } catch {}
    const pluginModule = require(entryPath);
    const createPlugin = pluginModule.createPlugin || pluginModule.default?.createPlugin;

    if (typeof createPlugin !== 'function') {
      throw new Error(`Plugin ${pluginId} entry does not export createPlugin(server)`);
    }

    // Phase C — Run createPlugin through capture proxy with Module._load sandbox
    const { proxy, captured } = _createCaptureProxy(mcpServerRef);
    const Module = require('module');
    const _origLoad = Module._load;
    const pluginRoot = extractionPath;
    const perms = manifest.permissions || {};
    const runtimeAllowed = new Set();
    if (perms.network) ['net', 'dns', 'http', 'https', 'tls'].forEach(m => runtimeAllowed.add(m));
    if (perms.fsRead || perms.fsWrite) runtimeAllowed.add('fs');
    if (perms.exec) runtimeAllowed.add('child_process');
    const restrictedSet = new Set(RESTRICTED_MODULES);

    try {
      Module._load = function(request, parent, isMain) {
        if (restrictedSet.has(request)) {
          const parentFile = parent?.filename || '';
          if (parentFile.startsWith(pluginRoot) && !runtimeAllowed.has(request)) {
            throw new Error(`Plugin '${manifest.name}' attempted to require restricted module '${request}' without permission`);
          }
        }
        return _origLoad.apply(this, arguments);
      };
      await createPlugin(proxy);
    } finally {
      Module._load = _origLoad;
    }

    // Phase D — Forward captured registrations to real server (already-registered = warn not throw)
    _forwardCaptures(mcpServerRef, captured, manifest.name);

    // Mark active
    pluginDb.setPluginLifecycleState(pluginId, 'active');
    pluginDb.auditLog(pluginId, plugin.name, plugin.version, 'activated', actor);

    return { activated: true, pluginId, toolCount: manifest.capabilities?.tools?.length || 0 };

  } catch (error) {
    pluginDb.setPluginLifecycleState(pluginId, 'error', error.message);
    pluginDb.auditLog(pluginId, plugin.name, plugin.version, 'activation_failed', actor, { error: error.message });
    throw error;
  }
}

// ============================================================
// DEACTIVATE
// ============================================================

/**
 * Deactivate a plugin: remove its tools/resources/prompts from tools/list.
 * The MCP SDK does not currently support tool unregistration natively.
 * Implementation: set tools to inactive in DB, rebuild tools/list via notifyToolsChanged.
 */
async function deactivate(pluginId, options = {}) {
  const { actor = 'operator' } = options;

  const plugin = pluginDb.getPlugin(pluginId);
  if (!plugin) throw new Error(`Plugin not found: ${pluginId}`);
  if (plugin.lifecycle_state !== 'active') return { alreadyInactive: true };

  pluginDb.setPluginLifecycleState(pluginId, 'inactive');
  pluginDb.auditLog(pluginId, plugin.name, plugin.version, 'deactivated', actor);

  // Notify connected clients that tool list has changed
  if (mcpServerRef && typeof mcpServerRef.sendToolListChanged === 'function') {
    await mcpServerRef.sendToolListChanged();
  }

  return { deactivated: true, pluginId };
}

// ============================================================
// HOT SWAP UPDATE
// ============================================================

/**
 * Hot swap: install new version, activate it, deactivate old version.
 * Both versions exist in SQLite simultaneously during the swap.
 * Rolls back to old version if new version fails to activate.
 */
async function update(pluginName, newSource, options = {}) {
  const { actor = 'operator' } = options;

  // Find current active version
  const currentPlugin = pluginDb.getPluginByName(pluginName);
  if (!currentPlugin) throw new Error(`No installed plugin found with name: ${pluginName}`);

  const currentPluginId = currentPlugin.id;
  const wasActive = currentPlugin.lifecycle_state === 'active';

  // Install new version (does not activate)
  const { pluginId: newPluginId, manifest: newManifest } = await install(newSource, { actor });

  if (newPluginId === currentPluginId) {
    throw new Error(`New version is the same as installed version: ${newPluginId}`);
  }

  // Link versions for rollback tracking
  pluginDb.getDb().prepare(
    'UPDATE plugins SET previous_version_id = ? WHERE id = ?'
  ).run(currentPluginId, newPluginId);

  try {
    // Activate new version
    await activate(newPluginId, { actor });

    // Deactivate old version (new is now live)
    if (wasActive) {
      await deactivate(currentPluginId, { actor });
    }

    pluginDb.auditLog(newPluginId, newManifest.name, newManifest.version, 'hot_swap_completed', actor, {
      previousVersion: currentPlugin.version,
      newVersion: newManifest.version
    });

    return { hotSwapped: true, previousVersion: currentPlugin.version, newVersion: newManifest.version };

  } catch (activationError) {
    // Rollback: new version failed, remove it, old version stays
    try {
      pluginDb.getDb().prepare(
        "UPDATE plugins SET lifecycle_state = 'error', last_error = ? WHERE id = ?"
      ).run(activationError.message, newPluginId);
    } catch {}

    pluginDb.auditLog(newPluginId, newManifest.name, newManifest.version, 'hot_swap_failed', actor, {
      error: activationError.message,
      rolledBackTo: currentPlugin.version
    });

    throw new Error(`Hot swap failed, staying on ${currentPlugin.version}: ${activationError.message}`);
  }
}

// ============================================================
// UNINSTALL
// ============================================================

async function uninstall(pluginId, options = {}) {
  const { actor = 'operator' } = options;

  const plugin = pluginDb.getPlugin(pluginId);
  if (!plugin) throw new Error(`Plugin not found: ${pluginId}`);
  if (plugin.is_builtin) throw new Error(`Cannot uninstall built-in plugin: ${pluginId}`);

  if (plugin.lifecycle_state === 'active') {
    await deactivate(pluginId, { actor });
  }

  // Clean up extraction directory
  const extraction = pluginDb.getCurrentExtraction(pluginId);
  if (extraction && fs.existsSync(extraction.extraction_path)) {
    fs.rmSync(extraction.extraction_path, { recursive: true, force: true });
  }

  pluginDb.deletePlugin(pluginId);
  return { uninstalled: true, pluginId };
}

// ============================================================
// MARKETPLACE PULL
// ============================================================

/**
 * List plugins available from the Marketplace that can be pulled.
 * Requires a valid marketplace token stored in the DB.
 */
async function listAvailableFromMarketplace() {
  const token = getStoredMarketplaceToken();
  if (!token) {
    throw new Error('No Marketplace access token configured. Grant access at the Marketplace website first.');
  }

  const response = await fetch(`${MARKETPLACE_BASE_URL}/api/plugins/available`, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  });

  if (!response.ok) {
    if (response.status === 401) throw new Error('Marketplace token invalid or expired. Re-grant access at the Marketplace website.');
    throw new Error(`Marketplace API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  return data.plugins || [];
}

async function fetchPluginBundle(url) {
  const token = getStoredMarketplaceToken();
  const headers = token ? { 'Authorization': `Bearer ${token}` } : {};

  const response = await fetch(url, { headers });
  if (!response.ok) throw new Error(`Failed to fetch plugin bundle: ${response.status} ${response.statusText}`);

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

function getStoredMarketplaceToken() {
  // Token is stored hashed in DB but the actual token in env for request use
  return process.env.MARKETPLACE_TOKEN || null;
}

// ============================================================
// SECURITY HELPERS (migrated from registry/plugin_loader.js)
// ============================================================

/**
 * Scan all .js files under distDir for require() of restricted core modules
 * that are not covered by the plugin's declared permissions.
 * Returns an array of human-readable violation strings (empty = clean).
 */
function staticSecurityScan(distDir, manifest) {
  const perms = manifest.permissions || {};
  const allowed = new Set();
  if (perms.network) ['net', 'dns', 'http', 'https', 'tls'].forEach(m => allowed.add(m));
  if (perms.fsRead || perms.fsWrite) allowed.add('fs');
  if (perms.exec) allowed.add('child_process');

  const violations = [];
  const reqPattern = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

  function walk(dir) {
    for (const entry of fs.readdirSync(dir)) {
      if (entry.startsWith('.')) continue;
      const full = path.join(dir, entry);
      if (fs.statSync(full).isDirectory()) {
        walk(full);
      } else if (/\.(m?js|cjs)$/.test(entry)) {
        const src = fs.readFileSync(full, 'utf8');
        let m;
        reqPattern.lastIndex = 0;
        while ((m = reqPattern.exec(src)) !== null) {
          const mod = m[1];
          if (RESTRICTED_MODULES.includes(mod) && !allowed.has(mod)) {
            violations.push(`${path.relative(distDir, full)}: requires '${mod}' without permission`);
          }
        }
      }
    }
  }

  try { walk(distDir); } catch { /* distDir may not exist on first call — extractBundle handles that */ }
  return violations;
}

/**
 * Create a registration-capture proxy wrapping the real MCP server.
 * During the capture phase, registerTool/registerResource/registerPrompt calls
 * are recorded but NOT forwarded to the real server yet.
 */
function _createCaptureProxy(server) {
  const captured = { tools: [], resources: [], prompts: [] };
  const proxy = new Proxy(server, {
    get(target, prop) {
      if (prop === 'registerTool' || prop === 'tool') {
        return (name, cfg, handler) => { captured.tools.push({ name, cfg, handler }); };
      }
      if (prop === 'registerResource' || prop === 'resource') {
        return (name, uriOrTemplate, metadata, reader) => { captured.resources.push({ name, uriOrTemplate, metadata, reader }); };
      }
      if (prop === 'registerPrompt' || prop === 'prompt') {
        return (name, cfg, cb) => { captured.prompts.push({ name, cfg, cb }); };
      }
      return target[prop];
    }
  });
  return { proxy, captured };
}

/**
 * Forward registrations captured by _createCaptureProxy to the real server.
 * If a registration fails because the name is already registered (hot-reload scenario),
 * emit a warning and continue rather than aborting the whole activation.
 */
function _forwardCaptures(server, captured, pluginName) {
  for (const t of captured.tools) {
    try {
      if (typeof server.registerTool === 'function') server.registerTool(t.name, t.cfg, t.handler);
      else if (typeof server.tool === 'function') server.tool(t.name, t.cfg, t.handler);
    } catch (e) {
      if (/already\s+registered/i.test(String(e?.message || e))) {
        console.warn(`[Plugin Manager] Tool '${t.name}' already registered in ${pluginName}; skipping`);
      } else { throw e; }
    }
  }
  for (const r of captured.resources) {
    try {
      if (typeof server.registerResource === 'function') server.registerResource(r.name, r.uriOrTemplate, r.metadata, r.reader);
      else if (typeof server.resource === 'function') server.resource(r.name, r.uriOrTemplate, r.reader);
    } catch (e) {
      if (/already\s+registered/i.test(String(e?.message || e))) {
        console.warn(`[Plugin Manager] Resource '${r.name}' already registered in ${pluginName}; skipping`);
      } else { throw e; }
    }
  }
  for (const p of captured.prompts) {
    try {
      if (typeof server.registerPrompt === 'function') server.registerPrompt(p.name, p.cfg, p.cb);
      else if (typeof server.prompt === 'function') server.prompt(p.name, p.cfg, p.cb);
    } catch (e) {
      if (/already\s+registered/i.test(String(e?.message || e))) {
        console.warn(`[Plugin Manager] Prompt '${p.name}' already registered in ${pluginName}; skipping`);
      } else { throw e; }
    }
  }
}

// ============================================================
// INTEGRITY & EXTRACTION
// ============================================================

async function extractAndVerify(zipBuffer) {
  const zip = new AdmZip(zipBuffer);
  const manifestEntry = zip.getEntry('mcp-plugin.json');

  if (!manifestEntry) throw new Error('Plugin zip missing mcp-plugin.json manifest');

  const manifest = JSON.parse(manifestEntry.getData().toString('utf8'));

  // JSON Schema validation via AJV (non-fatal if schema file is absent, fatal if schema violations found)
  const v2Validator = _getV2Validator();
  if (v2Validator) {
    if (!v2Validator(manifest)) {
      const errors = (v2Validator.errors || []).map(e => `${e.instancePath} ${e.message}`).join('; ');
      throw new Error(`Manifest schema validation failed: ${errors}`);
    }
  }

  // Validate manifest has required v2 fields
  if (!manifest.name || !manifest.version || !manifest.entry) {
    throw new Error('Plugin manifest missing required fields: name, version, entry');
  }
  if (!manifest.dist || !manifest.dist.hash) {
    throw new Error('Plugin manifest missing dist.hash (required for v2 integrity)');
  }

  // Compute dist hash from zip entries
  const distHash = computeDistHashFromZip(zip);

  if (distHash !== manifest.dist.hash) {
    throw new Error(
      `Plugin integrity check failed.\nManifest hash: ${manifest.dist.hash}\nComputed hash: ${distHash}`
    );
  }

  return { manifest, distHash };
}

function computeDistHashFromZip(zip) {
  // Get all dist/ entries, sort lexicographically by their dist-relative paths
  const distEntries = zip.getEntries()
    .filter(e => !e.isDirectory && e.entryName.startsWith('dist/'))
    .sort((a, b) => a.entryName.localeCompare(b.entryName));

  if (distEntries.length === 0) {
    throw new Error('Plugin zip has no dist/ files — entry must be under dist/');
  }

  const hasher = crypto.createHash('sha256');
  for (const entry of distEntries) {
    // Strip the 'dist/' prefix so the hash matches hash-utils.js and build-blessed-plugins.js,
    // both of which compute the hash relative to the dist directory root (e.g. 'index.js').
    const relPath = entry.entryName.slice('dist/'.length);
    hasher.update(relPath + '\n');
    hasher.update(entry.getData());
  }

  return `sha256:${hasher.digest('hex')}`;
}

async function extractBundle(pluginId, bundleBlob, expectedHash) {
  const extractionPath = path.join(EXTRACTION_BASE, pluginId.replace('@', '_at_'));

  // Check if a valid extraction already exists
  const existing = pluginDb.getCurrentExtraction(pluginId);
  if (existing && existing.extracted_hash === expectedHash && fs.existsSync(existing.extraction_path)) {
    return existing.extraction_path; // Cache hit — skip re-extraction
  }

  // Clean up stale extraction
  if (fs.existsSync(extractionPath)) {
    fs.rmSync(extractionPath, { recursive: true, force: true });
  }
  fs.mkdirSync(extractionPath, { recursive: true });

  // Extract zip
  const zip = new AdmZip(bundleBlob);
  zip.extractAllTo(extractionPath, true);

  // Verify extracted content matches expected hash
  const { computeDistHash } = require('./utils/hash-utils');
  const distDir = path.join(extractionPath, 'dist');
  if (!fs.existsSync(distDir)) {
    fs.rmSync(extractionPath, { recursive: true, force: true });
    throw new Error(`Plugin zip extracted but no dist/ directory found in ${pluginId}`);
  }
  const extractedHash = computeDistHash(distDir);

  if (extractedHash !== expectedHash) {
    fs.rmSync(extractionPath, { recursive: true, force: true });
    throw new Error(`Extraction integrity check failed for ${pluginId}`);
  }

  pluginDb.saveExtractionRecord(pluginId, extractionPath, extractedHash);
  return extractionPath;
}

// ============================================================
// SIGNATURE VERIFICATION
// ============================================================

function verifySignatures(manifest) {
  const signatures = manifest.signatures || [];
  const distHash = manifest.dist?.hash;

  if (!distHash) return { verified: false, error: 'No dist.hash to verify against' };

  for (const sig of signatures) {
    const key = pluginDb.getTrustedSigningKey(sig.keyId);
    if (!key) continue; // Key not trusted on this server

    try {
      const verify = crypto.createVerify(
        key.algorithm === 'Ed25519' ? 'Ed25519' : 'RSA-SHA256'
      );
      verify.update(distHash);

      const isValid = verify.verify(
        key.public_key_pem,
        Buffer.from(sig.signature, 'base64')
      );

      if (isValid) {
        return { verified: true, keyId: key.id, keyType: key.key_type };
      }
    } catch (e) {
      continue;
    }
  }

  return { verified: false, error: 'No valid signature found against trusted keys' };
}

// ============================================================
// QUERY
// ============================================================

function list(filter = {}) {
  return pluginDb.getAllPlugins(filter);
}

function getPluginForTool(toolName) {
  const row = pluginDb.getDb().prepare(`
    SELECT p.id, p.name, p.version, p.lifecycle_state
    FROM plugin_tools pt
    JOIN plugins p ON p.id = pt.plugin_id
    WHERE pt.tool_name = ?
  `).get(toolName);
  return row || null;
}

module.exports = {
  setMcpServer,
  install,
  activate,
  deactivate,
  update,
  uninstall,
  list,
  listAvailableFromMarketplace,
  getPluginForTool
};
