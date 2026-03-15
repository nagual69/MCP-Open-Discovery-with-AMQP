# MCP Open Discovery v2.0 — Architectural Remediation Prompt V2
## Instructions for Claude Code

> **COMPLETION STATUS — Updated 2026-03-15**
>
> | Phase | Status | Notes |
> |-------|--------|-------|
> | Phase 0: SQLite Plugin Store Schema | ✅ **COMPLETE** | `tools/plugins/db/schema.sql` + `plugin-db.js` implemented and operational |
> | Phase 1: Plugin Manager Lifecycle | ✅ **COMPLETE** | `tools/plugins/plugin-manager.js` — install, activate, deactivate, update, uninstall, list all working |
> | Phase 2: Plugin Registry | ✅ **COMPLETE** | `tools/plugins/plugin-registry.js` — initialize, bootstrapBuiltinPlugins, getStats, getPromptCounts, reset |
> | Phase 3: Convert Built-in Tool Groups to Plugins | ✅ **COMPLETE** | **10 plugins** built and operational: `credentials`, `marketplace`, `memory-cmdb`, `net-utils`, `nmap`, `prompts`, `proxmox`, `registry-tools`, `snmp`, `zabbix`. All in `plugins/builtin/` as signed-hash zips. All legacy `tools/*_tools_sdk.js` files renamed `.deprecated`. |
> | Phase 4: Transport Migration to Streamable HTTP | ✅ **COMPLETE** | `tools/transports/core/http-transport.js` uses `StreamableHTTPServerTransport` from `@modelcontextprotocol/sdk/server/streamableHttp.js` |
> | Phase 5: Registry Lifecycle Management Tools | ✅ **COMPLETE** | `registry-tools` plugin exposes `mcp_od_registry_list_plugins`, `mcp_od_registry_list_available`, `mcp_od_registry_install`, `mcp_od_registry_activate`, `mcp_od_registry_deactivate`, `mcp_od_registry_update`, `mcp_od_registry_audit_log`, `mcp_od_registry_add_signing_key`. Marketplace plugin exposes `mcp_od_store_*` (9 tools). |
> | Phase 6: Remove `setRequestHandler` Deprecation | ✅ **COMPLETE** | No active `setRequestHandler` calls in non-deprecated files |
> | Phase 7: Server Entry Point Wiring | ✅ **COMPLETE** | `mcp_open_discovery_server.js` calls `pluginRegistry.initialize()` + `pluginRegistry.bootstrapBuiltinPlugins()`; old `registerAllTools/registerAllResources/registerAllPrompts` removed |
> | Phase 8: Integration Verification | ✅ **COMPLETE** | Server healthy at `http://localhost:6270/health`: **10 plugins, 74 tools, 5 prompts** active |
>
> **Current server state:** `totalPlugins: 10`, `activePlugins: 10`, `activeTools: 74`, `activePrompts: 5`
>
> **Active plugins:** credentials, marketplace, memory-cmdb, net-utils, nmap, prompts, proxmox, registry-tools, snmp, zabbix
>
> **Non-plugin tool files remaining** (intentional — utilities/middleware, no migration needed):
> - `tools/oauth_middleware_sdk.js` — HTTP transport OAuth middleware
> - `tools/sandbox.js` — stub utility
> - `tools/secrets_provider.js` — cloud secrets wrapper (AWS/Azure/local; lazy-loads credentials_manager)

You are performing a **foundational architectural transformation** of the MCP Open Discovery server (`mcp-open-discovery`). This is not an incremental patch — it is a ground-up restructuring of how tools, resources, and prompts are managed, distributed, and executed.

**Read this entire document before touching any file.**

---

## Guiding Principle

The current architecture has tools as flat files loaded directly by the registry. The target architecture has **plugins as the primary deployable unit** — tools, resources, and prompts do not exist outside of plugins. The Plugin Manager backed by SQLite becomes the authoritative runtime for all capability lifecycle. Agents are completely unaware of this — they see only the tools that active plugins expose via `tools/list`.

**The bridge between the MCP OD Marketplace and this server is `mcp-plugin.json` v2.** Both systems speak this spec. Do not invent alternatives.

---

## Important Context: Two Repositories

This remediation touches **two separate projects** that must be aligned:
- `mcp-open-discovery` — the MCP server (this repo)
- `mcp-od-marketplace` — the React/Express marketplace (separate repo)

The `docs/align_tooling_api.txt` file explicitly states these were never aligned. Part of this remediation creates that alignment via the shared plugin spec. Do not assume any existing code bridges them.

---

## Work Order

All phases are **complete as of 2026-03-15**. The sequence below is preserved for historical reference and for use if re-running this remediation from scratch.

```
✅ Phase 0: SQLite Plugin Store Schema
✅ Phase 1: Plugin Manager (Lifecycle State Machine)
✅ Phase 2: Plugin Registry (Replaces Current Registry Core)
✅ Phase 3: Convert Built-in Tool Groups to Blessed Plugins
✅ Phase 4: Transport Migration to Streamable HTTP
✅ Phase 5: Apply Remaining Findings Within Plugin Context
✅ Phase 6: Server Entry Point Wiring
✅ Phase 7: Integration Verification
```

---

## Phase 0: SQLite Plugin Store Schema ✅ COMPLETE

### Objective

Replace the current registry database with a plugin-centric schema. SQLite is the **single source of truth** — it stores the full plugin bundle as a blob alongside all metadata, lifecycle state, and signing information. The filesystem is an ephemeral extraction cache, not a source of truth.

### Create `tools/plugins/db/schema.sql`

