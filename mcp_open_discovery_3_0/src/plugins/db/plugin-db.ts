import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

import type {
  AddTrustedKeyInput,
  PluginAuditEntry,
  PluginAuditEvent,
  PluginExtractionRecord,
  PluginLifecycleState,
  PluginManifestV2,
  PluginRecord,
  PluginSummary,
  PluginSourceType,
  SignerType,
  TrustedSigningKey,
  TrustedKeySummary,
} from '../../types';

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'data');
const DB_PATH = process.env.PLUGIN_DB_PATH || path.join(DATA_DIR, 'plugin_store.db');
const SCHEMA_PATH_CANDIDATES = [
  path.join(__dirname, 'schema.sql'),
  path.join(process.cwd(), 'src', 'plugins', 'db', 'schema.sql'),
];

let db: Database.Database | null = null;

export interface InsertPluginInput {
  id: string;
  name: string;
  version: string;
  manifest_json: string;
  bundle_blob: Buffer;
  dist_hash: string;
  bundle_size_bytes: number;
  signature_data: string | null;
  signature_verified: 0 | 1;
  signer_key_id: string | null;
  signer_type: SignerType;
  lifecycle_state: PluginLifecycleState;
  is_builtin: 0 | 1;
  installed_at: string;
  installed_by: string;
  source_url: string | null;
  source_type: PluginSourceType;
  previous_version_id?: string | null;
  update_pending?: 0 | 1;
}

export interface ActivePluginRecord extends Pick<PluginRecord, 'id' | 'name' | 'version' | 'manifest_json'> {}

function ensureParentDirectory(filePath: string): void {
  const directory = path.dirname(filePath);
  if (!fs.existsSync(directory)) {
    fs.mkdirSync(directory, { recursive: true });
  }
}

function resolveSchemaPath(): string {
  const schemaPath = SCHEMA_PATH_CANDIDATES.find((candidate) => fs.existsSync(candidate));
  if (!schemaPath) {
    throw new Error(`Unable to locate plugin schema.sql. Tried: ${SCHEMA_PATH_CANDIDATES.join(', ')}`);
  }
  return schemaPath;
}

function seedBuiltinSigningKeys(database: Database.Database): void {
  const vibeforgeKeyId = 'vibeforge-primary-v1';
  const publicKeyPem = process.env.VIBEFORGE_PUBLIC_KEY_PEM;
  if (!publicKeyPem) {
    return;
  }

  const existing = database
    .prepare('SELECT id FROM trusted_signing_keys WHERE id = ?')
    .get(vibeforgeKeyId) as { id: string } | undefined;

  if (existing) {
    return;
  }

  database
    .prepare(
      `
      INSERT INTO trusted_signing_keys
        (id, key_type, algorithm, public_key_pem, owner, added_at, added_by, is_active)
      VALUES (?, 'vibeforge', 'Ed25519', ?, 'VibeForge Systems', ?, 'system', 1)
      `,
    )
    .run(vibeforgeKeyId, publicKeyPem, new Date().toISOString());
}

export function getDb(): Database.Database {
  if (db) {
    return db;
  }

  ensureParentDirectory(DB_PATH);
  db = new Database(DB_PATH);
  db.exec(fs.readFileSync(resolveSchemaPath(), 'utf8'));
  seedBuiltinSigningKeys(db);
  return db;
}

export function closeDb(): void {
  if (!db) {
    return;
  }

  db.close();
  db = null;
}

function parseManifest(manifestJson: string): PluginManifestV2 {
  return JSON.parse(manifestJson) as PluginManifestV2;
}

