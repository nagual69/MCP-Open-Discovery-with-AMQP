PRAGMA journal_mode=WAL;
PRAGMA foreign_keys=ON;

CREATE TABLE IF NOT EXISTS plugins (
  id                  TEXT PRIMARY KEY,
  name                TEXT NOT NULL,
  version             TEXT NOT NULL,
  manifest_json       TEXT NOT NULL,
  bundle_blob         BLOB NOT NULL,
  dist_hash           TEXT NOT NULL,
  bundle_size_bytes   INTEGER NOT NULL,
  signature_data      TEXT,
  signature_verified  INTEGER NOT NULL DEFAULT 0,
  signer_key_id       TEXT,
  signer_type         TEXT,
  lifecycle_state     TEXT NOT NULL DEFAULT 'installed',
  is_builtin          INTEGER NOT NULL DEFAULT 0,
  activation_count    INTEGER NOT NULL DEFAULT 0,
  last_activated      TEXT,
  last_deactivated    TEXT,
  last_error          TEXT,
  installed_at        TEXT NOT NULL,
  installed_by        TEXT NOT NULL DEFAULT 'system',
  source_url          TEXT,
  source_type         TEXT NOT NULL DEFAULT 'local',
  previous_version_id TEXT,
  update_pending      INTEGER NOT NULL DEFAULT 0,
  UNIQUE(name, version)
);

CREATE TABLE IF NOT EXISTS plugin_tools (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  plugin_id   TEXT NOT NULL REFERENCES plugins(id) ON DELETE CASCADE,
  tool_name   TEXT NOT NULL,
  tool_title  TEXT,
  is_active   INTEGER NOT NULL DEFAULT 0,
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

CREATE TABLE IF NOT EXISTS plugin_extractions (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  plugin_id        TEXT NOT NULL REFERENCES plugins(id) ON DELETE CASCADE,
  extraction_path  TEXT NOT NULL,
  extracted_hash   TEXT NOT NULL,
  extracted_at     TEXT NOT NULL,
  is_current       INTEGER NOT NULL DEFAULT 1,
  UNIQUE(plugin_id, is_current)
);

CREATE TABLE IF NOT EXISTS trusted_signing_keys (
  id             TEXT PRIMARY KEY,
  key_type       TEXT NOT NULL,
  algorithm      TEXT NOT NULL DEFAULT 'Ed25519',
  public_key_pem TEXT NOT NULL,
  owner          TEXT,
  enterprise_id  TEXT,
  added_at       TEXT NOT NULL,
  added_by       TEXT,
  is_active      INTEGER NOT NULL DEFAULT 1,
  revoked_at     TEXT,
  revoke_reason  TEXT
);

CREATE TABLE IF NOT EXISTS plugin_audit_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  plugin_id   TEXT NOT NULL,
  plugin_name TEXT NOT NULL,
  version     TEXT NOT NULL,
  event       TEXT NOT NULL,
  actor       TEXT NOT NULL DEFAULT 'system',
  detail      TEXT,
  occurred_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS marketplace_tokens (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  token_hash      TEXT NOT NULL UNIQUE,
  marketplace_url TEXT NOT NULL,
  scope           TEXT NOT NULL DEFAULT 'read',
  granted_to      TEXT,
  expires_at      TEXT,
  created_at      TEXT NOT NULL,
  last_used_at    TEXT,
  is_active       INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_plugins_name ON plugins(name);
CREATE INDEX IF NOT EXISTS idx_plugins_lifecycle ON plugins(lifecycle_state);
CREATE INDEX IF NOT EXISTS idx_plugins_builtin ON plugins(is_builtin);
CREATE INDEX IF NOT EXISTS idx_plugin_tools_active ON plugin_tools(is_active);
CREATE INDEX IF NOT EXISTS idx_plugin_tools_name ON plugin_tools(tool_name);
CREATE INDEX IF NOT EXISTS idx_plugin_resources_active ON plugin_resources(is_active);
CREATE INDEX IF NOT EXISTS idx_plugin_prompts_active ON plugin_prompts(is_active);
CREATE INDEX IF NOT EXISTS idx_audit_plugin ON plugin_audit_log(plugin_id, occurred_at);
CREATE INDEX IF NOT EXISTS idx_audit_event ON plugin_audit_log(event, occurred_at);