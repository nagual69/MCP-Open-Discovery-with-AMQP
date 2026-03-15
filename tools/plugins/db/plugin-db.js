// SPDX-License-Identifier: MPL-2.0
// tools/plugins/db/plugin-db.js
// Plugin Store Database — wraps better-sqlite3 with plugin store operations.
// SQLite is the SINGLE SOURCE OF TRUTH for plugin lifecycle.

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_PATH = process.env.PLUGIN_DB_PATH ||
  path.join(process.env.DATA_DIR || path.join(process.cwd(), 'data'), 'plugin_store.db');

let db = null;

function getDb() {
  if (db) return db;

  const dbDir = path.dirname(DB_PATH);
  if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

  db = new Database(DB_PATH);

  // Apply schema
  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
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
      state, now,    // last_activated condition
      state, now,    // last_deactivated condition
      state, detail, // last_error condition
      state,         // activation_count condition
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

function getPromptCounts() {
  return getDb().prepare(
    'SELECT COUNT(*) as count FROM plugin_prompts WHERE is_active = 1'
  ).get().count;
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
  deletePlugin,
  getPromptCounts
};