```sql
-- ============================================================
-- MCP Open Discovery Plugin Store Schema v1
-- SQLite is authoritative. Filesystem extractions are caches.
-- ============================================================

PRAGMA journal_mode=WAL;
PRAGMA foreign_keys=ON;

-- ============================================================
-- Core Plugin Table
-- ============================================================
CREATE TABLE IF NOT EXISTS plugins (
  id                  TEXT PRIMARY KEY,           -- '<name>@<version>' e.g. 'net-utils@1.0.0'
  name                TEXT NOT NULL,              -- plugin slug e.g. 'net-utils'
  version             TEXT NOT NULL,              -- semver e.g. '1.0.0'
  manifest_json       TEXT NOT NULL,              -- full mcp-plugin.json v2 as JSON string
  bundle_blob         BLOB NOT NULL,              -- full plugin zip archive bytes
  dist_hash           TEXT NOT NULL,              -- sha256:<64hex> from manifest dist.hash
  bundle_size_bytes   INTEGER NOT NULL,
  
  -- Signing
  signature_data      TEXT,                       -- JSON: [{alg, signature, keyId, ts}]
  signature_verified  INTEGER NOT NULL DEFAULT 0, -- 1 = verified at install time
  signer_key_id       TEXT,                       -- references trusted_signing_keys.id
  signer_type         TEXT,                       -- 'vibeforge' | 'enterprise' | 'local' | null
  
  -- Lifecycle
  lifecycle_state     TEXT NOT NULL DEFAULT 'installed',
                      -- installed | active | inactive | error | updating | uninstalling
  is_builtin          INTEGER NOT NULL DEFAULT 0, -- 1 = shipped with server, cannot uninstall
  activation_count    INTEGER NOT NULL DEFAULT 0,
  last_activated      TEXT,                       -- ISO timestamp
  last_deactivated    TEXT,
  last_error          TEXT,                       -- last activation/deactivation error message
  
  -- Provenance
  installed_at        TEXT NOT NULL,              -- ISO timestamp
  installed_by        TEXT NOT NULL DEFAULT 'system', -- 'system' | 'operator' | user id
  source_url          TEXT,                       -- null for local imports
  source_type         TEXT NOT NULL DEFAULT 'local',  -- 'marketplace' | 'local'
  
  -- Hot Swap Support
  previous_version_id TEXT,                       -- points to prior version during update
  update_pending      INTEGER NOT NULL DEFAULT 0, -- 1 = update downloaded, not yet activated
  
  UNIQUE(name, version)
);

-- ============================================================
-- Plugin Capabilities (denormalized for fast tools/list queries)
-- Populated from manifest.capabilities at install time
-- ============================================================
CREATE TABLE IF NOT EXISTS plugin_tools (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  plugin_id   TEXT NOT NULL REFERENCES plugins(id) ON DELETE CASCADE,
  tool_name   TEXT NOT NULL,                      -- e.g. 'mcp_od_net_ping'
  tool_title  TEXT,
  is_active   INTEGER NOT NULL DEFAULT 0,         -- mirrors plugin lifecycle_state == 'active'
  UNIQUE(plugin_id, tool_name)
);

CREATE TABLE IF NOT EXISTS plugin_resources (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  plugin_id      TEXT NOT NULL REFERENCES plugins(id) ON DELETE CASCADE,
  resource_name  TEXT NOT NULL,
  uri_template   TEXT,
  is_active      INTEGER NOT NULL DEFAULT 0,
  UNIQUE(plugin_id, resource_name)
);

CREATE TABLE IF NOT EXISTS plugin_prompts (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  plugin_id    TEXT NOT NULL REFERENCES plugins(id) ON DELETE CASCADE,
  prompt_name  TEXT NOT NULL,
  is_active    INTEGER NOT NULL DEFAULT 0,
  UNIQUE(plugin_id, prompt_name)
);

-- ============================================================
-- Plugin Extraction Cache
-- Tracks where a plugin bundle was last extracted on the filesystem
-- Server verifies extracted_hash before loading
-- ============================================================
CREATE TABLE IF NOT EXISTS plugin_extractions (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  plugin_id        TEXT NOT NULL REFERENCES plugins(id) ON DELETE CASCADE,
  extraction_path  TEXT NOT NULL,                 -- absolute path to extracted dir
  extracted_hash   TEXT NOT NULL,                 -- recomputed at extraction, must match dist_hash
  extracted_at     TEXT NOT NULL,
  is_current       INTEGER NOT NULL DEFAULT 1,    -- only one current extraction per plugin
  UNIQUE(plugin_id, is_current)
);

-- ============================================================
-- Trusted Signing Keys
-- Dual authority: VibeForge (public plugins) + Enterprise (private plugins)
-- ============================================================
CREATE TABLE IF NOT EXISTS trusted_signing_keys (
  id             TEXT PRIMARY KEY,                -- key identifier
  key_type       TEXT NOT NULL,                   -- 'vibeforge' | 'enterprise'
  algorithm      TEXT NOT NULL DEFAULT 'Ed25519', -- 'Ed25519' | 'RSA-SHA256'
  public_key_pem TEXT NOT NULL,
  owner          TEXT,                            -- human-readable owner name
  enterprise_id  TEXT,                            -- for enterprise keys: org identifier
  added_at       TEXT NOT NULL,
  added_by       TEXT,
  is_active      INTEGER NOT NULL DEFAULT 1,
  revoked_at     TEXT,
  revoke_reason  TEXT
);

-- ============================================================
-- Plugin Audit Log
-- Immutable record of all lifecycle events
-- ============================================================
CREATE TABLE IF NOT EXISTS plugin_audit_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  plugin_id   TEXT NOT NULL,                      -- not a FK — survives plugin deletion
  plugin_name TEXT NOT NULL,
  version     TEXT NOT NULL,
  event       TEXT NOT NULL,
                -- installed | activated | deactivated | updated | uninstalled
                -- activation_failed | signature_verified | signature_failed
                -- hash_verified | hash_failed | hot_swap_started | hot_swap_completed
  actor       TEXT NOT NULL DEFAULT 'system',
  detail      TEXT,                               -- JSON with event-specific data
  occurred_at TEXT NOT NULL
);

-- ============================================================
-- Marketplace Access Tokens
-- Stored per-server to authenticate pull requests
-- ============================================================
CREATE TABLE IF NOT EXISTS marketplace_tokens (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  token_hash    TEXT NOT NULL UNIQUE,             -- SHA256 of actual token — never store plaintext
  marketplace_url TEXT NOT NULL,
  scope         TEXT NOT NULL DEFAULT 'read',     -- 'read' only (pull model)
  granted_to    TEXT,                             -- server identifier if applicable
  expires_at    TEXT,
  created_at    TEXT NOT NULL,
  last_used_at  TEXT,
  is_active     INTEGER NOT NULL DEFAULT 1
);

-- ============================================================
-- Indexes
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_plugins_name ON plugins(name);
CREATE INDEX IF NOT EXISTS idx_plugins_lifecycle ON plugins(lifecycle_state);
CREATE INDEX IF NOT EXISTS idx_plugins_builtin ON plugins(is_builtin);
CREATE INDEX IF NOT EXISTS idx_plugin_tools_active ON plugin_tools(is_active);
CREATE INDEX IF NOT EXISTS idx_plugin_tools_name ON plugin_tools(tool_name);
CREATE INDEX IF NOT EXISTS idx_plugin_resources_active ON plugin_resources(is_active);
CREATE INDEX IF NOT EXISTS idx_plugin_prompts_active ON plugin_prompts(is_active);
CREATE INDEX IF NOT EXISTS idx_audit_plugin ON plugin_audit_log(plugin_id, occurred_at);
CREATE INDEX IF NOT EXISTS idx_audit_event ON plugin_audit_log(event, occurred_at);
```

