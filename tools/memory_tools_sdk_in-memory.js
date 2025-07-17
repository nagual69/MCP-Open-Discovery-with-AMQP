/**
 * Memory Tools Module for MCP Open Discovery - SDK Compatible
 * 
 * This module provides tools for interacting with the in-memory CMDB
 * using the official MCP SDK patterns with Zod schemas.
 */

const { z } = require('zod');

// Reference to the in-memory CI store
let ciMemory = {};

/**
 * Initialize the memory tools module
 * @param {Object} memoryStore - Reference to the server's memory store
 */
function initialize(memoryStore) {
  ciMemory = memoryStore || {};
  console.log('[MCP SDK] Memory tools initialized');
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
        
        return {
          content: [
            {
              type: "text", 
              text: `Successfully stored CI with key: ${key}\nStored data: ${JSON.stringify(value, null, 2)}`
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
        const existing = key in ciMemory ? ciMemory[key] : {};
        const merged = mergeCI(existing, value);
        ciMemory[key] = merged;
        
        return {
          content: [
            {
              type: "text",
              text: `Successfully merged CI with key: ${key}\nMerged data: ${JSON.stringify(merged, null, 2)}`
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
        let results = [];
        
        if (pattern && typeof pattern === 'string') {
          // Convert glob pattern to RegExp
          const regexPattern = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
          const regex = new RegExp('^' + regexPattern + '$');
          
          for (const key in ciMemory) {
            if (regex.test(key)) {
              results.push({ key, ci: ciMemory[key] });
            }
          }
        } else {
          // Default: find incomplete CIs (missing type or os)
          for (const key in ciMemory) {
            const ci = ciMemory[key];
            if (!ci.type || !ci.os) {
              results.push({ key, ci });
            }
          }
        }
        
        const resultText = results.length > 0 
          ? `Found ${results.length} matching CIs:\n\n${results.map(r => `Key: ${r.key}\nData: ${JSON.stringify(r.ci, null, 2)}`).join('\n\n---\n\n')}`
          : pattern 
            ? `No CIs found matching pattern: ${pattern}`
            : 'No incomplete CIs found';
            
        return {
          content: [
            {
              type: "text",
              text: resultText
            }
          ]
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error querying CIs: ${error.message}`
            }
          ],
          isError: true
        };
      }
    }
  );

  console.log('[MCP SDK] Registered 4 memory tools');
}

/**
 * Get current memory store (for debugging/inspection)
 * @returns {Object} Current CI memory store
 */
function getMemoryStore() {
  return ciMemory;
}

module.exports = {
  initialize,
  registerMemoryTools,
  mergeCI,
  getMemoryStore
};
