/**
 * Open MCP Dynamic Tools Registry - Database Layer
 * 
 * SQLite persistence layer for the dynamic tool registration system.
 * Provides historical tracking, module state persistence, and analytics.
 * 
 * Phase 2: SQLite Database Persistence Layer
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

/**
 * Database schema for the Open MCP Dynamic Tools Registry
 */
const SCHEMA = {
  // Module registration history
  modules: `
    CREATE TABLE IF NOT EXISTS modules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      version TEXT DEFAULT '1.0.0',
      file_path TEXT,
      active BOOLEAN DEFAULT 1,
      loaded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      unloaded_at DATETIME,
      load_duration_ms INTEGER,
      error_message TEXT,
      UNIQUE(name, loaded_at)
    )
  `,
  
  // Individual tool registrations
  tools: `
    CREATE TABLE IF NOT EXISTS tools (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      module_id INTEGER,
      category TEXT NOT NULL,
      description TEXT,
      schema_hash TEXT,
      registered_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      active BOOLEAN DEFAULT 1,
      usage_count INTEGER DEFAULT 0,
      last_used_at DATETIME,
      FOREIGN KEY (module_id) REFERENCES modules (id),
      UNIQUE(name, module_id)
    )
  `,
  
  // Tool execution statistics
  tool_stats: `
    CREATE TABLE IF NOT EXISTS tool_stats (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tool_id INTEGER,
      execution_date DATE,
      execution_count INTEGER DEFAULT 0,
      total_duration_ms INTEGER DEFAULT 0,
      success_count INTEGER DEFAULT 0,
      error_count INTEGER DEFAULT 0,
      avg_duration_ms REAL,
      FOREIGN KEY (tool_id) REFERENCES tools (id),
      UNIQUE(tool_id, execution_date)
    )
  `,
  
  // Module dependencies (for future dynamic loading)
  dependencies: `
    CREATE TABLE IF NOT EXISTS module_dependencies (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      module_id INTEGER,
      depends_on_module TEXT,
      dependency_type TEXT DEFAULT 'require', -- 'require', 'optional', 'peer'
      version_constraint TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (module_id) REFERENCES modules (id)
    )
  `,
  
  // Registry configuration and metadata
  registry_config: `
    CREATE TABLE IF NOT EXISTS registry_config (
      key TEXT PRIMARY KEY,
      value TEXT,
      data_type TEXT DEFAULT 'string', -- 'string', 'number', 'boolean', 'json'
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      description TEXT
    )
  `,

  // Memory persistence tables
  memory_store: `
    CREATE TABLE IF NOT EXISTS memory_store (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ci_key TEXT UNIQUE NOT NULL,
      ci_data TEXT NOT NULL,
      ci_type TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      version INTEGER DEFAULT 1,
      encrypted BOOLEAN DEFAULT 1
    )
  `,

  memory_keys: `
    CREATE TABLE IF NOT EXISTS memory_keys (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key_data BLOB NOT NULL,
      key_type TEXT DEFAULT 'aes-256',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      is_active BOOLEAN DEFAULT 1,
      rotated_at DATETIME
    )
  `,

  memory_audit: `
    CREATE TABLE IF NOT EXISTS memory_audit (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      action TEXT NOT NULL,
      details TEXT,
      user_info TEXT,
      pid INTEGER,
      ci_count INTEGER,
      success BOOLEAN DEFAULT 1,
      error_message TEXT,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `
};

/**
 * Open MCP Dynamic Tools Registry Database Manager
 */
class DynamicRegistryDB {
  constructor(dbPath = './data/dynamic_registry.db') {
    this.dbPath = dbPath;
    this.db = null;
    this.isInitialized = false;
  }