### Create `tools/plugins/db/plugin-db.js`

This module wraps `better-sqlite3` with the plugin store operations. If currently using `sqlite3` (callback-based), **switch to `better-sqlite3` now** — the synchronous API is essential for the hot swap mechanism and dramatically simplifies the lifecycle code.

```bash
npm uninstall sqlite3
npm install better-sqlite3
```

```javascript
// tools/plugins/db/plugin-db.js
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_PATH = process.env.PLUGIN_DB_PATH ||
  path.join(process.env.DATA_DIR || './data', 'plugin_store.db');

let db = null;

function getDb() {
  if (db) return db;
  
  const dbDir = path.dirname(DB_PATH);
  if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });
  
  db = new Database(DB_PATH);
  
  // Apply schema
  const schema = fs.readFileSync(
    path.join(__dirname, 'schema.sql'), 'utf8'
  );
  db.exec(schema);
  
  // Seed built-in VibeForge signing key if not present
  seedBuiltinSigningKeys(db);
  
  return db;
}

function seedBuiltinSigningKeys(db) {
  const vibeforgeKeyId = 'vibeforge-primary-v1';
  const existing = db.prepare(
    'SELECT id FROM trusted_signing_keys WHERE id = ?'
  ).get(vibeforgeKeyId);
  
  if (!existing && process.env.VIBEFORGE_PUBLIC_KEY_PEM) {
    db.prepare(`
      INSERT INTO trusted_signing_keys
        (id, key_type, algorithm, public_key_pem, owner, added_at, added_by, is_active)
      VALUES (?, 'vibeforge', 'Ed25519', ?, 'VibeForge Systems', ?, 'system', 1)
    `).run(vibeforgeKeyId, process.env.VIBEFORGE_PUBLIC_KEY_PEM, new Date().toISOString());
  }
}

// ============================================================
// Plugin CRUD Operations
// ============================================================

function insertPlugin(pluginData) {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO plugins (
      id, name, version, manifest_json, bundle_blob, dist_hash, bundle_size_bytes,
      signature_data, signature_verified, signer_key_id, signer_type,
      lifecycle_state, is_builtin, installed_at, installed_by, source_url, source_type
    ) VALUES (
      @id, @name, @version, @manifest_json, @bundle_blob, @dist_hash, @bundle_size_bytes,
      @signature_data, @signature_verified, @signer_key_id, @signer_type,
      @lifecycle_state, @is_builtin, @installed_at, @installed_by, @source_url, @source_type
    )
  `);
  
  // Atomic: insert plugin + capabilities in a transaction
  const insertCaps = db.transaction((plugin, manifest) => {
    stmt.run(plugin);
    
    const toolStmt = db.prepare(
      'INSERT OR IGNORE INTO plugin_tools (plugin_id, tool_name, tool_title) VALUES (?, ?, ?)'
    );
    const resourceStmt = db.prepare(
      'INSERT OR IGNORE INTO plugin_resources (plugin_id, resource_name, uri_template) VALUES (?, ?, ?)'
    );
    const promptStmt = db.prepare(
      'INSERT OR IGNORE INTO plugin_prompts (plugin_id, prompt_name) VALUES (?, ?)'
    );
    
    const caps = manifest.capabilities || {};
    for (const toolName of (caps.tools || [])) {
      toolStmt.run(plugin.id, toolName, null);
    }
    for (const resource of (caps.resources || [])) {
      const name = typeof resource === 'string' ? resource : resource.name;
      const uri = typeof resource === 'object' ? resource.uriTemplate : null;
      resourceStmt.run(plugin.id, name, uri);
    }
    for (const promptName of (caps.prompts || [])) {
      promptStmt.run(plugin.id, promptName);
    }
    
    auditLog(plugin.id, plugin.name, plugin.version, 'installed', plugin.installed_by);
  });
  
  const manifest = JSON.parse(pluginData.manifest_json);
  insertCaps(pluginData, manifest);
}

function setPluginLifecycleState(pluginId, state, detail = null) {
  const db = getDb();
  const now = new Date().toISOString();
  
  const updatePlugin = db.prepare(`
    UPDATE plugins SET lifecycle_state = ?,
      last_activated = CASE WHEN ? = 'active' THEN ? ELSE last_activated END,
      last_deactivated = CASE WHEN ? = 'inactive' THEN ? ELSE last_deactivated END,
      last_error = CASE WHEN ? = 'error' THEN ? ELSE last_error END,
      activation_count = CASE WHEN ? = 'active' THEN activation_count + 1 ELSE activation_count END
    WHERE id = ?
  `);
  
  const setCapabilitiesActive = db.prepare(`
    UPDATE plugin_tools SET is_active = ? WHERE plugin_id = ?
  `);
  const setResourcesActive = db.prepare(`
    UPDATE plugin_resources SET is_active = ? WHERE plugin_id = ?
  `);
  const setPromptsActive = db.prepare(`
    UPDATE plugin_prompts SET is_active = ? WHERE plugin_id = ?
  `);
  
  const isActive = state === 'active' ? 1 : 0;
  
  const transaction = db.transaction(() => {
    updatePlugin.run(
      state,
      state, now,  // last_activated condition
      state, now,  // last_deactivated condition
      state, detail, // last_error condition
      state,       // activation_count condition
      pluginId
    );
    setCapabilitiesActive.run(isActive, pluginId);
    setResourcesActive.run(isActive, pluginId);
    setPromptsActive.run(isActive, pluginId);
  });
  
  transaction();
}

function getPlugin(pluginId) {
  return getDb().prepare('SELECT * FROM plugins WHERE id = ?').get(pluginId);
}

function getPluginByName(name) {
  return getDb().prepare(
    "SELECT * FROM plugins WHERE name = ? AND lifecycle_state NOT IN ('uninstalling') ORDER BY installed_at DESC LIMIT 1"
  ).get(name);
}

function getActivePlugins() {
  return getDb().prepare(
    "SELECT id, name, version, manifest_json FROM plugins WHERE lifecycle_state = 'active'"
  ).all();
}

function getActiveToolNames() {
  return getDb().prepare(
    'SELECT tool_name FROM plugin_tools WHERE is_active = 1'
  ).all().map(r => r.tool_name);
}

