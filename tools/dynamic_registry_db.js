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