  /**
   * Initialize database connection and create schema
   */
  async initialize() {
    return new Promise((resolve, reject) => {
      try {
        console.log('[Dynamic Registry DB] [DEBUG] Starting initialization...');
        console.log('[Dynamic Registry DB] [DEBUG] Database path:', this.dbPath);
        
        // Ensure data directory exists
        const dataDir = path.dirname(this.dbPath);
        console.log('[Dynamic Registry DB] [DEBUG] Data directory:', dataDir);
        
        if (!fs.existsSync(dataDir)) {
          console.log('[Dynamic Registry DB] [DEBUG] Creating data directory...');
          fs.mkdirSync(dataDir, { recursive: true });
          console.log('[Dynamic Registry DB] [DEBUG] Data directory created');
        } else {
          console.log('[Dynamic Registry DB] [DEBUG] Data directory already exists');
        }

        console.log('[Dynamic Registry DB] [DEBUG] Creating SQLite database connection...');
        this.db = new sqlite3.Database(this.dbPath, (err) => {
          if (err) {
            console.error('[Dynamic Registry DB] [DEBUG] Database connection failed:', err.message);
            console.error('[Dynamic Registry DB] [DEBUG] Database error code:', err.code);
            console.error('[Dynamic Registry DB] [DEBUG] Database error stack:', err.stack);
            reject(err);
            return;
          }

          console.log('[Dynamic Registry DB] Connected to SQLite database');
          console.log('[Dynamic Registry DB] [DEBUG] Creating database schema...');
          
          this._createSchema()
            .then(() => {
              console.log('[Dynamic Registry DB] [DEBUG] Schema creation successful');
              this.isInitialized = true;
              resolve();
            })
            .catch((schemaError) => {
              console.error('[Dynamic Registry DB] [DEBUG] Schema creation failed:', schemaError.message);
              console.error('[Dynamic Registry DB] [DEBUG] Schema error stack:', schemaError.stack);
              reject(schemaError);
            });
        });
      } catch (initError) {
        console.error('[Dynamic Registry DB] [DEBUG] Initialization try-catch error:', initError.message);
        console.error('[Dynamic Registry DB] [DEBUG] Init error stack:', initError.stack);
        reject(initError);
      }
    });
  }

  /**
   * Create database schema
   */
  async _createSchema() {
    return new Promise((resolve, reject) => {
      console.log('[Dynamic Registry DB] [DEBUG] Starting schema creation...');
      const tables = Object.keys(SCHEMA);
      let completed = 0;
      console.log('[Dynamic Registry DB] [DEBUG] Creating', tables.length, 'tables:', tables);

      tables.forEach(tableName => {
        console.log('[Dynamic Registry DB] [DEBUG] Creating table:', tableName);
        this.db.run(SCHEMA[tableName], (err) => {
          if (err) {
            console.error(`[Dynamic Registry DB] [DEBUG] Failed to create ${tableName}:`, err.message);
            console.error(`[Dynamic Registry DB] [DEBUG] SQL:`, SCHEMA[tableName]);
            reject(err);
            return;
          }

          console.log('[Dynamic Registry DB] [DEBUG] Table created successfully:', tableName);
          completed++;
          if (completed === tables.length) {
            console.log('[Dynamic Registry DB] Schema created successfully');
            
            // Initialize config with error handling
            try {
              this._initializeConfig();
              console.log('[Dynamic Registry DB] [DEBUG] Configuration initialized');
              resolve();
            } catch (configError) {
              console.error('[Dynamic Registry DB] [DEBUG] Config initialization failed:', configError.message);
              // Don't reject - schema is created, config is optional
              resolve();
            }
          }
        });
      });
    });
  }

  /**
   * Initialize default configuration
   */
  _initializeConfig() {
    try {
      console.log('[Dynamic Registry DB] [DEBUG] Starting configuration initialization...');
      
      if (!this.db) {
        console.error('[Dynamic Registry DB] [DEBUG] Database not available for config initialization');
        return;
      }

      const defaultConfig = [
        { key: 'registry_version', value: '2.0.0', description: 'Dynamic registry version' },
        { key: 'auto_discovery', value: 'true', data_type: 'boolean', description: 'Enable automatic module discovery' },
        { key: 'hot_reload', value: 'false', data_type: 'boolean', description: 'Enable hot-reload capability' },
        { key: 'max_module_history', value: '1000', data_type: 'number', description: 'Maximum module history entries' }
      ];

      console.log('[Dynamic Registry DB] [DEBUG] Inserting', defaultConfig.length, 'default config entries...');

      defaultConfig.forEach((config, index) => {
        console.log('[Dynamic Registry DB] [DEBUG] Processing config entry', index + 1, ':', config.key);
        this.db.run(
          'INSERT OR IGNORE INTO registry_config (key, value, data_type, description) VALUES (?, ?, ?, ?)',
          [config.key, config.value, config.data_type || 'string', config.description],
          (err) => {
            if (err) {
              console.error('[Dynamic Registry DB] [DEBUG] Config entry failed for', config.key, ':', err.message);
            } else {
              console.log('[Dynamic Registry DB] [DEBUG] Config entry successful for', config.key);
            }
          }
        );
      });

      console.log('[Dynamic Registry DB] [DEBUG] Configuration initialization completed');
    } catch (error) {
      console.error('[Dynamic Registry DB] [DEBUG] Configuration initialization error:', error.message);
      console.error('[Dynamic Registry DB] [DEBUG] Stack trace:', error.stack);
      // Don't throw - this is optional initialization
    }
  }