function getAllPlugins(filter = {}) {
  let query = 'SELECT id, name, version, manifest_json, lifecycle_state, is_builtin, installed_at, source_type, bundle_size_bytes FROM plugins';
  const params = [];
  
  if (filter.state) {
    query += ' WHERE lifecycle_state = ?';
    params.push(filter.state);
  }
  
  query += ' ORDER BY is_builtin DESC, name ASC';
  return getDb().prepare(query).all(...params);
}

function getBundleBlob(pluginId) {
  const row = getDb().prepare('SELECT bundle_blob FROM plugins WHERE id = ?').get(pluginId);
  return row ? row.bundle_blob : null;
}

function getTrustedSigningKey(keyId) {
  return getDb().prepare(
    'SELECT * FROM trusted_signing_keys WHERE id = ? AND is_active = 1'
  ).get(keyId);
}

function getAllTrustedKeys() {
  return getDb().prepare(
    'SELECT id, key_type, algorithm, owner, enterprise_id FROM trusted_signing_keys WHERE is_active = 1'
  ).all();
}

function insertTrustedKey(keyData) {
  getDb().prepare(`
    INSERT INTO trusted_signing_keys
      (id, key_type, algorithm, public_key_pem, owner, enterprise_id, added_at, added_by, is_active)
    VALUES (@id, @key_type, @algorithm, @public_key_pem, @owner, @enterprise_id, @added_at, @added_by, 1)
  `).run(keyData);
}

function saveExtractionRecord(pluginId, extractionPath, extractedHash) {
  const db = getDb();
  // Clear old current extraction record
  db.prepare(
    'UPDATE plugin_extractions SET is_current = 0 WHERE plugin_id = ?'
  ).run(pluginId);
  // Insert new
  db.prepare(`
    INSERT INTO plugin_extractions (plugin_id, extraction_path, extracted_hash, extracted_at, is_current)
    VALUES (?, ?, ?, ?, 1)
  `).run(pluginId, extractionPath, extractedHash, new Date().toISOString());
}

function getCurrentExtraction(pluginId) {
  return getDb().prepare(
    'SELECT * FROM plugin_extractions WHERE plugin_id = ? AND is_current = 1'
  ).get(pluginId);
}

