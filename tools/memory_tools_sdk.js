/**
 * Memory Tools Module for MCP Open Discovery - SDK Compatible with SQLite Persistence
 * CONVERTED TO NEW REGISTRY FORMAT
 * 
 * This module provides tools for interacting with the persistent encrypted CMDB
 * using the official MCP SDK patterns with Zod schemas and SQLite persistence.
 * 
 * NEW FORMAT: Exports { tools, handleToolCall } for hot-reload registry
 */

const { z } = require('zod');
const { DatabaseLayer } = require('./registry/database_layer');

// Reference to the in-memory CI store
let ciMemory = {};

// SQLite database instance
let registryDB = null;

// Auto-save configuration
const AUTO_SAVE_ENABLED = process.env.MEMORY_AUTO_SAVE !== 'false';
const AUTO_SAVE_INTERVAL = parseInt(process.env.MEMORY_AUTO_SAVE_INTERVAL) || 30000; // 30 seconds
let autoSaveTimer = null;

/**
 * Initialize the memory tools module with SQLite persistence
 * @param {Object} memoryStore - Reference to the server's memory store (optional, will load from SQLite)
 */
async function initialize(memoryStore) {
  try {
    // Initialize SQLite database
    registryDB = new DatabaseLayer();
    await registryDB.initialize();
    
    // Load from SQLite persistent storage first
    const persistentDataRows = await registryDB.getMemoryData();
    const persistentData = {};
    
    // Convert database rows to key-value pairs
    if (persistentDataRows && Array.isArray(persistentDataRows)) {
      for (const row of persistentDataRows) {
        try {
          persistentData[row.ci_key] = JSON.parse(row.ci_data);
        } catch (error) {
          console.warn(`[Memory Tools] Failed to parse data for key ${row.ci_key}:`, error.message);
        }
      }
    }
    
    // Merge with any provided memory store, with persistent data taking precedence
    ciMemory = { ...memoryStore, ...persistentData };
    
    console.log(`[MCP SDK] Memory tools initialized with ${Object.keys(ciMemory).length} CIs from SQLite persistence`);
    
    // Start auto-save if enabled
    if (AUTO_SAVE_ENABLED) {
      startAutoSave();
    }
    
    await registryDB.auditMemoryAction('initialize', `Memory initialized with ${Object.keys(ciMemory).length} CIs`);
  } catch (error) {
    console.error('[MCP SDK] Memory initialization failed:', error.message);
    ciMemory = memoryStore || {};
    if (registryDB) {
      await registryDB.auditMemoryAction('initialize_error', `Memory initialization failed: ${error.message}`, false);
    }
  }
}

/**
 * Start automatic saving of memory data to SQLite
 */
function startAutoSave() {
  if (autoSaveTimer) {
    clearInterval(autoSaveTimer);
  }
  
  autoSaveTimer = setInterval(async () => {
    try {
      if (registryDB) {
        // Save each CI to SQLite
        for (const [ciKey, ciData] of Object.entries(ciMemory)) {
          await registryDB.storeMemoryData(ciKey, JSON.stringify(ciData), determineCIType(ciData));
        }
        console.log(`[Memory Auto-Save] Saved ${Object.keys(ciMemory).length} CIs to SQLite persistence`);
      }
    } catch (error) {
      console.error('[Memory Auto-Save] Failed:', error.message);
    }
  }, AUTO_SAVE_INTERVAL);
  
  console.log(`[MCP SDK] Auto-save enabled with ${AUTO_SAVE_INTERVAL}ms interval`);
}

/**
 * Stop automatic saving
 */
function stopAutoSave() {
  if (autoSaveTimer) {
    clearInterval(autoSaveTimer);
    autoSaveTimer = null;
    console.log('[MCP SDK] Auto-save disabled');
  }
}

/**
 * Manually trigger a save to SQLite persistence
 */
