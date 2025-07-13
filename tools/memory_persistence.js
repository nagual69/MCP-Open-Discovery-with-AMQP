/**
 * Memory Persistence Manager for MCP Open Discovery
 * 
 * This module provides encrypted persistent storage for the in-memory CMDB,
 * ensuring enterprise secrets in CI data are protected at rest while 
 * maintaining performance during operations.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const MEMORY_STORE_PATH = path.join(process.cwd(), 'data', 'mcp_memory_store.json.enc');
const MEMORY_KEY_PATH = path.join(process.cwd(), 'data', 'mcp_memory_key');
const MEMORY_AUDIT_LOG_PATH = path.join(process.cwd(), 'data', 'mcp_memory_audit.log');

// Ensure data directory exists
const dataDir = path.join(process.cwd(), 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

/**
 * Log memory operations for audit trail
 * @param {string} action - The action performed (load, save, clear)
 * @param {string} details - Additional details about the operation
 */
function auditLog(action, details = '') {
  const entry = {
    timestamp: new Date().toISOString(),
    action,
    details,
    user: process.env.USER || process.env.USERNAME || 'unknown',
    pid: process.pid,
    ciCount: details.includes('CI count:') ? details.split('CI count: ')[1] : undefined
  };
  
  try {
    fs.appendFileSync(MEMORY_AUDIT_LOG_PATH, JSON.stringify(entry) + '\n');
  } catch (error) {
    console.error('[Memory Persistence] Audit log write failed:', error.message);
  }
}

/**
 * Generate or load encryption key for memory storage
 * @returns {Buffer} 32-byte encryption key
 */
function getMemoryKey() {
  // Check for existing key file first
  if (fs.existsSync(MEMORY_KEY_PATH)) {
    return fs.readFileSync(MEMORY_KEY_PATH);
  }
  
  // Generate new 32-byte key for AES-256
  const key = crypto.randomBytes(32);
  fs.writeFileSync(MEMORY_KEY_PATH, key);
  console.log('[Memory Persistence] Generated new encryption key');
  auditLog('key_generated', 'New AES-256 encryption key created');
  
  return key;
}

/**
 * Encrypt memory data using AES-256-CBC
 * @param {Object} data - The memory data to encrypt
 * @returns {string} Encrypted data in format: base64_iv:base64_encrypted_data
 */
function encryptMemoryData(data) {
  try {
    const key = getMemoryKey();
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
    
    const jsonData = JSON.stringify(data, null, 2);
    let encrypted = cipher.update(jsonData, 'utf8', 'base64');
    encrypted += cipher.final('base64');
    
    return iv.toString('base64') + ':' + encrypted;
  } catch (error) {
    console.error('[Memory Persistence] Encryption failed:', error.message);
    throw new Error(`Memory encryption failed: ${error.message}`);
  }
}

/**
 * Decrypt memory data using AES-256-CBC
 * @param {string} encryptedData - The encrypted data in format: base64_iv:base64_encrypted_data
 * @returns {Object} Decrypted memory data
 */
function decryptMemoryData(encryptedData) {
  try {
    const key = getMemoryKey();
    const [ivB64, encrypted] = encryptedData.split(':');
    
    if (!ivB64 || !encrypted) {
      throw new Error('Invalid encrypted data format');
    }
    
    const iv = Buffer.from(ivB64, 'base64');
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
    
    let decrypted = decipher.update(encrypted, 'base64', 'utf8');
    decrypted += decipher.final('utf8');
    
    return JSON.parse(decrypted);
  } catch (error) {
    console.error('[Memory Persistence] Decryption failed:', error.message);
    throw new Error(`Memory decryption failed: ${error.message}`);
  }
}

/**
 * Load memory data from encrypted persistent storage
 * @returns {Object} The decrypted memory data or empty object if no data exists
 */
function loadMemoryData() {
  try {
    if (!fs.existsSync(MEMORY_STORE_PATH)) {
      console.log('[Memory Persistence] No existing memory store found, starting fresh');
      auditLog('load', 'No existing store found - starting with empty memory');
      return {};
    }
    
    const encryptedData = fs.readFileSync(MEMORY_STORE_PATH, 'utf-8');
    const memoryData = decryptMemoryData(encryptedData);
    
    const ciCount = Object.keys(memoryData).length;
    console.log(`[Memory Persistence] Loaded ${ciCount} CIs from encrypted storage`);
    auditLog('load', `Successfully loaded CI count: ${ciCount}`);
    
    return memoryData;
  } catch (error) {
    console.error('[Memory Persistence] Failed to load memory data:', error.message);
    auditLog('load_error', `Failed to load memory: ${error.message}`);
    
    // Return empty object rather than crashing
    console.log('[Memory Persistence] Starting with empty memory due to load failure');
    return {};
  }
}