function auditLog(pluginId, pluginName, version, event, actor = 'system', detail = null) {
  getDb().prepare(`
    INSERT INTO plugin_audit_log (plugin_id, plugin_name, version, event, actor, detail, occurred_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(pluginId, pluginName, version, event, actor, detail ? JSON.stringify(detail) : null, new Date().toISOString());
}

function getAuditLog(pluginId, limit = 50) {
  return getDb().prepare(
    'SELECT * FROM plugin_audit_log WHERE plugin_id = ? ORDER BY occurred_at DESC LIMIT ?'
  ).all(pluginId, limit);
}

function deletePlugin(pluginId) {
  const db = getDb();
  const plugin = getPlugin(pluginId);
  if (!plugin) return;
  if (plugin.is_builtin) throw new Error(`Cannot uninstall built-in plugin: ${pluginId}`);
  
  // ON DELETE CASCADE handles plugin_tools, plugin_resources, plugin_prompts, plugin_extractions
  db.prepare('DELETE FROM plugins WHERE id = ?').run(pluginId);
  auditLog(pluginId, plugin.name, plugin.version, 'uninstalled', 'operator');
}

module.exports = {
  getDb,
  insertPlugin,
  setPluginLifecycleState,
  getPlugin,
  getPluginByName,
  getActivePlugins,
  getActiveToolNames,
  getAllPlugins,
  getBundleBlob,
  getTrustedSigningKey,
  getAllTrustedKeys,
  insertTrustedKey,
  saveExtractionRecord,
  getCurrentExtraction,
  auditLog,
  getAuditLog,
  deletePlugin
};
```

**Gate:** `node -e "const db = require('./tools/plugins/db/plugin-db.js'); db.getDb(); console.log('Schema OK');"` — should print "Schema OK" without errors.

---

## Phase 1: Plugin Manager (Lifecycle State Machine) ✅ COMPLETE

### Objective

Create `tools/plugins/plugin-manager.js` — the authoritative controller for all plugin lifecycle operations. This replaces the current `registry/index.js` as the primary capability manager.

### Create `tools/plugins/plugin-manager.js`

```javascript
// tools/plugins/plugin-manager.js

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const AdmZip = require('adm-zip');
const pluginDb = require('./db/plugin-db');

const EXTRACTION_BASE = process.env.PLUGIN_EXTRACTION_DIR ||
  path.join(process.env.DATA_DIR || './data', 'plugin_extractions');
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
  
  if (source.startsWith('http://') || source.startsWith('https://')) {
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
  const { actor = 'operator' } = options;
  
  if (!mcpServerRef) throw new Error('MCP server not initialized — call setMcpServer() first');
  
  const plugin = pluginDb.getPlugin(pluginId);
  if (!plugin) throw new Error(`Plugin not found: ${pluginId}`);
  if (plugin.lifecycle_state === 'active') return { alreadyActive: true };
  
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
    
    // Clear require cache for hot reload support
    delete require.cache[require.resolve(entryPath)];
    
    // Load and execute createPlugin
    const pluginModule = require(entryPath);
    const createPlugin = pluginModule.createPlugin || pluginModule.default?.createPlugin;
    
    if (typeof createPlugin !== 'function') {
      throw new Error(`Plugin ${pluginId} entry does not export createPlugin(server)`);
    }
    
    await createPlugin(mcpServerRef);
    
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
  // The SDK will re-issue tools/list, which now excludes this plugin's tools
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
  // (Update new plugin record to reference the previous version)
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
// INTEGRITY & EXTRACTION
// ============================================================

async function extractAndVerify(zipBuffer) {
  const zip = new AdmZip(zipBuffer);
  const manifestEntry = zip.getEntry('mcp-plugin.json');
  
  if (!manifestEntry) throw new Error('Plugin zip missing mcp-plugin.json manifest');
  
  const manifest = JSON.parse(manifestEntry.getData().toString('utf8'));
  
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
  // Get all dist/ entries, sort lexicographically
  const distEntries = zip.getEntries()
    .filter(e => !e.isDirectory && e.entryName.startsWith('dist/'))
    .sort((a, b) => a.entryName.localeCompare(b.entryName));
  
  if (distEntries.length === 0) {
    throw new Error('Plugin zip has no dist/ files — entry must be under dist/');
  }
  
  const hasher = crypto.createHash('sha256');
  for (const entry of distEntries) {
    hasher.update(entry.entryName + '\n');
    hasher.update(entry.getData());
  }
  
  return `sha256:${hasher.digest('hex')}`;
}

async function extractBundle(pluginId, bundleBlob, expectedHash) {
  const extractionPath = path.join(EXTRACTION_BASE, pluginId.replace('@', '_'));
  
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
  const crypto = require('crypto');
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
```

**Gate:** `node -e "const pm = require('./tools/plugins/plugin-manager.js'); console.log('Plugin Manager OK');"` — should load without errors.

---

## Phase 2: Plugin Registry (Replaces Current Registry Core) ✅ COMPLETE

### Objective

Replace `tools/registry/index.js` with a new `tools/plugins/plugin-registry.js` that:
1. On startup, loads all `active` plugins from SQLite and registers their capabilities with the MCP server
2. Provides the interface the main server uses instead of the old registry

### Create `tools/plugins/plugin-registry.js`

```javascript
// tools/plugins/plugin-registry.js
const pluginManager = require('./plugin-manager');
const pluginDb = require('./db/plugin-db');

let mcpServer = null;
let initialized = false;

/**
 * Initialize the plugin registry with the singleton MCP server.
 * Loads all previously active plugins from SQLite on startup.
 */
async function initialize(server) {
  if (initialized) return;
  mcpServer = server;
  pluginManager.setMcpServer(server);
  
  // Re-activate all plugins that were active before this server instance started
  const activePlugins = pluginDb.getActivePlugins();
  const results = { loaded: [], failed: [] };
  
  for (const plugin of activePlugins) {
    try {
      await pluginManager.activate(plugin.id, { actor: 'system_startup' });
      const manifest = JSON.parse(plugin.manifest_json);
      results.loaded.push({
        id: plugin.id,
        tools: manifest.capabilities?.tools?.length || 0,
        resources: manifest.capabilities?.resources?.length || 0,
        prompts: manifest.capabilities?.prompts?.length || 0
      });
    } catch (error) {
      results.failed.push({ id: plugin.id, error: error.message });
    }
  }
  
  initialized = true;
  return results;
}

/**
 * Bootstrap built-in (blessed) plugins on first run.
 * Built-in plugins are pre-packaged in the server's plugins/builtin/ directory.
 * They are installed and activated automatically if not already in the DB.
 */
async function bootstrapBuiltinPlugins() {
  const path = require('path');
  const fs = require('fs');
  
  const builtinDir = path.join(__dirname, '../../plugins/builtin');
  if (!fs.existsSync(builtinDir)) return;
  
  const builtinZips = fs.readdirSync(builtinDir)
    .filter(f => f.endsWith('.zip'));
  
  for (const zipFile of builtinZips) {
    const zipPath = path.join(builtinDir, zipFile);
    try {
      const existing = pluginDb.getPlugin(
        zipFile.replace('.zip', '').replace('_', '@')
      );
      if (!existing) {
        await pluginManager.install(zipPath, {
          actor: 'system',
          isBuiltin: true,
          autoActivate: true
        });
      }
    } catch (error) {
      console.error(`[PluginRegistry] Failed to bootstrap builtin plugin ${zipFile}:`, error.message);
    }
  }
}

function getStats() {
  const db = pluginDb.getDb();
  const total = db.prepare('SELECT COUNT(*) as c FROM plugins').get().c;
  const active = db.prepare("SELECT COUNT(*) as c FROM plugins WHERE lifecycle_state = 'active'").get().c;
  const tools = db.prepare('SELECT COUNT(*) as c FROM plugin_tools WHERE is_active = 1').get().c;
  const resources = db.prepare('SELECT COUNT(*) as c FROM plugin_resources WHERE is_active = 1').get().c;
  const prompts = db.prepare('SELECT COUNT(*) as c FROM plugin_prompts WHERE is_active = 1').get().c;
  
  return { totalPlugins: total, activePlugins: active, activeTools: tools, activeResources: resources, activePrompts: prompts };
}

module.exports = { initialize, bootstrapBuiltinPlugins, getStats };
```

**Gate:** Review that `tools/registry/index.js` is no longer the startup path. Update `mcp_open_discovery_server.js` to call `pluginRegistry.initialize(server)` and `pluginRegistry.bootstrapBuiltinPlugins()` instead of the old `registerAllTools()`.

---

## Phase 3: Convert Built-in Tool Groups to Blessed Plugins ✅ COMPLETE

### Objective

Convert each of the 8 existing tool groups into a proper plugin package. Each plugin gets:
- A `mcp-plugin.json` v2 manifest
- A `createPlugin(server)` entry point
- All 7 remediation findings applied (annotations, naming, response_format, pagination, structuredContent)
- A pre-built zip stored in `plugins/builtin/`

### Directory Structure Per Plugin

```
plugins/
└── builtin/
    ├── net-utils@1.0.0.zip          ← pre-built, pre-hashed
    ├── memory-cmdb@1.0.0.zip
    ├── credentials@1.0.0.zip
    ├── proxmox@1.0.0.zip
    ├── snmp@1.0.0.zip
    ├── zabbix@1.0.0.zip
    ├── nmap@1.0.0.zip
    └── registry-tools@1.0.0.zip
└── src/
    ├── net-utils/
    │   ├── mcp-plugin.json
    │   ├── package.json
    │   └── src/
    │       └── index.js             ← createPlugin(server) entry
    ├── memory-cmdb/
    ├── credentials/
    ├── proxmox/
    ├── snmp/
    ├── zabbix/
    ├── nmap/
    └── registry-tools/
```

### Plugin Source Template

Apply this template to ALL 8 tool groups. The example below shows `net-utils` — repeat for each group with appropriate tool names and implementations.

**`plugins/src/net-utils/mcp-plugin.json`:**
```json
{
  "manifestVersion": "2",
  "name": "net-utils",
  "version": "1.0.0",
  "entry": "dist/index.js",
  "description": "Core network discovery and diagnostic tools",
  "author": "VibeForge Systems",
  "license": "MPL-2.0",
  "permissions": { "network": true },
  "capabilities": {
    "tools": [
      "mcp_od_net_ping",
      "mcp_od_net_wget",
      "mcp_od_net_nslookup",
      "mcp_od_net_netstat",
      "mcp_od_net_telnet",
      "mcp_od_net_route",
      "mcp_od_net_ifconfig",
      "mcp_od_net_arp"
    ],
    "resources": [],
    "prompts": []
  },
  "dependencies": [],
  "dependenciesPolicy": "bundled-only",
  "dist": {
    "hash": "sha256:COMPUTED_AT_BUILD_TIME"
  }
}
```

**`plugins/src/net-utils/src/index.js`:**
```javascript
// Entry point for net-utils plugin
// Exports createPlugin(server) — called by Plugin Manager at activation time

const { z } = require('zod');

// ── Shared Schemas ──────────────────────────────────────────
const ResponseFormatSchema = z.enum(['json', 'markdown']).default('markdown')
  .describe("Output format: 'markdown' for human-readable (default), 'json' for machine-readable");

const PaginationSchema = {
  limit: z.number().int().min(1).max(200).default(20)
    .describe('Maximum results to return per page (default: 20, max: 200)'),
  offset: z.number().int().min(0).default(0)
    .describe('Number of results to skip for pagination (default: 0)')
};

// ── Utilities ───────────────────────────────────────────────
function paginateResults(allResults, limit = 20, offset = 0) {
  const total = allResults.length;
  const page = allResults.slice(offset, offset + limit);
  const hasMore = offset + limit < total;
  return {
    total_count: total,
    count: page.length,
    offset,
    limit,
    has_more: hasMore,
    next_offset: hasMore ? offset + limit : null,
    items: page
  };
}

function buildResponse(structuredData, markdownText, format) {
  return {
    content: [{
      type: 'text',
      text: format === 'json' ? JSON.stringify(structuredData, null, 2) : markdownText
    }],
    structuredContent: structuredData
  };
}

// ── Plugin Entry ─────────────────────────────────────────────
async function createPlugin(server) {

  server.registerTool(
    'mcp_od_net_ping',
    {
      title: 'Network Ping',
      description: `Send ICMP echo requests to a host and report reachability and latency.
Use for basic host reachability verification before more complex operations.
Do NOT use for port connectivity (use mcp_od_net_telnet instead).`,
      inputSchema: {
        host: z.string().min(1).describe('IP address or hostname to ping'),
        count: z.number().int().min(1).max(20).default(4).describe('Number of ICMP requests'),
        timeout: z.number().int().min(1).max(30).default(5).describe('Timeout per request in seconds'),
        response_format: ResponseFormatSchema
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true
      }
    },
    async ({ host, count, timeout, response_format }) => {
      try {
        const result = await executePing(host, count, timeout);
        const md = `## Ping: ${host}\n- Reachable: ${result.reachable}\n- Avg RTT: ${result.avg_ms}ms\n- Packet loss: ${result.packet_loss_percent}%`;
        return buildResponse(result, md, response_format);
      } catch (error) {
        return {
          isError: true,
          content: [{ type: 'text', text: `Ping failed for ${host}: ${error.message}` }]
        };
      }
    }
  );

  // Register remaining net tools: mcp_od_net_wget, mcp_od_net_nslookup, etc.
  // Follow the same pattern for each tool in the group.
  // Apply annotations, response_format, and structuredContent to every tool.
}