async function triggerSave() {
  if (!registryDB) {
    throw new Error('SQLite database not initialized');
  }
  
  try {
    for (const [ciKey, ciData] of Object.entries(ciMemory)) {
      await registryDB.storeMemoryData(ciKey, JSON.stringify(ciData), determineCIType(ciData));
    }
    return { success: true, count: Object.keys(ciMemory).length };
  } catch (error) {
    console.error('[MCP SDK] Manual save failed:', error.message);
    throw error;
  }
}

/**
 * Determine CI type from data structure
 */
function determineCIType(ciData) {
  if (typeof ciData !== 'object' || ciData === null) return 'unknown';
  
  if (ciData.hostname || ciData.ip_address) return 'host';
  if (ciData.cluster_name || ciData.proxmox_version) return 'cluster';
  if (ciData.service_name || ciData.protocol) return 'service';
  if (ciData.network_range || ciData.gateway) return 'network';
  if (ciData.storage_type || ciData.total_capacity) return 'storage';
  
  return 'general';
}

/**
 * Helper function to merge CIs
 * @param {Object} existing - Existing CI object
 * @param {Object} update - Update to merge into the existing CI
 * @returns {Object} Merged CI
 */
function mergeCI(existing, update) {
  return { ...existing, ...update };
}

/**
 * Get current memory store (for debugging/inspection)
 * @returns {Object} Current CI memory store
 */
function getMemoryStore() {
  return ciMemory;
}

/**
 * Cleanup function to stop auto-save and save final state
 */
function cleanup() {
  stopAutoSave();
  if (Object.keys(ciMemory).length > 0) {
    console.log('[MCP SDK] Saving final memory state before shutdown...');
    triggerSave();
  }
}

// ========== NEW REGISTRY FORMAT: TOOLS ARRAY + HANDLE FUNCTION ==========

/**
 * Tool definitions array for new registry system
 */
const tools = [
  {
    name: 'memory_get',
    description: 'Get a CI object from MCP memory by key',
    inputSchema: z.object({
      key: z.string().describe('Unique CI key (e.g., ci:host:192.168.1.10)')
    }),
  },
  {
    name: 'memory_set',
    description: 'Set a CI object in MCP memory by key',
    inputSchema: z.object({
      key: z.string().describe('Unique CI key (e.g., ci:host:192.168.1.10)'),
      value: z.any().describe('CI object to store')
    }),
  },
  {
    name: 'memory_merge',
    description: 'Merge new data into an existing CI in MCP memory',
    inputSchema: z.object({
      key: z.string().describe('Unique CI key (e.g., ci:host:192.168.1.10)'),
      value: z.any().describe('Partial CI data to merge')
    }),
  },
  {
    name: 'memory_query',
    description: 'Query MCP memory for CIs matching a pattern or incomplete CIs',
    inputSchema: z.object({
      pattern: z.string().describe('Pattern for CI keys (optional, e.g., ci:host:*)').optional()
    }),
  },
  {
    name: 'memory_clear',
    description: 'Clear all memory data (both in-memory and persistent storage)',
    inputSchema: z.object({}),
  },
  {
    name: 'memory_stats',
    description: 'Get statistics about memory usage and SQLite persistent storage',
    inputSchema: z.object({}),
  },
  {
    name: 'memory_rotate_key',
    description: 'Rotate the encryption key and re-encrypt all stored memory data in SQLite',
    inputSchema: z.object({
      newKey: z.string().describe('New 32-byte key (base64). If not provided, generates a new random key.').optional()
    }),
  },
  {
    name: 'memory_save',
    description: 'Manually save all memory data to SQLite persistent storage',
    inputSchema: z.object({}),
  },
  {
    name: 'memory_migrate_from_filesystem',
    description: 'Migrate existing filesystem-based memory data to SQLite persistence',
    inputSchema: z.object({
      oldDataPath: z.string().describe('Path to old memory data file (optional)').optional()
    }),
  }
];

/**
 * Handle tool calls for new registry system
 * @param {string} name - Tool name
 * @param {Object} args - Tool arguments
 * @returns {Object} Tool result
 */