/**
 * Save memory data to encrypted persistent storage
 * @param {Object} memoryData - The memory data to save
 * @returns {boolean} True if save was successful, false otherwise
 */
function saveMemoryData(memoryData) {
  try {
    const encryptedData = encryptMemoryData(memoryData);
    fs.writeFileSync(MEMORY_STORE_PATH, encryptedData);
    
    const ciCount = Object.keys(memoryData).length;
    console.log(`[Memory Persistence] Saved ${ciCount} CIs to encrypted storage`);
    auditLog('save', `Successfully saved CI count: ${ciCount}`);
    
    return true;
  } catch (error) {
    console.error('[Memory Persistence] Failed to save memory data:', error.message);
    auditLog('save_error', `Failed to save memory: ${error.message}`);
    return false;
  }
}

/**
 * Clear all persistent memory data (keeps audit trail)
 * @returns {boolean} True if clear was successful, false otherwise
 */
function clearMemoryData() {
  try {
    if (fs.existsSync(MEMORY_STORE_PATH)) {
      fs.unlinkSync(MEMORY_STORE_PATH);
      console.log('[Memory Persistence] Cleared persistent memory storage');
      auditLog('clear', 'Persistent memory storage cleared');
      return true;
    } else {
      console.log('[Memory Persistence] No persistent memory storage to clear');
      auditLog('clear', 'No persistent storage found to clear');
      return true;
    }
  } catch (error) {
    console.error('[Memory Persistence] Failed to clear memory data:', error.message);
    auditLog('clear_error', `Failed to clear memory: ${error.message}`);
    return false;
  }
}

/**
 * Rotate the memory encryption key and re-encrypt all data
 * @param {Buffer} newKey - Optional new key (if not provided, generates a new one)
 * @returns {boolean} True if rotation was successful, false otherwise
 */
function rotateMemoryKey(newKey = null) {
  try {
    // Load current data
    const currentData = loadMemoryData();
    
    // Remove old key file
    if (fs.existsSync(MEMORY_KEY_PATH)) {
      fs.unlinkSync(MEMORY_KEY_PATH);
    }
    
    // Set new key or generate one
    if (newKey) {
      fs.writeFileSync(MEMORY_KEY_PATH, newKey);
    } else {
      // getMemoryKey() will generate a new one if none exists
      getMemoryKey();
    }
    
    // Re-encrypt with new key
    const success = saveMemoryData(currentData);
    
    if (success) {
      console.log('[Memory Persistence] Successfully rotated encryption key');
      auditLog('key_rotated', `Encryption key rotated, re-encrypted CI count: ${Object.keys(currentData).length}`);
    } else {
      throw new Error('Failed to save data with new key');
    }
    
    return success;
  } catch (error) {
    console.error('[Memory Persistence] Key rotation failed:', error.message);
    auditLog('key_rotation_error', `Key rotation failed: ${error.message}`);
    return false;
  }
}

/**
 * Get memory persistence statistics
 * @returns {Object} Statistics about the persistent memory storage
 */
function getMemoryStats() {
  const stats = {
    storeExists: fs.existsSync(MEMORY_STORE_PATH),
    keyExists: fs.existsSync(MEMORY_KEY_PATH),
    auditLogExists: fs.existsSync(MEMORY_AUDIT_LOG_PATH),
    storeSize: 0,
    lastModified: null,
    auditEntries: 0
  };
  
  try {
    if (stats.storeExists) {
      const storeStat = fs.statSync(MEMORY_STORE_PATH);
      stats.storeSize = storeStat.size;
      stats.lastModified = storeStat.mtime;
    }
    
    if (stats.auditLogExists) {
      const auditContent = fs.readFileSync(MEMORY_AUDIT_LOG_PATH, 'utf-8');
      stats.auditEntries = auditContent.split('\n').filter(line => line.trim()).length;
    }
  } catch (error) {
    console.error('[Memory Persistence] Failed to get stats:', error.message);
  }
  
  return stats;
}

module.exports = {
  loadMemoryData,
  saveMemoryData,
  clearMemoryData,
  rotateMemoryKey,
  getMemoryStats,
  auditLog
};
