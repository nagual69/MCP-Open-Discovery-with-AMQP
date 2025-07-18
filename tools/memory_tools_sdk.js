/**
 * Memory Tools Module for MCP Open Discovery - SDK Compatible with SQLite Persistence
 * 
 * This module provides tools for interacting with the persistent encrypted CMDB
 * using the official MCP SDK patterns with Zod schemas and SQLite persistence.
 */

const { z } = require('zod');
const { DynamicRegistryDB } = require('./dynamic_registry_db');

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
    registryDB = new DynamicRegistryDB();
    await registryDB.initialize();
    
    // Load from SQLite persistent storage first
    const persistentData = await registryDB.loadMemoryStore();
    
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
          await registryDB.saveMemoryCI(ciKey, ciData, determineCIType(ciData));
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
      await registryDB.saveMemoryCI(ciKey, ciData, determineCIType(ciData));
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
 * Register all memory tools with the MCP server
 * @param {McpServer} server - The MCP server instance
 */
function registerMemoryTools(server) {
  // Memory Get tool
  server.tool(
    'memory_get',
    'Get a CI object from MCP memory by key',
    {
      key: z.string().describe('Unique CI key (e.g., ci:host:192.168.1.10)')
    },
    async ({ key }) => {
      try {
        const value = key in ciMemory ? ciMemory[key] : null;
        
        return {
          content: [
            {
              type: "text",
              text: value ? JSON.stringify(value, null, 2) : `No CI found for key: ${key}`
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
    }
  );

  // Memory Set tool
  server.tool(
    'memory_set',
    'Set a CI object in MCP memory by key',
    {
      key: z.string().describe('Unique CI key (e.g., ci:host:192.168.1.10)'),
      value: z.object({}).passthrough().describe('CI object to store')
    },
    async ({ key, value }) => {
      try {
        ciMemory[key] = value;
        
        // Trigger save to persistent storage
        const saveSuccess = triggerSave();
        
        return {
          content: [
            {
              type: "text", 
              text: `Successfully stored CI with key: ${key}\nSaved to persistent storage: ${saveSuccess ? 'Yes' : 'Failed'}\nStored data: ${JSON.stringify(value, null, 2)}`
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
    }
  );

  // Memory Merge tool
  server.tool(
    'memory_merge',
    'Merge new data into an existing CI in MCP memory',
    {
      key: z.string().describe('Unique CI key (e.g., ci:host:192.168.1.10)'),
      value: z.object({}).passthrough().describe('Partial CI data to merge')
    },
    async ({ key, value }) => {
      try {
        const existing = ciMemory[key] || {};
        ciMemory[key] = mergeCI(existing, value);
        
        // Trigger save to persistent storage
        const saveSuccess = triggerSave();
        
        return {
          content: [
            {
              type: "text",
              text: `Successfully merged data into CI with key: ${key}\nSaved to persistent storage: ${saveSuccess ? 'Yes' : 'Failed'}\nMerged data: ${JSON.stringify(ciMemory[key], null, 2)}`
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
    }
  );

  // Memory Query tool
  server.tool(
    'memory_query',
    'Query MCP memory for CIs matching a pattern or incomplete CIs',
    {
      pattern: z.string().optional().describe('Pattern for CI keys (optional, e.g., ci:host:*)')
    },
    async ({ pattern }) => {
      try {
        let matchingCIs = {};
        
        if (pattern) {
          // Convert glob pattern to regex
          const regex = new RegExp(pattern.replace(/\*/g, '.*'));
          
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
              text: `Found ${count} matching CIs${pattern ? ` for pattern: ${pattern}` : ''}\n\n${JSON.stringify(matchingCIs, null, 2)}`
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
    }
  );

  // Memory Clear tool
  server.tool(
    'memory_clear',
    'Clear all memory data (both in-memory and persistent storage)',
    {},
    async () => {
      try {
        const ciCount = Object.keys(ciMemory).length;
        
        // Clear in-memory data
        ciMemory = {};
        
        // Clear SQLite persistent storage
        const clearSuccess = registryDB ? await registryDB.clearMemoryStore() : false;
        
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
    }
  );

  // Memory Stats tool
  server.tool(
    'memory_stats',
    'Get statistics about memory usage and SQLite persistent storage',
    {},
    async () => {
      try {
        const stats = registryDB ? await registryDB.getMemoryStats() : {};
        const inMemoryCount = Object.keys(ciMemory).length;
        
        return {
          content: [
            {
              type: "text",
              text: `Memory Statistics:
              
In-Memory CIs: ${inMemoryCount}
SQLite CIs: ${stats.memory_store?.total_cis || 0}
Encrypted CIs: ${stats.memory_store?.encrypted_cis || 0}
Active Keys: ${stats.encryption_keys?.total_keys || 0}
Audit Entries: ${stats.audit_trail?.total_audit_entries || 0}
Oldest CI: ${stats.memory_store?.oldest_ci || 'N/A'}
Newest CI: ${stats.memory_store?.newest_ci || 'N/A'}
Store Size: ${stats.storeSize} bytes
Last Modified: ${stats.lastModified}
Audit Log Entries: ${stats.auditEntries}
Auto-Save Enabled: ${AUTO_SAVE_ENABLED}
Auto-Save Interval: ${AUTO_SAVE_INTERVAL}ms`
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
    }
  );

  // Memory Key Rotation tool
  server.tool(
    'memory_rotate_key',
    'Rotate the encryption key and re-encrypt all stored memory data in SQLite',
    {
      newKey: z.string().optional().describe('New 32-byte key (base64). If not provided, generates a new random key.')
    },
    async ({ newKey }) => {
      try {
        if (!registryDB) {
          throw new Error('SQLite database not initialized');
        }
        
        if (newKey) {
          const keyBuffer = Buffer.from(newKey, 'base64');
          if (keyBuffer.length !== 32) {
            throw new Error('New key must be exactly 32 bytes when base64 decoded');
          }
        }
        
        const rotateSuccess = await registryDB.rotateMemoryKeys();
        
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
    }
  );

  // Memory Save tool
  server.tool(
    'memory_save',
    'Manually save all memory data to SQLite persistent storage',
    {},
    async () => {
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
    }
  );

  // Memory Migration tool  
  server.tool(
    'memory_migrate_from_filesystem',
    'Migrate existing filesystem-based memory data to SQLite persistence',
    {
      oldDataPath: z.string().optional().describe('Path to old memory data file (optional)')
    },
    async ({ oldDataPath }) => {
      try {
        if (!registryDB) {
          throw new Error('SQLite database not initialized');
        }

        const fs = require('fs');
        const path = require('path');

        // Default path for old memory data
        const dataPath = oldDataPath || path.join(process.cwd(), 'memory_store.json');
        
        if (!fs.existsSync(dataPath)) {
          return {
            content: [
              {
                type: "text", 
                text: `No old memory data found at ${dataPath}`
              }
            ]
          };
        }

        // Load old data
        const oldData = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
        let migratedCount = 0;

        // Migrate each CI to SQLite
        for (const [ciKey, ciData] of Object.entries(oldData)) {
          await registryDB.saveMemoryCI(ciKey, ciData, determineCIType(ciData));
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
    }
  );

  console.log('[MCP SDK] Registered 10 memory tools with SQLite persistence');
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

module.exports = {
  initialize,
  registerMemoryTools,
  mergeCI,
  getMemoryStore,
  cleanup,
  triggerSave,
  startAutoSave,
  stopAutoSave
};
