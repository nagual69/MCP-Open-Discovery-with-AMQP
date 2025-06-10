/**
 * Memory Tools Module for MCP Open Discovery
 * 
 * This module provides tools for interacting with the in-memory CMDB
 */

// Reference to the in-memory CI store
let ciMemory;

/**
 * Initialize the memory tools module
 * @param {Object} memoryStore - Reference to the server's memory store
 */
function initialize(memoryStore) {
  ciMemory = memoryStore;
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
 * Returns the tool definitions for memory tools
 * @returns {Array} Array of tool definitions
 */
function getTools() {
  return [
    {
      name: 'memory_get',
      description: 'Get a CI object from MCP memory by key',
      schema: {
        type: 'object',
        properties: {
          key: { type: 'string', description: 'Unique CI key (e.g., ci:host:192.168.1.10)' }
        },
        required: ['key']
      },      command: async (args) => {
        const key = args.key;
        return key in ciMemory ? ciMemory[key] : null;
      }
    },
    {
      name: 'memory_set',
      description: 'Set a CI object in MCP memory by key',
      schema: {
        type: 'object',
        properties: {
          key: { type: 'string', description: 'Unique CI key (e.g., ci:host:192.168.1.10)' },
          value: { type: 'object', description: 'CI object to store' }
        },
        required: ['key', 'value']
      },      command: async (args) => {
        const key = args.key;
        ciMemory[key] = args.value;
        return { success: true };
      }
    },
    {
      name: 'memory_merge',
      description: 'Merge new data into an existing CI in MCP memory',
      schema: {
        type: 'object',
        properties: {
          key: { type: 'string', description: 'Unique CI key (e.g., ci:host:192.168.1.10)' },
          value: { type: 'object', description: 'Partial CI data to merge' }
        },
        required: ['key', 'value']
      },      command: async (args) => {
        const key = args.key;
        const existing = key in ciMemory ? ciMemory[key] : {};
        ciMemory[key] = mergeCI(existing, args.value);
        return { success: true };
      }
    },
    {
      name: 'memory_query',
      description: 'Query MCP memory for CIs matching a pattern or incomplete CIs',
      schema: {
        type: 'object',
        properties: {
          pattern: { type: 'string', description: 'Pattern for CI keys (optional, e.g., ci:host:*)' }
        }
      },
      command: async (args) => {
        // If a pattern is provided, return all CIs whose key matches the pattern (supports * as wildcard)
        if (args.pattern && typeof args.pattern === 'string') {          // Convert glob pattern to RegExp
          const pattern = args.pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
          const regex = new RegExp('^' + pattern + '$');
          const matches = [];
          for (const key in ciMemory) {
            if (regex.test(key)) matches.push({ key, ci: ciMemory[key] });
          }
          return { cis: matches };
        } else {
          // Default: find incomplete CIs (missing type or os)
          const incomplete = [];
          for (const key in ciMemory) {
            const ci = ciMemory[key];
            if (!ci.type || !ci.os) incomplete.push({ key, ci });
          }
          return { cis: incomplete };
        }
      }
    }
  ];
}

module.exports = { 
  initialize,
  getTools,
  mergeCI
};
