"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDb = getDb;
exports.closeDb = closeDb;
exports.insertPlugin = insertPlugin;
exports.setPluginLifecycleState = setPluginLifecycleState;
exports.getPlugin = getPlugin;
exports.getPluginByName = getPluginByName;
exports.getActivePlugins = getActivePlugins;
exports.getAllPlugins = getAllPlugins;
exports.getActiveToolNames = getActiveToolNames;
exports.getBundleBlob = getBundleBlob;
exports.getTrustedSigningKey = getTrustedSigningKey;
exports.getAllTrustedKeys = getAllTrustedKeys;
exports.insertTrustedKey = insertTrustedKey;
exports.saveExtractionRecord = saveExtractionRecord;
exports.getCurrentExtraction = getCurrentExtraction;
exports.auditLog = auditLog;
exports.getAuditLog = getAuditLog;
exports.deletePlugin = deletePlugin;
exports.getPromptCounts = getPromptCounts;
const better_sqlite3_1 = __importDefault(require("better-sqlite3"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const DATA_DIR = process.env.DATA_DIR || path_1.default.join(process.cwd(), 'data');
const DB_PATH = process.env.PLUGIN_DB_PATH || path_1.default.join(DATA_DIR, 'plugin_store.db');
const SCHEMA_PATH_CANDIDATES = [
    path_1.default.join(__dirname, 'schema.sql'),
    path_1.default.join(process.cwd(), 'src', 'plugins', 'db', 'schema.sql'),
];
let db = null;
function ensureParentDirectory(filePath) {
    const directory = path_1.default.dirname(filePath);
    if (!fs_1.default.existsSync(directory)) {
        fs_1.default.mkdirSync(directory, { recursive: true });
    }
}
function resolveSchemaPath() {
    const schemaPath = SCHEMA_PATH_CANDIDATES.find((candidate) => fs_1.default.existsSync(candidate));
    if (!schemaPath) {
        throw new Error(`Unable to locate plugin schema.sql. Tried: ${SCHEMA_PATH_CANDIDATES.join(', ')}`);
    }
    return schemaPath;
}
function seedBuiltinSigningKeys(database) {
    const vibeforgeKeyId = 'vibeforge-primary-v1';
    const publicKeyPem = process.env.VIBEFORGE_PUBLIC_KEY_PEM;
    if (!publicKeyPem) {
        return;
    }
    const existing = database
        .prepare('SELECT id FROM trusted_signing_keys WHERE id = ?')
        .get(vibeforgeKeyId);
    if (existing) {
        return;
    }
    database
        .prepare(`
      INSERT INTO trusted_signing_keys
        (id, key_type, algorithm, public_key_pem, owner, added_at, added_by, is_active)
      VALUES (?, 'vibeforge', 'Ed25519', ?, 'VibeForge Systems', ?, 'system', 1)
      `)
        .run(vibeforgeKeyId, publicKeyPem, new Date().toISOString());
}
function getDb() {
    if (db) {
        return db;
    }
    ensureParentDirectory(DB_PATH);
    db = new better_sqlite3_1.default(DB_PATH);
    db.exec(fs_1.default.readFileSync(resolveSchemaPath(), 'utf8'));
    seedBuiltinSigningKeys(db);
    return db;
}
function closeDb() {
    if (!db) {
        return;
    }
    db.close();
    db = null;
}
function parseManifest(manifestJson) {
    return JSON.parse(manifestJson);
}
function insertPlugin(pluginData) {
    const database = getDb();
    const manifest = parseManifest(pluginData.manifest_json);
    const insertPluginStatement = database.prepare(`
    INSERT INTO plugins (
      id, name, version, manifest_json, bundle_blob, dist_hash, bundle_size_bytes,
      signature_data, signature_verified, signer_key_id, signer_type,
      lifecycle_state, is_builtin, installed_at, installed_by, source_url, source_type,
      previous_version_id, update_pending
    ) VALUES (
      @id, @name, @version, @manifest_json, @bundle_blob, @dist_hash, @bundle_size_bytes,
      @signature_data, @signature_verified, @signer_key_id, @signer_type,
      @lifecycle_state, @is_builtin, @installed_at, @installed_by, @source_url, @source_type,
      @previous_version_id, @update_pending
    )
    `);
    const insertToolStatement = database.prepare('INSERT OR IGNORE INTO plugin_tools (plugin_id, tool_name, tool_title) VALUES (?, ?, ?)');
    const insertResourceStatement = database.prepare('INSERT OR IGNORE INTO plugin_resources (plugin_id, resource_name, uri_template) VALUES (?, ?, ?)');
    const insertPromptStatement = database.prepare('INSERT OR IGNORE INTO plugin_prompts (plugin_id, prompt_name) VALUES (?, ?)');
    const transaction = database.transaction(() => {
        insertPluginStatement.run({
            ...pluginData,
            previous_version_id: pluginData.previous_version_id ?? null,
            update_pending: pluginData.update_pending ?? 0,
        });
        for (const toolName of manifest.capabilities?.tools ?? []) {
            insertToolStatement.run(pluginData.id, toolName, null);
        }
        for (const resourceName of manifest.capabilities?.resources ?? []) {
            insertResourceStatement.run(pluginData.id, resourceName, null);
        }
        for (const promptName of manifest.capabilities?.prompts ?? []) {
            insertPromptStatement.run(pluginData.id, promptName);
        }
        auditLog(pluginData.id, pluginData.name, pluginData.version, 'installed', pluginData.installed_by);
    });
    transaction();
}
function setPluginLifecycleState(pluginId, state, detail = null) {
    const database = getDb();
    const now = new Date().toISOString();
    const isActive = state === 'active' ? 1 : 0;
    const transaction = database.transaction(() => {
        database
            .prepare(`
        UPDATE plugins
        SET lifecycle_state = ?,
            last_activated = CASE WHEN ? = 'active' THEN ? ELSE last_activated END,
            last_deactivated = CASE WHEN ? = 'inactive' THEN ? ELSE last_deactivated END,
            last_error = CASE WHEN ? = 'error' THEN ? ELSE last_error END,
            activation_count = CASE WHEN ? = 'active' THEN activation_count + 1 ELSE activation_count END
        WHERE id = ?
        `)
            .run(state, state, now, state, now, state, detail, state, pluginId);
        database.prepare('UPDATE plugin_tools SET is_active = ? WHERE plugin_id = ?').run(isActive, pluginId);
        database.prepare('UPDATE plugin_resources SET is_active = ? WHERE plugin_id = ?').run(isActive, pluginId);
        database.prepare('UPDATE plugin_prompts SET is_active = ? WHERE plugin_id = ?').run(isActive, pluginId);
    });
    transaction();
}
function getPlugin(pluginId) {
    return getDb().prepare('SELECT * FROM plugins WHERE id = ?').get(pluginId);
}
function getPluginByName(name) {
    return getDb()
        .prepare("SELECT * FROM plugins WHERE name = ? AND lifecycle_state != 'uninstalling' ORDER BY installed_at DESC LIMIT 1")
        .get(name);
}
function getActivePlugins() {
    return getDb()
        .prepare("SELECT id, name, version, manifest_json FROM plugins WHERE lifecycle_state = 'active'")
        .all();
}
function getAllPlugins(filter) {
    const database = getDb();
    const params = [];
    let sql = 'SELECT id, name, version, lifecycle_state, is_builtin, installed_at, source_type, bundle_size_bytes FROM plugins';
    if (filter?.state) {
        sql += ' WHERE lifecycle_state = ?';
        params.push(filter.state);
    }
    sql += ' ORDER BY is_builtin DESC, name ASC';
    const rows = database.prepare(sql).all(...params);
    return rows.map((row) => ({
        id: row.id,
        name: row.name,
        version: row.version,
        lifecycle_state: row.lifecycle_state,
        is_builtin: Boolean(row.is_builtin),
        installed_at: row.installed_at,
        source_type: row.source_type,
        bundle_size_bytes: row.bundle_size_bytes,
    }));
}
function getActiveToolNames() {
    return getDb().prepare('SELECT tool_name FROM plugin_tools WHERE is_active = 1').all().map((row) => row.tool_name);
}
function getBundleBlob(pluginId) {
    const row = getDb().prepare('SELECT bundle_blob FROM plugins WHERE id = ?').get(pluginId);
    return row?.bundle_blob ?? null;
}
function getTrustedSigningKey(keyId) {
    return getDb()
        .prepare('SELECT * FROM trusted_signing_keys WHERE id = ? AND is_active = 1')
        .get(keyId);
}
function getAllTrustedKeys() {
    return getDb()
        .prepare('SELECT id, key_type, algorithm, owner, enterprise_id FROM trusted_signing_keys WHERE is_active = 1')
        .all();
}
function insertTrustedKey(keyData) {
    getDb()
        .prepare(`
      INSERT INTO trusted_signing_keys
        (id, key_type, algorithm, public_key_pem, owner, enterprise_id, added_at, added_by, is_active)
      VALUES (@id, @key_type, @algorithm, @public_key_pem, @owner, @enterprise_id, @added_at, @added_by, 1)
      `)
        .run(keyData);
}
function saveExtractionRecord(pluginId, extractionPath, extractedHash) {
    const database = getDb();
    const transaction = database.transaction(() => {
        database.prepare('UPDATE plugin_extractions SET is_current = 0 WHERE plugin_id = ?').run(pluginId);
        database
            .prepare(`
        INSERT INTO plugin_extractions (plugin_id, extraction_path, extracted_hash, extracted_at, is_current)
        VALUES (?, ?, ?, ?, 1)
        `)
            .run(pluginId, extractionPath, extractedHash, new Date().toISOString());
    });
    transaction();
}
function getCurrentExtraction(pluginId) {
    return getDb()
        .prepare('SELECT * FROM plugin_extractions WHERE plugin_id = ? AND is_current = 1')
        .get(pluginId);
}
function auditLog(pluginId, pluginName, version, event, actor = 'system', detail = null) {
    getDb()
        .prepare(`
      INSERT INTO plugin_audit_log (plugin_id, plugin_name, version, event, actor, detail, occurred_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      `)
        .run(pluginId, pluginName, version, event, actor, detail ? JSON.stringify(detail) : null, new Date().toISOString());
}
function getAuditLog(pluginId, limit = 50) {
    return getDb()
        .prepare('SELECT * FROM plugin_audit_log WHERE plugin_id = ? ORDER BY occurred_at DESC LIMIT ?')
        .all(pluginId, limit);
}
function deletePlugin(pluginId) {
    const plugin = getPlugin(pluginId);
    if (!plugin) {
        return;
    }
    if (plugin.is_builtin) {
        throw new Error(`Cannot uninstall built-in plugin: ${pluginId}`);
    }
    getDb().prepare('DELETE FROM plugins WHERE id = ?').run(pluginId);
    auditLog(pluginId, plugin.name, plugin.version, 'uninstalled', 'operator');
}
function getPromptCounts() {
    const row = getDb().prepare('SELECT COUNT(*) AS count FROM plugin_prompts WHERE is_active = 1').get();
    return row.count;
}
//# sourceMappingURL=plugin-db.js.map