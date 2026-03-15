/**
 * Database Layer - SQLite Persistence for MCP Registry
 * 
 * Dedicated database layer that handles:
 * - SQLite schema management and connections
 * - Module registration history and tracking
 * - Tool statistics and analytics
 * - Memory persistence integration (CMDB)
 * - Audit trails and security logging
 * 
 * Security: Isolated database operations with encryption support
 * Performance: Optimized queries and connection pooling
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// Debug logging gate
const DEBUG_DB = process.env.DEBUG_DB === '1' || process.env.DEBUG_DB === 'true';
const dlog = (...args) => { if (DEBUG_DB) console.log('[Database Layer][DEBUG]', ...args); };

/**
 * Database schema for the MCP Dynamic Tools Registry
 */
const SCHEMA = {
  // Module registration history
  modules: `
    CREATE TABLE IF NOT EXISTS modules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      category TEXT NOT NULL,
      version TEXT DEFAULT '1.0.0',
      file_path TEXT,
      active BOOLEAN DEFAULT 1,
      loaded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      unloaded_at DATETIME,
      load_duration_ms INTEGER,
      error_message TEXT,
      tool_count INTEGER DEFAULT 0
    )`,

  // Individual tool tracking
  tools: `
    CREATE TABLE IF NOT EXISTS tools (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      module_id INTEGER,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(module_id) REFERENCES modules(id)
    )`,

  // Tool execution statistics
  tool_stats: `
    CREATE TABLE IF NOT EXISTS tool_stats (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tool_name TEXT NOT NULL,
      execution_count INTEGER DEFAULT 0,
      last_executed DATETIME,
      avg_execution_time_ms INTEGER,
      error_count INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,

  // Module dependencies
  dependencies: `
    CREATE TABLE IF NOT EXISTS dependencies (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      parent_module TEXT NOT NULL,
      dependency_module TEXT NOT NULL,
      dependency_type TEXT DEFAULT 'require',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,

  // Registry configuration
  registry_config: `
    CREATE TABLE IF NOT EXISTS registry_config (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,

  // Memory persistence for CMDB integration
  memory_store: `
    CREATE TABLE IF NOT EXISTS memory_store (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ci_key TEXT UNIQUE NOT NULL,
      ci_data TEXT NOT NULL,
      ci_type TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,

  // Memory encryption keys
  memory_keys: `
    CREATE TABLE IF NOT EXISTS memory_keys (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key_data TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      active BOOLEAN DEFAULT 1
    )`,

  // Memory audit trail
  memory_audit: `
    CREATE TABLE IF NOT EXISTS memory_audit (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      action TEXT NOT NULL,
      ci_key TEXT,
      details TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`
};

/**
 * Database Layer for Registry Persistence
 * Converted to better-sqlite3 — synchronous API.
 */
class DatabaseLayer {
  constructor(dbPath = null) {
    this.dbPath = dbPath || path.join(process.cwd(), 'data', 'dynamic_registry.db');
    this.db = null;
    this.connected = false;

    console.log('[Database Layer] Initialized with path:', this.dbPath);
  }

  /**
   * Initialize database connection and schema
   */
  async initialize() {
    try {
      const dataDir = path.dirname(this.dbPath);
      if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

      console.log('[Database Layer] Connecting to SQLite database');
      this.db = new Database(this.dbPath);
      this.connected = true;
      console.log('[Database Layer] Connected to SQLite database');
      this.createSchema();
      console.log('[Database Layer] Schema created successfully');
    } catch (error) {
      console.error('[Database Layer] Initialization error:', error.message);
      throw error;
    }
  }

  /**
   * Create database schema (synchronous with better-sqlite3)
   */
  createSchema() {
    dlog('Creating database schema...');
    for (const [tableName, sql] of Object.entries(SCHEMA)) {
      this.db.exec(sql);
      dlog(`Table created: ${tableName}`);
    }
    this._createIndices();
    this.initializeConfig();
    console.log('[Database Layer] Schema created successfully');
  }

  _createIndices() {
    const indices = [
      `CREATE INDEX IF NOT EXISTS idx_modules_name ON modules(name)`,
      `CREATE INDEX IF NOT EXISTS idx_modules_loaded_at ON modules(loaded_at)`,
      `CREATE INDEX IF NOT EXISTS idx_tools_module_id ON tools(module_id)`,
      `CREATE INDEX IF NOT EXISTS idx_tools_name ON tools(name)`,
      `CREATE INDEX IF NOT EXISTS idx_tools_created_at ON tools(created_at)`
    ];
    for (const sql of indices) this.db.exec(sql);
  }

  initializeConfig() {
    dlog('Initializing default config...');
    const defaultConfig = [
      ['registry_version', '2.0.0'],
      ['auto_discovery', 'false'],
      ['hot_reload', 'true'],
      ['max_module_history', '100']
    ];
    const stmt = this.db.prepare(
      `INSERT OR IGNORE INTO registry_config (key, value) VALUES (?, ?)`
    );
    for (const [key, value] of defaultConfig) {
      try { stmt.run(key, value); } catch (e) {
        console.error(`[Database Layer] Config insert failed for ${key}:`, e.message);
      }
    }
  }

  /**
   * Execute a SQL statement — returns rows for SELECT, {id, changes} for mutations.
   * Kept for API compatibility; new code should use better-sqlite3 directly.
   */
  executeQuery(sql, params = []) {
    if (!this.connected) throw new Error('Database not connected');
    const trimmed = sql.trim().toUpperCase();
    if (trimmed.startsWith('BEGIN') || trimmed.startsWith('COMMIT') || trimmed.startsWith('ROLLBACK')) {
      this.db.exec(sql);
      return {};
    }
    if (trimmed.startsWith('INSERT') || trimmed.startsWith('UPDATE') || trimmed.startsWith('DELETE')) {
      const info = this.db.prepare(sql).run(...params);
      return { id: info.lastInsertRowid, changes: info.changes };
    }
    return this.db.prepare(sql).all(...params);
  }

  /**
   * Record a module registration
   */
  async recordModuleRegistration(moduleName, category, tools, loadDuration) {
    dlog('Recording module registration:', moduleName);
    try {
      const recordTxn = this.db.transaction(() => {
        const existing = this.db.prepare(
          `SELECT id FROM modules WHERE name = ? LIMIT 1`
        ).get(moduleName);

        let moduleId;
        if (existing) {
          moduleId = existing.id;
          this.db.prepare(
            `UPDATE modules SET category = ?, load_duration_ms = ?, tool_count = ?, active = 1,
             loaded_at = CURRENT_TIMESTAMP, unloaded_at = NULL WHERE name = ?`
          ).run(category, loadDuration, tools.length, moduleName);
          this.db.prepare(`DELETE FROM tools WHERE module_id = ?`).run(moduleId);
        } else {
          const info = this.db.prepare(
            `INSERT INTO modules (name, category, load_duration_ms, tool_count, active) VALUES (?, ?, ?, ?, 1)`
          ).run(moduleName, category, loadDuration, tools.length);
          moduleId = info.lastInsertRowid;
        }

        const toolStmt = this.db.prepare(
          `INSERT INTO tools (module_id, name, category) VALUES (?, ?, ?)`
        );
        for (const toolName of tools) {
          try { toolStmt.run(moduleId, toolName, category); } catch (e) {
            console.error(`[Database Layer] Tool insert failed ${toolName}:`, e.message);
          }
        }
        return moduleId;
      });
      return recordTxn();
    } catch (error) {
      console.error(`[Database Layer] Failed to record module ${moduleName}:`, error.message);
      throw error;
    }
  }

  async getRegistryStats() {
    try {
      const mods = this.db.prepare(
        `SELECT COUNT(*) as total, COUNT(CASE WHEN active = 1 THEN 1 END) as active FROM modules`
      ).get();
      const tools = this.db.prepare(
        `SELECT COUNT(*) as total,
           COUNT(CASE WHEN module_id IN (SELECT id FROM modules WHERE active = 1) THEN 1 END) as active
         FROM tools`
      ).get();
      const cats = this.db.prepare(
        `SELECT category, COUNT(*) as count FROM tools
         WHERE module_id IN (SELECT id FROM modules WHERE active = 1)
         GROUP BY category`
      ).all();
      const categoryMap = {};
      cats.forEach(c => { categoryMap[c.category] = c.count; });
      return { modules: mods, tools, categories: categoryMap, generated_at: new Date().toISOString() };
    } catch (error) {
      console.error('[Database Layer] Failed to get registry stats:', error.message);
      throw error;
    }
  }

  async getModuleHistory(limit = 50) {
    return this.db.prepare(
      `SELECT m.*, GROUP_CONCAT(t.name) as tools
       FROM modules m LEFT JOIN tools t ON m.id = t.module_id
       GROUP BY m.id ORDER BY m.loaded_at DESC LIMIT ?`
    ).all(limit);
  }

  async getModules() {
    return this.db.prepare(
      `SELECT m.*, m.name AS module_name FROM modules m ORDER BY m.loaded_at DESC`
    ).all();
  }

  async getTools() {
    return this.db.prepare(
      `SELECT t.*, m.name AS module_name, t.name AS tool_name
       FROM tools t LEFT JOIN modules m ON t.module_id = m.id ORDER BY t.created_at DESC`
    ).all();
  }

  async removeTool(toolName) {
    if (!toolName) return 0;
    const info = this.db.prepare(`DELETE FROM tools WHERE name = ?`).run(toolName);
    return info.changes || 0;
  }

  async removeTools(toolNames = []) {
    let total = 0;
    for (const t of toolNames) total += await this.removeTool(t);
    return total;
  }

  // ── Memory / CMDB persistence ──────────────────────────────

  async storeMemoryData(ciKey, encryptedData, ciType = 'general') {
    this.db.prepare(
      `INSERT OR REPLACE INTO memory_store (ci_key, ci_data, ci_type, updated_at)
       VALUES (?, ?, ?, CURRENT_TIMESTAMP)`
    ).run(ciKey, encryptedData, ciType);
    await this.auditMemoryAction('store', ciKey, `Stored CI type: ${ciType}`);
    return true;
  }

  async getMemoryData(ciKey = null) {
    if (ciKey) return this.db.prepare(`SELECT * FROM memory_store WHERE ci_key = ?`).all(ciKey);
    return this.db.prepare(`SELECT * FROM memory_store ORDER BY updated_at DESC`).all();
  }

  async storeMemoryKey(keyData) {
    this.db.prepare(`UPDATE memory_keys SET active = 0`).run();
    this.db.prepare(`INSERT INTO memory_keys (key_data, active) VALUES (?, 1)`).run(keyData);
    return true;
  }

  async getActiveMemoryKey() {
    const row = this.db.prepare(
      `SELECT key_data FROM memory_keys WHERE active = 1 ORDER BY created_at DESC LIMIT 1`
    ).get();
    return row ? row.key_data : null;
  }

  async auditMemoryAction(action, ciKey, details) {
    try {
      this.db.prepare(
        `INSERT INTO memory_audit (action, ci_key, details) VALUES (?, ?, ?)`
      ).run(action, ciKey, details);
    } catch (error) {
      console.error('[Database Layer] Failed to audit memory action:', error.message);
    }
  }

  async getMemoryStats() {
    const stats = this.db.prepare(
      `SELECT COUNT(*) as total_cis, SUM(LENGTH(ci_data)) as total_size,
         COUNT(CASE WHEN ci_type = 'encrypted' THEN 1 END) as encrypted_cis,
         MIN(created_at) as oldest, MAX(updated_at) as newest
       FROM memory_store`
    ).get();
    const auditCount = this.db.prepare(`SELECT COUNT(*) as count FROM memory_audit`).get();
    return { ...stats, audit_entries: auditCount.count };
  }

  async close() {
    if (this.db && this.connected) {
      try { this.db.close(); } catch (e) {
        console.error('[Database Layer] Error closing database:', e.message);
      }
      this.connected = false;
      console.log('[Database Layer] Database connection closed');
    }
  }
}

module.exports = {
  DatabaseLayer
};