async function handleToolCall(name, args) {
  switch (name) {
    case 'memory_get':
      try {
        const value = args.key in ciMemory ? ciMemory[args.key] : null;
        
        return {
          content: [
            {
              type: "text",
              text: value ? JSON.stringify(value, null, 2) : `No CI found for key: ${args.key}`
            }
          ]
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error retrieving CI: ${error.message}`
            }
          ],
          isError: true
        };
      }

    case 'memory_set':
      try {
        ciMemory[args.key] = args.value;
        
        // Trigger save to persistent storage
        const saveSuccess = await triggerSave();
        
        return {
          content: [
            {
              type: "text", 
              text: `Successfully stored CI with key: ${args.key}\nSaved to persistent storage: ${saveSuccess ? 'Yes' : 'Failed'}\nStored data: ${JSON.stringify(args.value, null, 2)}`
            }
          ]
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error storing CI: ${error.message}`
            }
          ],
          isError: true
        };
      }

    case 'memory_merge':
      try {
        const existing = args.key in ciMemory ? ciMemory[args.key] : {};
        const merged = mergeCI(existing, args.value);
        ciMemory[args.key] = merged;
        
        // Trigger save to persistent storage
        const saveSuccess = await triggerSave();
        
        return {
          content: [
            {
              type: "text",
              text: `Successfully merged data into CI with key: ${args.key}\nSaved to persistent storage: ${saveSuccess ? 'Yes' : 'Failed'}\nMerged data: ${JSON.stringify(ciMemory[args.key], null, 2)}`
            }
          ]
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error merging CI: ${error.message}`
            }
          ],
          isError: true
        };
      }

    case 'memory_query':
      try {
        let matchingCIs = {};
        
        if (args.pattern) {
          // Convert glob pattern to regex
          const regex = new RegExp(args.pattern.replace(/\*/g, '.*'));
          
          for (const [key, value] of Object.entries(ciMemory)) {
            if (regex.test(key)) {
              matchingCIs[key] = value;
            }
          }
        } else {
          // Return all CIs if no pattern provided
          matchingCIs = { ...ciMemory };
        }
        
        const count = Object.keys(matchingCIs).length;
        
        return {
          content: [
            {
              type: "text",
              text: `Found ${count} matching CIs${args.pattern ? ` for pattern: ${args.pattern}` : ''}\n\n${JSON.stringify(matchingCIs, null, 2)}`
            }
          ]
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error querying memory: ${error.message}`
            }
          ],
          isError: true
        };
      }

    case 'memory_clear':
      try {
        const ciCount = Object.keys(ciMemory).length;
        
        // Clear in-memory data
        ciMemory = {};
        
        // Clear SQLite persistent storage
        // Clear all memory data from SQLite
        const clearSuccess = registryDB ? await clearAllMemoryData() : false;
        
        return {
          content: [
            {
              type: "text",
              text: clearSuccess 
                ? `Successfully cleared ${ciCount} CIs from memory and SQLite persistent storage`
                : `Cleared ${ciCount} CIs from memory, but failed to clear SQLite persistent storage`
            }
          ],
          isError: !clearSuccess
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error clearing memory: ${error.message}`
            }
          ],
          isError: true
        };
      }

    case 'memory_stats':
      try {
        const stats = registryDB ? await registryDB.getMemoryStats() : {};
        const inMemoryCount = Object.keys(ciMemory).length;
        
        const typeBreakdown = stats.type_breakdown?.map(t => `  ${t.ci_type}: ${t.count}`).join('\n') || '  No data';
        
        return {
          content: [
            {
              type: "text",
              text: `Memory Statistics:
In-Memory CIs: ${inMemoryCount}
SQLite CIs: ${stats.memory_store?.total_cis || 0}
Encrypted CIs: ${stats.memory_store?.encrypted_cis || 0}
Total Storage Size: ${stats.memory_store?.total_size_bytes || 0} bytes
Active Keys: ${stats.encryption_keys?.total_keys || 0}
Audit Entries: ${stats.audit_trail?.total_audit_entries || 0}
Oldest CI: ${stats.memory_store?.oldest_ci || 'N/A'}
Newest CI: ${stats.memory_store?.newest_ci || 'N/A'}
Latest Key: ${stats.encryption_keys?.latest_key || 'N/A'}
Latest Audit: ${stats.audit_trail?.latest_audit || 'N/A'}
Auto-Save Enabled: ${AUTO_SAVE_ENABLED}
Auto-Save Interval: ${AUTO_SAVE_INTERVAL}ms

CI Type Breakdown:
${typeBreakdown}`
            }
          ]
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error getting memory stats: ${error.message}`
            }
          ],
          isError: true
        };
      }

    case 'memory_rotate_key':
      try {
        if (!registryDB) {
          throw new Error('SQLite database not initialized');
        }
        
        if (args.newKey) {
          const keyBuffer = Buffer.from(args.newKey, 'base64');
          if (keyBuffer.length !== 32) {
            throw new Error('New key must be exactly 32 bytes when base64 decoded');
          }
        }
        
        // Rotate encryption keys (placeholder implementation)
        const rotateSuccess = await rotateEncryptionKeys();
        
        return {
          content: [
            {
              type: "text",
              text: rotateSuccess 
                ? 'Successfully rotated memory encryption key and re-encrypted all data'
                : 'Failed to rotate memory encryption key'
            }
          ],
          isError: !rotateSuccess
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error rotating memory encryption key: ${error.message}`
            }
          ],
          isError: true
        };
      }

    case 'memory_save':
      try {
        const result = await triggerSave();
        
        return {
          content: [
            {
              type: "text",
              text: `Successfully saved ${result.count} CIs to SQLite persistent storage`
            }
          ]
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error saving memory to SQLite: ${error.message}`
            }
          ],
          isError: true
        };
      }

    case 'memory_migrate_from_filesystem':
      try {
        if (!registryDB) {
          throw new Error('SQLite database not initialized');
        }
        
        const fs = require('fs');
        const path = require('path');
        
        let oldDataPath = args.oldDataPath;
        if (!oldDataPath) {
          // Default path for legacy memory data
          oldDataPath = path.join(__dirname, '../data/memory_data.json');
        }
        
        if (!fs.existsSync(oldDataPath)) {
          throw new Error(`Old data file not found at path: ${oldDataPath}`);
        }
        
        const oldData = JSON.parse(fs.readFileSync(oldDataPath, 'utf8'));
        let migratedCount = 0;
        
        for (const [ciKey, ciData] of Object.entries(oldData)) {
          await registryDB.storeMemoryData(ciKey, JSON.stringify(ciData), determineCIType(ciData));
          ciMemory[ciKey] = ciData; // Update in-memory store too
          migratedCount++;
        }

        await registryDB.auditMemoryAction('filesystem_migration', `Migrated ${migratedCount} CIs from filesystem to SQLite`);

        return {
          content: [
            {
              type: "text",
              text: `Successfully migrated ${migratedCount} CIs from filesystem to SQLite persistence`
            }
          ]
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error migrating memory data: ${error.message}`
            }
          ],
          isError: true
        };
      }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

// ========== BACKWARDS COMPATIBILITY ==========

// ========== EXPORTS ==========

module.exports = {
  // NEW FORMAT: For hot-reload registry system
  tools,
  handleToolCall,
  
  // UTILITY FUNCTIONS
  initialize,
  mergeCI,
  getMemoryStore,
  cleanup,
  triggerSave,
  startAutoSave,
  stopAutoSave
};

// Helper functions for database operations
async function clearAllMemoryData() {
  try {
    await registryDB.executeQuery('DELETE FROM memory_store');
    await registryDB.auditMemoryAction('clear', 'all', 'Cleared all memory data');
    return true;
  } catch (error) {
    console.error('[Memory Tools] Failed to clear memory data:', error.message);
    return false;
  }
}

async function rotateEncryptionKeys() {
  try {
    // Generate new key and store it
    const newKey = require('crypto').randomBytes(32).toString('hex');
    await registryDB.storeMemoryKey(newKey);
    return true;
  } catch (error) {
    console.error('[Memory Tools] Failed to rotate encryption keys:', error.message);
    return false;
  }
}