module.exports = { createPlugin };
```

### Build Script for Blessed Plugins

Create `plugins/scripts/build-blessed-plugins.js`:

```javascript
// plugins/scripts/build-blessed-plugins.js
// Run this script to build and hash all blessed plugin zips
// Usage: node plugins/scripts/build-blessed-plugins.js

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const AdmZip = require('adm-zip');

const SRC_DIR = path.join(__dirname, '..', 'src');
const OUT_DIR = path.join(__dirname, '..', 'builtin');

if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

const plugins = fs.readdirSync(SRC_DIR).filter(d =>
  fs.statSync(path.join(SRC_DIR, d)).isDirectory()
);

for (const pluginDir of plugins) {
  const pluginPath = path.join(SRC_DIR, pluginDir);
  const manifestPath = path.join(pluginPath, 'mcp-plugin.json');
  
  if (!fs.existsSync(manifestPath)) continue;
  
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  
  // Compute dist hash
  const distDir = path.join(pluginPath, 'dist');
  if (!fs.existsSync(distDir)) {
    console.error(`SKIP: ${pluginDir} — no dist/ directory. Run npm run build first.`);
    continue;
  }
  
  const distHash = computeDistHash(distDir);
  manifest.dist = manifest.dist || {};
  manifest.dist.hash = distHash;
  
  // Write updated manifest back
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  
  // Create zip
  const zip = new AdmZip();
  zip.addFile('mcp-plugin.json', Buffer.from(JSON.stringify(manifest, null, 2)));
  
  const addDir = (dir, zipPrefix) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      const zipPath = path.join(zipPrefix, entry.name);
      if (entry.isDirectory()) {
        addDir(fullPath, zipPath);
      } else {
        zip.addFile(zipPath, fs.readFileSync(fullPath));
      }
    }
  };
  
  addDir(distDir, 'dist');
  
  const outputName = `${manifest.name}@${manifest.version}.zip`;
  const outputPath = path.join(OUT_DIR, outputName);
  zip.writeZip(outputPath);
  
  console.log(`BUILT: ${outputName} (hash: ${distHash.slice(0, 20)}...)`);
}

function computeDistHash(distDir) {
  const files = collectFiles(distDir).sort();
  const hasher = crypto.createHash('sha256');
  for (const filePath of files) {
    const relative = path.relative(distDir, filePath).split(path.sep).join('/');
    hasher.update(relative + '\n');
    hasher.update(fs.readFileSync(filePath));
  }
  return `sha256:${hasher.digest('hex')}`;
}

