/**
 * Marketplace Tools SDK
 *
 * Tools to integrate with the Plugin Manager as a marketplace interface.
 * These act as the "tool store" for discovering, searching, installing,
 * removing, and managing third-party tool modules.
 */

const { z } = require('zod');

const tools = [
  {
    name: 'tool_store_list',
    description: 'List discovered marketplace plugins and their status',
    inputSchema: z.object({}).optional()
  },
  {
    name: 'tool_store_search',
    description: 'Search discovered plugins by text and optional type',
    inputSchema: z.object({
      query: z.string().optional().describe('Search text'),
      type: z.string().optional().describe('Filter by manifest.type, e.g., tool-module')
    })
  },
  {
    name: 'tool_store_install',
    description: 'Install a plugin from a URL or local file path',
    inputSchema: z.object({
      url: z.string().url().optional().describe('HTTP(S) URL to a JS plugin file'),
      filePath: z.string().optional().describe('Local path to a JS plugin file'),
      pluginId: z.string().optional().describe('Explicit plugin ID/filename (optional)'),
      autoLoad: z.boolean().optional().describe('Automatically load after install')
    })
  },
  {
    name: 'tool_store_remove',
    description: 'Remove an installed plugin by ID',
    inputSchema: z.object({
      pluginId: z.string()
    })
  }
];

async function handleToolCall(name, args) {
  const { getPluginManager } = require('./registry/index.js');
  const pm = getPluginManager();
  await pm.initialize();

  switch (name) {
    case 'tool_store_list': {
      const list = pm.listPlugins();
      const stats = pm.getStats();
      return { content: [{ type: 'text', text: JSON.stringify({ plugins: list, stats }, null, 2) }] };
    }
    case 'tool_store_search': {
      const results = pm.search({ query: args?.query, type: args?.type });
      return { content: [{ type: 'text', text: JSON.stringify({ results }, null, 2) }] };
    }
    case 'tool_store_install': {
      if (!args?.url && !args?.filePath) {
        return { content: [{ type: 'text', text: 'Either url or filePath is required' }], isError: true };
      }
      const opts = { pluginId: args?.pluginId, autoLoad: !!args?.autoLoad };
      const res = args.url
        ? await pm.installFromUrl(args.url, opts)
        : await pm.installFromFile(args.filePath, opts);
      return { content: [{ type: 'text', text: JSON.stringify(res, null, 2) }], isError: res.success === false };
    }
    case 'tool_store_remove': {
      const ok = await pm.removePlugin(args.pluginId);
      return { content: [{ type: 'text', text: JSON.stringify({ success: ok }, null, 2) }], isError: !ok };
    }
    default:
      throw new Error(`Unknown marketplace tool: ${name}`);
  }
}

module.exports = { tools, handleToolCall };
