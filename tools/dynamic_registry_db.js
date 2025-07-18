/**
 * Dynamic Registry Database with Memory Persistence
 * Enhanced SQLite database for MCP Open Discovery v2.0
 * 
 * Features:
 * - Module registry tracking with hot-reload support
 * - Encrypted memory persistence for CMDB data
 * - Comprehensive audit trails
 * - Key rotation and security management
 * - Redeployment persistence
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

class DynamicRegistryDB {
  constructor(dbPath = null) {
    this.dbPath = dbPath || path.join(process.cwd(), 'data', 'mcp_dynamic_registry.db');
    this.db = null;
    this.isInitialized = false;
    
    // Ensure data directory exists
    const dataDir = path.dirname(this.dbPath);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
  }

  /**
   * Initialize the database connection and create tables
   */
  async initialize() {
    if (this.isInitialized) return;

    return new Promise((resolve, reject) => {
      this.db = new sqlite3.Database(this.dbPath, (err) => {
        if (err) {
          console.error('[DynamicRegistryDB] Failed to connect to database:', err.message);
          reject(err);
          return;
        }
        
        console.log('[DynamicRegistryDB] Connected to SQLite database at:', this.dbPath);
        this._createTables()
          .then(() => {
            this.isInitialized = true;
            resolve();
          })
          .catch(reject);
      });
    });
  }

  /**
   * Create all required database tables
   */
  async _createTables() {
    const tables = [
      // Module registry tables
      `CREATE TABLE IF NOT EXISTS modules (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        module_name TEXT UNIQUE NOT NULL,
        module_path TEXT NOT NULL,
        category TEXT,
        load_time DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_reload DATETIME,
        load_count INTEGER DEFAULT 1,
        status TEXT DEFAULT 'loaded',
        hot_reload_enabled BOOLEAN DEFAULT 1
      )`,

      `CREATE TABLE IF NOT EXISTS tools (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tool_name TEXT NOT NULL,
        module_name TEXT NOT NULL,
        description TEXT,
        schema_hash TEXT,
        registration_time DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_called DATETIME,
        call_count INTEGER DEFAULT 0,
        FOREIGN KEY (module_name) REFERENCES modules (module_name)
      )`,

      `CREATE TABLE IF NOT EXISTS tool_stats (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tool_name TEXT NOT NULL,
        execution_time REAL,
        success BOOLEAN,
        error_message TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (tool_name) REFERENCES tools (tool_name)
      )`,

      `CREATE TABLE IF NOT EXISTS dependencies (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        module_name TEXT NOT NULL,
        depends_on TEXT NOT NULL,
        dependency_type TEXT DEFAULT 'module',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (module_name) REFERENCES modules (module_name)
      )`,

      `CREATE TABLE IF NOT EXISTS registry_config (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        config_key TEXT UNIQUE NOT NULL,
        config_value TEXT,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,

      // Memory persistence tables
      `CREATE TABLE IF NOT EXISTS memory_store (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ci_key TEXT UNIQUE NOT NULL,
        ci_data TEXT NOT NULL,
        ci_type TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        version INTEGER DEFAULT 1,
        encrypted BOOLEAN DEFAULT 1
      )`,

      `CREATE TABLE IF NOT EXISTS memory_keys (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        key_data BLOB NOT NULL,
        key_type TEXT DEFAULT 'aes-256',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        is_active BOOLEAN DEFAULT 1,
        rotated_at DATETIME
      )`,

      `CREATE TABLE IF NOT EXISTS memory_audit (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        action TEXT NOT NULL,
        details TEXT,
        user_info TEXT,
        pid INTEGER,
        ci_count INTEGER,
        success BOOLEAN DEFAULT 1,
        error_message TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
      )`
    ];

    // Create indexes for performance
    const indexes = [
      'CREATE INDEX IF NOT EXISTS idx_modules_name ON modules(module_name)',
      'CREATE INDEX IF NOT EXISTS idx_modules_category ON modules(category)',
      'CREATE INDEX IF NOT EXISTS idx_tools_name ON tools(tool_name)',
      'CREATE INDEX IF NOT EXISTS idx_tools_module ON tools(module_name)',
      'CREATE INDEX IF NOT EXISTS idx_memory_store_key ON memory_store(ci_key)',
      'CREATE INDEX IF NOT EXISTS idx_memory_store_type ON memory_store(ci_type)',
      'CREATE INDEX IF NOT EXISTS idx_memory_keys_active ON memory_keys(is_active)',
      'CREATE INDEX IF NOT EXISTS idx_memory_audit_action ON memory_audit(action)',
      'CREATE INDEX IF NOT EXISTS idx_memory_audit_timestamp ON memory_audit(timestamp)'
    ];

    try {
      for (const sql of [...tables, ...indexes]) {
        await this.runAsync(sql);
      }
      console.log('[DynamicRegistryDB] All tables and indexes created successfully');
    } catch (error) {
      console.error('[DynamicRegistryDB] Failed to create tables:', error.message);
      throw error;
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
            console.error('[DynamicRegistryDB] Error closing database:', err.message);
          } else {
            console.log('[DynamicRegistryDB] Database connection closed');
          }
          resolve();
        });
      });
    }
  }
}

module.exports = { DynamicRegistryDB };