function collectFiles(dir) {
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) results.push(...collectFiles(fullPath));
    else if (!entry.name.startsWith('.')) results.push(fullPath);
  }
  return results;
}
```

### Plugin Conversion Checklist (Apply to Each of 8 Groups)

For each tool group (net, memory, credentials, proxmox, snmp, zabbix, nmap, registry-tools):

- [x] Create `plugins/src/<group>/mcp-plugin.json` with correct capabilities list
- [x] Create `plugins/src/<group>/src/index.js` with `createPlugin(server)` export
- [x] Move all tool registration logic from `tools/<old_module>_tools_sdk.js` into `createPlugin(server)`
- [x] Rename all tools to `mcp_od_<group>_<tool>` format within the new registration
- [x] Add `annotations` block to every tool (use matrix from V1 remediation prompt — same values apply)
- [x] Add `response_format` parameter to all data-returning tools
- [x] Add `limit` / `offset` pagination to all list/discovery tools using `paginateResults()`
- [x] Return `structuredContent` alongside `content` in every tool response
- [x] Build plugin: ensure `dist/` is populated
- [x] Run build script: `node plugins/scripts/build-blessed-plugins.js`
- [x] Verify zip created in `plugins/builtin/`

**All 10 plugins built and active** (8 original groups + `marketplace` + `prompts`):

| Plugin | Tools | Zip |
|--------|-------|-----|
| credentials | 5 | `credentials@1.0.0.zip` |
| marketplace | 9 | `marketplace@1.0.0.zip` |
| memory-cmdb | 9 | `memory-cmdb@1.0.0.zip` |
| net-utils | 9 | `net-utils@1.0.0.zip` |
| nmap | 5 | `nmap@1.0.0.zip` |
| prompts | — / 5 prompts | `prompts@1.0.0.zip` |
| proxmox | 10 | `proxmox@1.0.0.zip` |
| registry-tools | 8 | `registry-tools@1.0.0.zip` |
| snmp | 12 | `snmp@1.0.0.zip` |
| zabbix | 7 | `zabbix@1.0.0.zip` |
| **Total** | **74 tools + 5 prompts** | |

---

## Phase 4: Transport Migration to Streamable HTTP ✅ COMPLETE

This phase is **unchanged from the V1 prompt** (Finding 7). Execute it exactly as specified in `CLAUDE_CODE_REMEDIATION_PROMPT.md` Phase 4 / Finding 7.

The streamable HTTP transport is not affected by the plugin architecture change. Execute it here, after the plugin manager is in place, so transport tests run against the new architecture.

**Gate:** `curl http://localhost:6270/health | jq .` returns healthy. Stateless and session-based requests both work.

---

## Phase 5: Registry Lifecycle Management Tools ✅ COMPLETE

### Objective

Replace the old `tool_store_*` tools with a proper plugin lifecycle tool set. These become the `registry-tools` plugin (converted in Phase 3, extended here). Agents use these tools to interact with the plugin manager. Operator-level lifecycle management is exposed as MCP tools so that agentic workflows can manage plugins programmatically.

### Tools to Register in `registry-tools` Plugin

Register these in the `registry-tools` plugin's `createPlugin(server)`:

```javascript
// ── List installed plugins ───────────────────────────────────
server.registerTool(
  'mcp_od_registry_list_plugins',
  {
    title: 'List Installed Plugins',
    description: 'List all installed plugins and their lifecycle state.',
    inputSchema: {
      filter_state: z.enum(['all', 'active', 'inactive', 'installed', 'error'])
        .default('all').describe('Filter by lifecycle state'),
      response_format: ResponseFormatSchema
    },
    annotations: {
      readOnlyHint: true, destructiveHint: false,
      idempotentHint: true, openWorldHint: false
    }
  },
  async ({ filter_state, response_format }) => {
    const plugins = pluginManager.list(filter_state === 'all' ? {} : { state: filter_state });
    const paginated = paginateResults(plugins, 50, 0); // plugins list is small, 50 default
    const md = plugins.map(p =>
      `**${p.name}@${p.version}** [${p.lifecycle_state}]${p.is_builtin ? ' *(built-in)*' : ''}`
    ).join('\n');
    return buildResponse(paginated, `## Installed Plugins\n${md}`, response_format);
  }
);

// ── List available from Marketplace ─────────────────────────
server.registerTool(
  'mcp_od_registry_list_available',
  {
    title: 'List Available Plugins from Marketplace',
    description: 'Fetch list of plugins available to pull from the VibeForge Marketplace. Requires a Marketplace access token.',
    inputSchema: { response_format: ResponseFormatSchema },
    annotations: {
      readOnlyHint: true, destructiveHint: false,
      idempotentHint: false, openWorldHint: true
    }
  },
  async ({ response_format }) => {
    const available = await pluginManager.listAvailableFromMarketplace();
    return buildResponse(available, formatAvailablePlugins(available), response_format);
  }
);

// ── Install plugin ───────────────────────────────────────────
server.registerTool(
  'mcp_od_registry_install',
  {
    title: 'Install Plugin',
    description: 'Install a plugin from the Marketplace (by URL) or from a local file path. Does not activate — use mcp_od_registry_activate after install.',
    inputSchema: {
      source: z.string().describe('Marketplace URL or local file path to plugin zip'),
      auto_activate: z.boolean().default(false).describe('Automatically activate after install')
    },
    annotations: {
      readOnlyHint: false, destructiveHint: false,
      idempotentHint: false, openWorldHint: true
    }
  },
  async ({ source, auto_activate }) => {
    const result = await pluginManager.install(source, { actor: 'agent', autoActivate: auto_activate });
    return { content: [{ type: 'text', text: `Installed ${result.pluginId}` }], structuredContent: result };
  }
);

// ── Activate plugin ──────────────────────────────────────────
server.registerTool(
  'mcp_od_registry_activate',
  {
    title: 'Activate Plugin',
    description: 'Activate an installed plugin. Its tools/resources/prompts will appear in tools/list immediately.',
    inputSchema: { plugin_id: z.string().describe('Plugin ID in format name@version') },
    annotations: {
      readOnlyHint: false, destructiveHint: false,
      idempotentHint: false, openWorldHint: false
    }
  },
  async ({ plugin_id }) => {
    const result = await pluginManager.activate(plugin_id, { actor: 'agent' });
    return { content: [{ type: 'text', text: `Activated ${plugin_id}` }], structuredContent: result };
  }
);

// ── Deactivate plugin ────────────────────────────────────────
server.registerTool(
  'mcp_od_registry_deactivate',
  {
    title: 'Deactivate Plugin',
    description: 'Deactivate an active plugin. Its tools/resources/prompts are removed from tools/list immediately. Plugin remains installed.',
    inputSchema: { plugin_id: z.string().describe('Plugin ID in format name@version') },
    annotations: {
      readOnlyHint: false, destructiveHint: false,
      idempotentHint: false, openWorldHint: false
    }
  },
  async ({ plugin_id }) => {
    const result = await pluginManager.deactivate(plugin_id, { actor: 'agent' });
    return { content: [{ type: 'text', text: `Deactivated ${plugin_id}` }], structuredContent: result };
  }
);