  /**
   * Promisified database run method
   */
  runAsync(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.run(sql, params, function(err) {
        if (err) reject(err);
        else resolve({ lastID: this.lastID, changes: this.changes });
      });
    });
  }

  /**
   * Promisified database get method
   */
  getAsync(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.get(sql, params, (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  }

  /**
   * Promisified database all method
   */
  allAsync(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.all(sql, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });
  }

  /**
   * Record module registration
   */
  async recordModuleRegistration(moduleName, category, tools = [], filePath = null) {
    if (!this.isInitialized) await this.initialize();

    return new Promise((resolve, reject) => {
      const startTime = Date.now();
      const db = this.db; // Capture reference to avoid 'this' context issues
      
      console.log(`[Dynamic Registry DB] [DEBUG] Recording module registration: ${moduleName}`);
      
      db.run(
        'INSERT INTO modules (name, category, file_path, loaded_at) VALUES (?, ?, ?, datetime("now"))',
        [moduleName, category, filePath],
        function(err) {
          if (err) {
            console.error(`[Dynamic Registry DB] [DEBUG] Module insertion failed for ${moduleName}:`, err.message);
            reject(err);
            return;
          }

          const moduleId = this.lastID;
          const loadDuration = Date.now() - startTime;
          
          console.log(`[Dynamic Registry DB] [DEBUG] Module inserted with ID ${moduleId}, updating load duration...`);

          // Update load duration with proper error handling
          db.run(
            'UPDATE modules SET load_duration_ms = ? WHERE id = ?',
            [loadDuration, moduleId],
            (updateErr) => {
              if (updateErr) {
                console.warn(`[Dynamic Registry DB] Failed to update load duration for module ${moduleName}:`, updateErr.message);
              } else {
                console.log(`[Dynamic Registry DB] [DEBUG] Load duration updated for ${moduleName}`);
              }
              
              // Record tools for this module
              if (tools.length > 0) {
                console.log(`[Dynamic Registry DB] [DEBUG] Recording ${tools.length} tools for ${moduleName}...`);
                
                const toolInserts = tools.map(toolName => 
                  new Promise((resolveInsert, rejectInsert) => {
                    console.log(`[Dynamic Registry DB] [DEBUG] Inserting tool: ${toolName}`);
                    db.run(
                      'INSERT INTO tools (name, module_id, category, registered_at) VALUES (?, ?, ?, datetime("now"))',
                      [toolName, moduleId, category],
                      (err) => {
                        if (err) {
                          console.error(`[Dynamic Registry DB] [DEBUG] Tool insertion failed for ${toolName}:`, err.message);
                          rejectInsert(err);
                        } else {
                          console.log(`[Dynamic Registry DB] [DEBUG] Tool inserted successfully: ${toolName}`);
                          resolveInsert();
                        }
                      }
                    );
                  })
                );

                Promise.all(toolInserts)
                  .then(() => {
                    console.log(`[Dynamic Registry DB] [DEBUG] All tools recorded for ${moduleName}`);
                    resolve(moduleId);
                  })
                  .catch((toolErr) => {
                    console.error(`[Dynamic Registry DB] [DEBUG] Tool recording failed for ${moduleName}:`, toolErr.message);
                    reject(toolErr);
                  });
              } else {
                console.log(`[Dynamic Registry DB] [DEBUG] No tools to record for ${moduleName}`);
                resolve(moduleId);
              }
            }
          );
        }
      );
    });
  }

  /**
   * Record module unload
   */
  async recordModuleUnload(moduleName, reason = null) {
    if (!this.isInitialized) await this.initialize();

    return new Promise((resolve, reject) => {
      this.db.run(
        'UPDATE modules SET active = 0, unloaded_at = datetime("now"), error_message = ? WHERE name = ? AND active = 1',
        [reason, moduleName],
        function(err) {
          err ? reject(err) : resolve(this.changes);
        }
      );
    });
  }

  /**
   * Get module registration history
   */
  async getModuleHistory(limit = 100) {
    if (!this.isInitialized) await this.initialize();

    return new Promise((resolve, reject) => {
      this.db.all(
        `SELECT m.*, COUNT(t.id) as tool_count 
         FROM modules m 
         LEFT JOIN tools t ON m.id = t.module_id 
         GROUP BY m.id 
         ORDER BY m.loaded_at DESC 
         LIMIT ?`,
        [limit],
        (err, rows) => {
          err ? reject(err) : resolve(rows);
        }
      );
    });
  }

  /**
   * Get current active modules
   */
  async getActiveModules() {
    if (!this.isInitialized) await this.initialize();

    return new Promise((resolve, reject) => {
      this.db.all(
        `SELECT m.*, COUNT(t.id) as tool_count,
                GROUP_CONCAT(t.name) as tools
         FROM modules m 
         LEFT JOIN tools t ON m.id = t.module_id AND t.active = 1
         WHERE m.active = 1 
         GROUP BY m.id 
         ORDER BY m.loaded_at DESC`,
        (err, rows) => {
          if (err) {
            reject(err);
            return;
          }

          // Parse tools from comma-separated string
          const modules = rows.map(row => ({
            ...row,
            tools: row.tools ? row.tools.split(',') : []
          }));

          resolve(modules);
        }
      );
    });
  }

  /**
   * Get registry statistics
   */
  async getRegistryStats() {
    if (!this.isInitialized) await this.initialize();

    return new Promise((resolve, reject) => {
      const stats = {};

      // Get module counts
      this.db.get(
        'SELECT COUNT(*) as total, COUNT(CASE WHEN active = 1 THEN 1 END) as active FROM modules',
        (err, moduleStats) => {
          if (err) {
            reject(err);
            return;
          }

          stats.modules = moduleStats;

          // Get tool counts
          this.db.get(
            'SELECT COUNT(*) as total, COUNT(CASE WHEN active = 1 THEN 1 END) as active FROM tools',
            (err, toolStats) => {
              if (err) {
                reject(err);
                return;
              }

              stats.tools = toolStats;

              // Get category breakdown
              this.db.all(
                'SELECT category, COUNT(*) as count FROM tools WHERE active = 1 GROUP BY category',
                (err, categoryStats) => {
                  if (err) {
                    reject(err);
                    return;
                  }

                  stats.categories = categoryStats.reduce((acc, row) => {
                    acc[row.category] = row.count;
                    return acc;
                  }, {});

                  stats.generated_at = new Date().toISOString();
                  resolve(stats);
                }
              );
            }
          );
        }
      );
    });
  }

  /**
   * Clean up old records
   */
  async cleanup(maxAge = 30) {
    if (!this.isInitialized) await this.initialize();

    return new Promise((resolve, reject) => {
      this.db.run(
        'DELETE FROM modules WHERE loaded_at < datetime("now", "-" || ? || " days") AND active = 0',
        [maxAge],
        function(err) {
          err ? reject(err) : resolve(this.changes);
        }
      );
    });
  }

  // ==================== MEMORY PERSISTENCE METHODS ====================

  /**
   * Get or generate encryption key for memory data
   */
  async getMemoryKey() {
    try {
      // Check for active key
      const activeKey = await this.getAsync(
        'SELECT key_data FROM memory_keys WHERE is_active = 1 ORDER BY created_at DESC LIMIT 1'
      );

      if (activeKey) {
        return activeKey.key_data;
      }

      // Generate new key
      const newKey = crypto.randomBytes(32);
      await this.runAsync(
        'INSERT INTO memory_keys (key_data, is_active) VALUES (?, 1)',
        [newKey]
      );

      console.log('[DynamicRegistryDB] Generated new memory encryption key');
      await this.auditMemoryAction('key_generated', 'New AES-256 encryption key created');
      
      return newKey;
    } catch (error) {
      console.error('[DynamicRegistryDB] Failed to get memory key:', error.message);
      throw error;
    }
  }

  /**
   * Encrypt data using AES-256-CBC
   */
  encryptData(data) {
    try {
      const key = crypto.randomBytes(32); // We'll get the real key in async methods
      const iv = crypto.randomBytes(16);
      const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
      
      let encrypted = cipher.update(data, 'utf8', 'base64');
      encrypted += cipher.final('base64');
      
      return iv.toString('base64') + ':' + encrypted;
    } catch (error) {
      console.error('[DynamicRegistryDB] Encryption failed:', error.message);
      throw error;
    }
  }

  /**
   * Decrypt data using AES-256-CBC
   */
  decryptData(encryptedData, key) {
    try {
      const [ivB64, encrypted] = encryptedData.split(':');
      
      if (!ivB64 || !encrypted) {
        throw new Error('Invalid encrypted data format');
      }
      
      const iv = Buffer.from(ivB64, 'base64');
      const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
      
      let decrypted = decipher.update(encrypted, 'base64', 'utf8');
      decrypted += decipher.final('utf8');
      
      return decrypted;
    } catch (error) {
      console.error('[DynamicRegistryDB] Decryption failed:', error.message);
      throw error;
    }
  }

  /**
   * Save CI data to memory store
   */
  async saveMemoryCI(ciKey, ciData, ciType = 'unknown') {
    try {
      const key = await this.getMemoryKey();
      const dataString = JSON.stringify(ciData);
      
      // Create proper encrypted data format
      const iv = crypto.randomBytes(16);
      const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
      let encrypted = cipher.update(dataString, 'utf8', 'base64');
      encrypted += cipher.final('base64');
      const encryptedData = iv.toString('base64') + ':' + encrypted;

      await this.runAsync(
        `INSERT OR REPLACE INTO memory_store 
         (ci_key, ci_data, ci_type, updated_at, encrypted) 
         VALUES (?, ?, ?, CURRENT_TIMESTAMP, 1)`,
        [ciKey, encryptedData, ciType]
      );

      await this.auditMemoryAction('save_ci', `Saved CI: ${ciKey} (type: ${ciType})`);
      console.log(`[DynamicRegistryDB] Saved CI: ${ciKey}`);
      
      return true;
    } catch (error) {
      console.error(`[DynamicRegistryDB] Failed to save CI ${ciKey}:`, error.message);
      await this.auditMemoryAction('save_ci_error', `Failed to save CI ${ciKey}: ${error.message}`, false);
      throw error;
    }
  }

  /**
   * Load single CI from memory store
   */
  async loadMemoryCI(ciKey) {
    try {
      const row = await this.getAsync(
        'SELECT ci_data, ci_type, encrypted FROM memory_store WHERE ci_key = ?',
        [ciKey]
      );

      if (!row) {
        return null;
      }

      if (row.encrypted) {
        const key = await this.getMemoryKey();
        const decryptedData = this.decryptData(row.ci_data, key);
        return JSON.parse(decryptedData);
      } else {
        return JSON.parse(row.ci_data);
      }
    } catch (error) {
      console.error(`[DynamicRegistryDB] Failed to load CI ${ciKey}:`, error.message);
      await this.auditMemoryAction('load_ci_error', `Failed to load CI ${ciKey}: ${error.message}`, false);
      return null;
    }
  }

  /**
   * Load all memory store data
   */
  async loadMemoryStore() {
    try {
      const rows = await this.allAsync(
        'SELECT ci_key, ci_data, ci_type, encrypted FROM memory_store ORDER BY updated_at DESC'
      );

      const memoryData = {};
      const key = await this.getMemoryKey();
      let successCount = 0;
      let errorCount = 0;

      for (const row of rows) {
        try {
          if (row.encrypted) {
            const decryptedData = this.decryptData(row.ci_data, key);
            memoryData[row.ci_key] = JSON.parse(decryptedData);
          } else {
            memoryData[row.ci_key] = JSON.parse(row.ci_data);
          }
          successCount++;
        } catch (error) {
          console.error(`[DynamicRegistryDB] Failed to decrypt CI ${row.ci_key}:`, error.message);
          errorCount++;
        }
      }

      const totalCount = successCount + errorCount;
      console.log(`[DynamicRegistryDB] Loaded ${successCount}/${totalCount} CIs from memory store`);
      await this.auditMemoryAction('load_store', `Loaded ${successCount}/${totalCount} CIs (${errorCount} errors)`);

      return memoryData;
    } catch (error) {
      console.error('[DynamicRegistryDB] Failed to load memory store:', error.message);
      await this.auditMemoryAction('load_store_error', `Failed to load memory store: ${error.message}`, false);
      return {};
    }
  }

  /**
   * Clear all memory store data
   */
  async clearMemoryStore() {
    try {
      const result = await this.runAsync('DELETE FROM memory_store');
      
      console.log(`[DynamicRegistryDB] Cleared ${result.changes} CIs from memory store`);
      await this.auditMemoryAction('clear_store', `Cleared ${result.changes} CIs from memory store`);
      
      return true;
    } catch (error) {
      console.error('[DynamicRegistryDB] Failed to clear memory store:', error.message);
      await this.auditMemoryAction('clear_store_error', `Failed to clear memory store: ${error.message}`, false);
      return false;
    }
  }

  /**
   * Get memory store statistics
   */
  async getMemoryStats() {
    try {
      const stats = await this.getAsync(`
        SELECT 
          COUNT(*) as total_cis,
          COUNT(CASE WHEN encrypted = 1 THEN 1 END) as encrypted_cis,
          MIN(created_at) as oldest_ci,
          MAX(updated_at) as newest_ci,
          SUM(LENGTH(ci_data)) as total_size_bytes
        FROM memory_store
      `);

      const keyInfo = await this.getAsync(`
        SELECT COUNT(*) as total_keys, MAX(created_at) as latest_key 
        FROM memory_keys WHERE is_active = 1
      `);

      const auditInfo = await this.getAsync(`
        SELECT COUNT(*) as total_audit_entries, MAX(timestamp) as latest_audit 
        FROM memory_audit
      `);

      const typeBreakdown = await this.allAsync(`
        SELECT ci_type, COUNT(*) as count 
        FROM memory_store 
        GROUP BY ci_type 
        ORDER BY count DESC
      `);

      return {
        memory_store: stats || { total_cis: 0, encrypted_cis: 0, oldest_ci: null, newest_ci: null, total_size_bytes: 0 },
        encryption_keys: keyInfo || { total_keys: 0, latest_key: null },
        audit_trail: auditInfo || { total_audit_entries: 0, latest_audit: null },
        type_breakdown: typeBreakdown || []
      };
    } catch (error) {
      console.error('[DynamicRegistryDB] Failed to get memory stats:', error.message);
      return { error: error.message };
    }
  }

  /**
   * Rotate memory encryption keys
   */
  async rotateMemoryKeys() {
    try {
      // Load all current data
      const currentData = await this.loadMemoryStore();
      
      // Mark old keys as inactive
      await this.runAsync('UPDATE memory_keys SET is_active = 0, rotated_at = CURRENT_TIMESTAMP');
      
      // Generate new key
      const newKey = crypto.randomBytes(32);
      await this.runAsync(
        'INSERT INTO memory_keys (key_data, is_active) VALUES (?, 1)',
        [newKey]
      );
      
      // Re-encrypt all data with new key
      let reencryptedCount = 0;
      for (const [ciKey, ciData] of Object.entries(currentData)) {
        await this.saveMemoryCI(ciKey, ciData);
        reencryptedCount++;
      }
      
      console.log(`[DynamicRegistryDB] Rotated keys, re-encrypted ${reencryptedCount} CIs`);
      await this.auditMemoryAction('key_rotation', `Rotated keys, re-encrypted ${reencryptedCount} CIs`);
      
      return true;
    } catch (error) {
      console.error('[DynamicRegistryDB] Key rotation failed:', error.message);
      await this.auditMemoryAction('key_rotation_error', `Key rotation failed: ${error.message}`, false);
      return false;
    }
  }

  /**
   * Log memory operations for audit trail
   */
  async auditMemoryAction(action, details = '', success = true, errorMessage = null) {
    try {
      const userInfo = process.env.USER || process.env.USERNAME || 'unknown';
      const pid = process.pid;
      const ciCount = details.includes('CI count:') ? 
        parseInt(details.split('CI count: ')[1]) : null;

      await this.runAsync(
        `INSERT INTO memory_audit 
         (action, details, user_info, pid, ci_count, success, error_message) 
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [action, details, userInfo, pid, ciCount, success, errorMessage]
      );
    } catch (error) {
      console.error('[DynamicRegistryDB] Audit log failed:', error.message);
    }
  }

  /**
   * Close database connection
   */
  async close() {
    if (this.db) {
      return new Promise((resolve) => {
        this.db.close((err) => {
          if (err) {
            console.error('[Dynamic Registry DB] Error closing database:', err.message);
          } else {
            console.log('[Dynamic Registry DB] Database connection closed');
          }
          resolve();
        });
      });
    }
  }
}

module.exports = {
  DynamicRegistryDB,
  SCHEMA
};
