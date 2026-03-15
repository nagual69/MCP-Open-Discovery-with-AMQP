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