export function insertPlugin(pluginData: InsertPluginInput): void {
  const database = getDb();
  const manifest = parseManifest(pluginData.manifest_json);

  const insertPluginStatement = database.prepare(
    `
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
    `,
  );
  const insertToolStatement = database.prepare(
    'INSERT OR IGNORE INTO plugin_tools (plugin_id, tool_name, tool_title) VALUES (?, ?, ?)',
  );
  const insertResourceStatement = database.prepare(
    'INSERT OR IGNORE INTO plugin_resources (plugin_id, resource_name, uri_template) VALUES (?, ?, ?)',
  );
  const insertPromptStatement = database.prepare(
    'INSERT OR IGNORE INTO plugin_prompts (plugin_id, prompt_name) VALUES (?, ?)',
  );

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

export function setPluginLifecycleState(
  pluginId: string,
  state: PluginLifecycleState,
  detail: string | null = null,
): void {
  const database = getDb();
  const now = new Date().toISOString();
  const isActive = state === 'active';

  const transaction = database.transaction(() => {
    database
      .prepare(
        `
        UPDATE plugins
        SET lifecycle_state = ?,
            last_activated = CASE WHEN ? = 'active' THEN ? ELSE last_activated END,
            last_deactivated = CASE WHEN ? = 'inactive' THEN ? ELSE last_deactivated END,
            last_error = CASE WHEN ? = 'error' THEN ? ELSE last_error END,
            activation_count = CASE WHEN ? = 'active' THEN activation_count + 1 ELSE activation_count END
        WHERE id = ?
        `,
      )
      .run(state, state, now, state, now, state, detail, state, pluginId);

    setPluginCapabilityActiveState(pluginId, isActive);
  });

  transaction();
}

export function setPluginCapabilityActiveState(pluginId: string, isActive: boolean): void {
  const database = getDb();
  const activeValue = isActive ? 1 : 0;

  const transaction = database.transaction(() => {
    database.prepare('UPDATE plugin_tools SET is_active = ? WHERE plugin_id = ?').run(activeValue, pluginId);
    database.prepare('UPDATE plugin_resources SET is_active = ? WHERE plugin_id = ?').run(activeValue, pluginId);
    database.prepare('UPDATE plugin_prompts SET is_active = ? WHERE plugin_id = ?').run(activeValue, pluginId);
  });

  transaction();
}

export function getPlugin(pluginId: string): PluginRecord | undefined {
  return getDb().prepare('SELECT * FROM plugins WHERE id = ?').get(pluginId) as PluginRecord | undefined;
}

export function getPluginByName(name: string): PluginRecord | undefined {
  return getDb()
    .prepare(
      "SELECT * FROM plugins WHERE name = ? AND lifecycle_state != 'uninstalling' ORDER BY installed_at DESC LIMIT 1",
    )
    .get(name) as PluginRecord | undefined;
}

export function getActivePlugins(): ActivePluginRecord[] {
  return getDb()
    .prepare("SELECT id, name, version, manifest_json FROM plugins WHERE lifecycle_state = 'active'")
    .all() as ActivePluginRecord[];
}

export function getAllPlugins(filter?: { state?: PluginLifecycleState }): PluginSummary[] {
  const database = getDb();
  const params: unknown[] = [];
  let sql =
    'SELECT id, name, version, lifecycle_state, is_builtin, installed_at, source_type, bundle_size_bytes FROM plugins';

  if (filter?.state) {
    sql += ' WHERE lifecycle_state = ?';
    params.push(filter.state);
  }

  sql += ' ORDER BY is_builtin DESC, name ASC';
  const rows = database.prepare(sql).all(...params) as Array<{
    id: string;
    name: string;
    version: string;
    lifecycle_state: PluginLifecycleState;
    is_builtin: number;
    installed_at: string;
    source_type: PluginSourceType;
    bundle_size_bytes: number;
  }>;

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

export function getActiveToolNames(): string[] {
  return (getDb().prepare('SELECT tool_name FROM plugin_tools WHERE is_active = 1').all() as Array<{ tool_name: string }>).map(
    (row) => row.tool_name,
  );
}

export function getBundleBlob(pluginId: string): Buffer | null {
  const row = getDb().prepare('SELECT bundle_blob FROM plugins WHERE id = ?').get(pluginId) as
    | { bundle_blob: Buffer }
    | undefined;
  return row?.bundle_blob ?? null;
}

export function getTrustedSigningKey(keyId: string): TrustedSigningKey | undefined {
  return getDb()
    .prepare('SELECT * FROM trusted_signing_keys WHERE id = ? AND is_active = 1')
    .get(keyId) as TrustedSigningKey | undefined;
}

export function getAllTrustedKeys(): TrustedKeySummary[] {
  return getDb()
    .prepare('SELECT id, key_type, algorithm, owner, enterprise_id FROM trusted_signing_keys WHERE is_active = 1')
    .all() as TrustedKeySummary[];
}

export function insertTrustedKey(keyData: AddTrustedKeyInput): void {
  getDb()
    .prepare(
      `
      INSERT INTO trusted_signing_keys
        (id, key_type, algorithm, public_key_pem, owner, enterprise_id, added_at, added_by, is_active)
      VALUES (@id, @key_type, @algorithm, @public_key_pem, @owner, @enterprise_id, @added_at, @added_by, 1)
      `,
    )
    .run(keyData);
}

export function saveExtractionRecord(pluginId: string, extractionPath: string, extractedHash: string): void {
  const database = getDb();
  const transaction = database.transaction(() => {
    database.prepare('UPDATE plugin_extractions SET is_current = 0 WHERE plugin_id = ?').run(pluginId);
    database
      .prepare(
        `
        INSERT INTO plugin_extractions (plugin_id, extraction_path, extracted_hash, extracted_at, is_current)
        VALUES (?, ?, ?, ?, 1)
        `,
      )
      .run(pluginId, extractionPath, extractedHash, new Date().toISOString());
  });
  transaction();
}

export function getCurrentExtraction(pluginId: string): PluginExtractionRecord | undefined {
  return getDb()
    .prepare('SELECT * FROM plugin_extractions WHERE plugin_id = ? AND is_current = 1')
    .get(pluginId) as PluginExtractionRecord | undefined;
}

export function auditLog(
  pluginId: string,
  pluginName: string,
  version: string,
  event: PluginAuditEvent,
  actor = 'system',
  detail: Record<string, unknown> | null = null,
): void {
  getDb()
    .prepare(
      `
      INSERT INTO plugin_audit_log (plugin_id, plugin_name, version, event, actor, detail, occurred_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
    )
    .run(pluginId, pluginName, version, event, actor, detail ? JSON.stringify(detail) : null, new Date().toISOString());
}

export function getAuditLog(pluginId: string, limit = 50): PluginAuditEntry[] {
  return getDb()
    .prepare('SELECT * FROM plugin_audit_log WHERE plugin_id = ? ORDER BY occurred_at DESC LIMIT ?')
    .all(pluginId, limit) as PluginAuditEntry[];
}

export function deletePlugin(pluginId: string): void {
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

export function getPromptCounts(): number {
  const row = getDb().prepare('SELECT COUNT(*) AS count FROM plugin_prompts WHERE is_active = 1').get() as { count: number };
  return row.count;
}