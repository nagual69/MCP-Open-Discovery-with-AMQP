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

const sqlite3 = require('sqlite3').verbose();
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
    return new Promise((resolve, reject) => {
      try {
        // Ensure data directory exists
        const dataDir = path.dirname(this.dbPath);
        if (!fs.existsSync(dataDir)) {
          fs.mkdirSync(dataDir, { recursive: true });
        }

        console.log('[Database Layer] Connecting to SQLite database');
        this.db = new sqlite3.Database(this.dbPath, (err) => {
          if (err) {
            console.error('[Database Layer] Connection failed:', err.message);
            reject(err);
            return;
          }
          
          console.log('[Database Layer] Connected to SQLite database');
          this.connected = true;
          this.createSchema()
            .then(() => {
              console.log('[Database Layer] Schema created successfully');
              resolve();
            })
            .catch(reject);
        });
      } catch (error) {
        console.error('[Database Layer] Initialization error:', error.message);
        reject(error);
      }
    });
  }

  /**
   * Create database schema
   */
  async createSchema() {
    dlog('Creating database schema...');
    dlog('Starting schema creation...');
    
    const tables = Object.keys(SCHEMA);
    dlog('Creating', tables.length, 'tables:', tables);

    for (const [tableName, sql] of Object.entries(SCHEMA)) {
      await this.executeQuery(sql);
      dlog(`Table created successfully: ${tableName}`);
    }

    // Indices for performance
    await this._createIndices();

    // Initialize default configuration
    await this.initializeConfig();
    console.log('[Database Layer] Schema created successfully');
  }

  /**
   * Create indices for frequently used lookups
   */
  async _createIndices() {
    const indices = [
      `CREATE INDEX IF NOT EXISTS idx_modules_name ON modules(name)`,
      `CREATE INDEX IF NOT EXISTS idx_modules_loaded_at ON modules(loaded_at)`,
      `CREATE INDEX IF NOT EXISTS idx_tools_module_id ON tools(module_id)`,
      `CREATE INDEX IF NOT EXISTS idx_tools_name ON tools(name)`,
      `CREATE INDEX IF NOT EXISTS idx_tools_created_at ON tools(created_at)`
    ];
    for (const sql of indices) {
      await this.executeQuery(sql);
    }
  }

  /**
   * Initialize default registry configuration
   */
  async initializeConfig() {
    dlog('Starting configuration initialization...');
    
    const defaultConfig = [
      ['registry_version', '2.0.0'],
      ['auto_discovery', 'false'],
      ['hot_reload', 'true'],
      ['max_module_history', '100']
    ];

    dlog('Inserting', defaultConfig.length, 'default config entries...');

    for (let i = 0; i < defaultConfig.length; i++) {
      const [key, value] = defaultConfig[i];
      dlog(`Processing config entry ${i + 1} : ${key}`);
      
      try {
        await this.executeQuery(
          `INSERT OR IGNORE INTO registry_config (key, value) VALUES (?, ?)`,
          [key, value]
        );
        dlog(`Config entry successful for ${key}`);
      } catch (error) {
        console.error(`[Database Layer] [ERROR] Config entry failed for ${key}:`, error.message);
      }
    }

    dlog('Configuration initialization completed');
    dlog('Configuration initialized');
  }

  /**
   * Execute a database query
   */
  executeQuery(sql, params = []) {
    return new Promise((resolve, reject) => {
      if (!this.connected) {
        reject(new Error('Database not connected'));
        return;
      }

      if (sql.includes('INSERT') || sql.includes('UPDATE') || sql.includes('DELETE')) {
        this.db.run(sql, params, function(err) {
          if (err) {
            reject(err);
          } else {
            resolve({ id: this.lastID, changes: this.changes });
          }
        });
      } else {
        this.db.all(sql, params, (err, rows) => {
          if (err) {
            reject(err);
          } else {
            resolve(rows);
          }
        });
      }
    });
  }

  /**
   * Record a module registration
   */
  async recordModuleRegistration(moduleName, category, tools, loadDuration) {
    dlog('Recording module registration:', moduleName);
    
    try {
      // Begin transaction
      await this.executeQuery('BEGIN TRANSACTION');

      // First check if module exists
      const existingModule = await this.executeQuery(
        `SELECT id, name FROM modules WHERE name = ? LIMIT 1`,
        [moduleName]
      );
      
      let moduleId;
      
      if (existingModule && existingModule.length > 0) {
        // Module exists - update it
        moduleId = existingModule[0].id;
        dlog(`Updating existing module ${moduleName} (ID: ${moduleId})`);
        
        await this.executeQuery(
          `UPDATE modules SET category = ?, load_duration_ms = ?, tool_count = ?, active = 1, 
           loaded_at = CURRENT_TIMESTAMP, unloaded_at = NULL WHERE name = ?`,
          [category, loadDuration, tools.length, moduleName]
        );
        
        // Remove existing tools for this module to avoid duplicates
        await this.executeQuery(
          `DELETE FROM tools WHERE module_id = ?`,
          [moduleId]
        );
      } else {
        // Module doesn't exist - insert new
        dlog(`Inserting new module ${moduleName}`);
        
        const result = await this.executeQuery(
          `INSERT INTO modules (name, category, load_duration_ms, tool_count, active) VALUES (?, ?, ?, ?, 1)`,
          [moduleName, category, loadDuration, tools.length]
        );
        
        moduleId = result.id;
      }
      
      dlog(`Module processed with ID ${moduleId}, tool_count: ${tools.length}`);

      // Record individual tools
      dlog(`Recording ${tools.length} tools for ${moduleName}...`);
      for (const toolName of tools) {
        dlog(`Inserting tool: ${toolName}`);
        
        try {
          await this.executeQuery(
            `INSERT INTO tools (module_id, name, category) VALUES (?, ?, ?)`,
            [moduleId, toolName, category]
          );
          dlog(`Tool inserted successfully: ${toolName}`);
        } catch (error) {
          console.error(`[Database Layer] [ERROR] Failed to insert tool ${toolName}:`, error.message);
        }
      }

      // Commit transaction
      await this.executeQuery('COMMIT');
      dlog(`All tools recorded for ${moduleName}`);
      return moduleId;
    } catch (error) {
      // Rollback best-effort
      try { await this.executeQuery('ROLLBACK'); } catch {}
      console.error(`[Database Layer] [ERROR] Failed to record module ${moduleName}:`, error.message);
      throw error;
    }
  }

  /**
   * Get registry statistics
   */
  async getRegistryStats() {
    try {
      const stats = {
        modules: await this.executeQuery(`
          SELECT COUNT(*) as total, COUNT(CASE WHEN active = 1 THEN 1 END) as active 
          FROM modules
        `),
        tools: await this.executeQuery(`
          SELECT COUNT(*) as total, COUNT(CASE WHEN module_id IN (
            SELECT id FROM modules WHERE active = 1
          ) THEN 1 END) as active 
          FROM tools
        `),
        categories: await this.executeQuery(`
          SELECT category, COUNT(*) as count 
          FROM tools 
          WHERE module_id IN (SELECT id FROM modules WHERE active = 1)
          GROUP BY category
        `),
        generated_at: new Date().toISOString()
      };

      // Convert categories array to object
      const categoryMap = {};
      stats.categories.forEach(cat => {
        categoryMap[cat.category] = cat.count;
      });
      stats.categories = categoryMap;

      // Flatten single-row results
      stats.modules = stats.modules[0];
      stats.tools = stats.tools[0];

      return stats;
    } catch (error) {
      console.error('[Database Layer] Failed to get registry stats:', error.message);
      throw error;
    }
  }

  /**
   * Get module history
   */
  async getModuleHistory(limit = 50) {
    try {
      return await this.executeQuery(`
        SELECT m.*, 
               GROUP_CONCAT(t.name) as tools
        FROM modules m
        LEFT JOIN tools t ON m.id = t.module_id
        GROUP BY m.id
  ORDER BY m.loaded_at DESC
        LIMIT ?
      `, [limit]);
    } catch (error) {
      console.error('[Database Layer] Failed to get module history:', error.message);
      throw error;
    }
  }

  /**
   * Get all modules from database
   */
  async getModules() {
    try {
      return await this.executeQuery(`
        SELECT m.*, m.name AS module_name 
        FROM modules m 
        ORDER BY m.loaded_at DESC
      `);
    } catch (error) {
      console.error('[Database Layer] Failed to get modules:', error.message);
      throw error;
    }
  }

  /**
   * Get all tools from database
   */
  async getTools() {
    try {
      return await this.executeQuery(`
  SELECT t.*, m.name AS module_name, t.name AS tool_name
  FROM tools t
  LEFT JOIN modules m ON t.module_id = m.id
  ORDER BY t.created_at DESC
      `);
    } catch (error) {
      console.error('[Database Layer] Failed to get tools:', error.message);
      throw error;
    }
  }

  /**
   * Memory persistence methods for CMDB integration
   */

  /**
   * Store encrypted memory data
   */
  async storeMemoryData(ciKey, encryptedData, ciType = 'general') {
    try {
      await this.executeQuery(`
        INSERT OR REPLACE INTO memory_store (ci_key, ci_data, ci_type, updated_at) 
        VALUES (?, ?, ?, CURRENT_TIMESTAMP)
      `, [ciKey, encryptedData, ciType]);
      
      await this.auditMemoryAction('store', ciKey, `Stored CI type: ${ciType}`);
      return true;
    } catch (error) {
      console.error('[Database Layer] Failed to store memory data:', error.message);
      throw error;
    }
  }

  /**
   * Retrieve encrypted memory data
   */
  async getMemoryData(ciKey = null) {
    try {
      const query = ciKey 
        ? `SELECT * FROM memory_store WHERE ci_key = ?`
        : `SELECT * FROM memory_store ORDER BY updated_at DESC`;
      const params = ciKey ? [ciKey] : [];
      
      return await this.executeQuery(query, params);
    } catch (error) {
      console.error('[Database Layer] Failed to get memory data:', error.message);
      throw error;
    }
  }

  /**
   * Store encryption key
   */
  async storeMemoryKey(keyData) {
    try {
      // Deactivate old keys
      await this.executeQuery(`UPDATE memory_keys SET active = 0`);
      
      // Insert new active key
      await this.executeQuery(`
        INSERT INTO memory_keys (key_data, active) VALUES (?, 1)
      `, [keyData]);
      
      return true;
    } catch (error) {
      console.error('[Database Layer] Failed to store memory key:', error.message);
      throw error;
    }
  }

  /**
   * Get active encryption key
   */
  async getActiveMemoryKey() {
    try {
      const result = await this.executeQuery(`
        SELECT key_data FROM memory_keys WHERE active = 1 ORDER BY created_at DESC LIMIT 1
      `);
      return result.length > 0 ? result[0].key_data : null;
    } catch (error) {
      console.error('[Database Layer] Failed to get active memory key:', error.message);
      throw error;
    }
  }

  /**
   * Audit memory operations
   */
  async auditMemoryAction(action, ciKey, details) {
    try {
      await this.executeQuery(`
        INSERT INTO memory_audit (action, ci_key, details) VALUES (?, ?, ?)
      `, [action, ciKey, details]);
    } catch (error) {
      console.error('[Database Layer] Failed to audit memory action:', error.message);
    }
  }

  /**
   * Get memory statistics
   */
  async getMemoryStats() {
    try {
      const stats = await this.executeQuery(`
        SELECT 
          COUNT(*) as total_cis,
          SUM(LENGTH(ci_data)) as total_size,
          COUNT(CASE WHEN ci_type = 'encrypted' THEN 1 END) as encrypted_cis,
          MIN(created_at) as oldest,
          MAX(updated_at) as newest
        FROM memory_store
      `);
      
      const auditCount = await this.executeQuery(`SELECT COUNT(*) as count FROM memory_audit`);
      
      return {
        ...stats[0],
        audit_entries: auditCount[0].count
      };
    } catch (error) {
      console.error('[Database Layer] Failed to get memory stats:', error.message);
      throw error;
    }
  }

  /**
   * Close database connection
   */
  async close() {
    return new Promise((resolve) => {
      if (this.db && this.connected) {
        this.db.close((err) => {
          if (err) {
            console.error('[Database Layer] Error closing database:', err.message);
          } else {
            console.log('[Database Layer] Database connection closed');
          }
          this.connected = false;
          resolve();
        });
      } else {
        resolve();
      }
    });
  }
}

module.exports = {
  DatabaseLayer
};