// ── Hot swap update ──────────────────────────────────────────
server.registerTool(
  'mcp_od_registry_update',
  {
    title: 'Update Plugin (Hot Swap)',
    description: 'Install a new plugin version and hot-swap it for the running version without server restart. Rolls back automatically if the new version fails to activate.',
    inputSchema: {
      plugin_name: z.string().describe('Plugin name (without version) to update'),
      source: z.string().describe('Marketplace URL or local file path to new version zip')
    },
    annotations: {
      readOnlyHint: false, destructiveHint: false,
      idempotentHint: false, openWorldHint: true
    }
  },
  async ({ plugin_name, source }) => {
    const result = await pluginManager.update(plugin_name, source, { actor: 'agent' });
    return { content: [{ type: 'text', text: `Hot-swapped ${plugin_name} to ${result.newVersion}` }], structuredContent: result };
  }
);

// ── Get plugin audit log ─────────────────────────────────────
server.registerTool(
  'mcp_od_registry_audit_log',
  {
    title: 'Get Plugin Audit Log',
    description: 'Retrieve the lifecycle audit log for a specific plugin.',
    inputSchema: {
      plugin_id: z.string().describe('Plugin ID in format name@version'),
      limit: z.number().int().min(1).max(100).default(20),
      response_format: ResponseFormatSchema
    },
    annotations: {
      readOnlyHint: true, destructiveHint: false,
      idempotentHint: true, openWorldHint: false
    }
  },
  async ({ plugin_id, limit, response_format }) => {
    const log = pluginDb.getAuditLog(plugin_id, limit);
    return buildResponse(log, formatAuditLog(log), response_format);
  }
);

// ── Add enterprise signing key ───────────────────────────────
server.registerTool(
  'mcp_od_registry_add_signing_key',
  {
    title: 'Add Trusted Signing Key',
    description: 'Add an enterprise signing key to trust for plugin signature verification. Only enterprise keys can be added via this tool — VibeForge keys are pre-seeded.',
    inputSchema: {
      key_id: z.string().describe('Unique identifier for this key'),
      public_key_pem: z.string().describe('PEM-encoded public key'),
      algorithm: z.enum(['Ed25519', 'RSA-SHA256']).default('Ed25519'),
      owner: z.string().describe('Organization or team that owns this key'),
      enterprise_id: z.string().optional().describe('Enterprise identifier')
    },
    annotations: {
      readOnlyHint: false, destructiveHint: false,
      idempotentHint: false, openWorldHint: false
    }
  },
  async ({ key_id, public_key_pem, algorithm, owner, enterprise_id }) => {
    pluginDb.insertTrustedKey({
      id: key_id,
      key_type: 'enterprise',
      algorithm,
      public_key_pem,
      owner,
      enterprise_id: enterprise_id || null,
      added_at: new Date().toISOString(),
      added_by: 'operator'
    });
    return { content: [{ type: 'text', text: `Trusted signing key added: ${key_id}` }], structuredContent: { key_id, key_type: 'enterprise', owner } };
  }
);
```

---

## Phase 6: Remove `setRequestHandler` Deprecation ✅ COMPLETE

**Unchanged from V1 remediation prompt (Finding 5).** Execute as specified. The `logging/setLevel` handler is the only instance. Verify with `grep -rn "setRequestHandler" . --include="*.js" --exclude-dir=node_modules`.

---

## Phase 7: Server Entry Point Wiring ✅ COMPLETE

Update `mcp_open_discovery_server.js` to use the new plugin registry:

```javascript
// Replace the old registerAllTools / registerAllResources / registerAllPrompts calls:

// OLD:
// await registerAllTools(globalMcpServer);
// await registerAllResources(globalMcpServer);
// await registerAllPrompts(globalMcpServer);

// NEW:
const pluginRegistry = require('./tools/plugins/plugin-registry');

// In createMcpServer(), after server is created:
await pluginRegistry.bootstrapBuiltinPlugins();
await pluginRegistry.initialize(globalMcpServer);

// Update getHealthData() to use pluginRegistry.getStats() instead of getRegistry().getStats()
```

Update `package.json` to add `better-sqlite3` and remove `sqlite3`:
```bash
npm uninstall sqlite3
npm install better-sqlite3
```

---

## Phase 8: Integration Verification ✅ COMPLETE

```bash
# 1. Schema created
node -e "require('./tools/plugins/db/plugin-db').getDb(); console.log('DB OK')"

# 2. Plugin manager loads
node -e "require('./tools/plugins/plugin-manager'); console.log('Manager OK')"

# 3. Server starts
npm start &
sleep 5
curl http://localhost:6270/health | jq '{status, registry: .registry}'

# 4. Tools list shows only active plugin tools, all with mcp_od_ prefix
curl -s -X POST http://localhost:6270/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' \
  | jq '[.result.tools[].name] | sort'

# 5. Verify annotations present
curl -s -X POST http://localhost:6270/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' \
  | jq '.result.tools[0] | {name, annotations}'

# 6. Verify lifecycle tools are available
curl -s -X POST http://localhost:6270/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"mcp_od_registry_list_plugins","arguments":{"response_format":"json"}}}' \
  | jq '.result.content[0].text | fromjson'

# 7. Verify pagination
curl -s -X POST http://localhost:6270/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"mcp_od_snmp_device_inventory","arguments":{"host":"127.0.0.1","limit":3,"offset":0,"response_format":"json"}}}' \
  | jq '.result.content[0].text | fromjson | {total_count, count, has_more}'

# 8. Test deactivate → tools disappear → reactivate → tools reappear
BEFORE=$(curl -s -X POST http://localhost:6270/mcp -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | jq '.result.tools | length')

curl -s -X POST http://localhost:6270/mcp -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"mcp_od_registry_deactivate","arguments":{"plugin_id":"net-utils@1.0.0"}}}'

AFTER=$(curl -s -X POST http://localhost:6270/mcp -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/list"}' | jq '.result.tools | length')

echo "Tools before deactivate: $BEFORE, after: $AFTER"
# Should be 8 fewer (the net-utils tools are gone)

# Reactivate
curl -s -X POST http://localhost:6270/mcp -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"mcp_od_registry_activate","arguments":{"plugin_id":"net-utils@1.0.0"}}}'

npm test
```

---

## Alignment Note: Marketplace Integration

The `docs/align_tooling_api.txt` requirement is partially satisfied by this remediation. After completing these phases:

- The `mcp-plugin.json` v2 spec is the shared contract ✅
- The server can install plugins from local zip files ✅
- The server can verify signatures against trusted keys ✅
- The Marketplace-to-server pull connection (Marketplace hosting plugin packages + server pulling via URL) requires the **Marketplace backend to expose a plugin download API** — this is a separate task in the Marketplace repo, not in this server. The V2 TypeScript Migration Plan covers the full integration design.
