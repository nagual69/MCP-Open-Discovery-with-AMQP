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
    name: 'tool_store_list_policies',
    description: 'List active plugin policy / feature flags',
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
  },
  {
    name: 'tool_store_show',
    description: 'Show detailed metadata for a plugin (manifest + lock + capabilities)',
    inputSchema: z.object({ pluginId: z.string() })
  },
  {
    name: 'tool_store_rescan_integrity',
    description: 'Recompute dist hash & metrics for a plugin and compare with manifest/lock',
    inputSchema: z.object({ pluginId: z.string() })
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
    case 'tool_store_list_policies': {
      const flags = {
        PLUGIN_ALLOW_RUNTIME_DEPS: process.env.PLUGIN_ALLOW_RUNTIME_DEPS || null,
        STRICT_CAPABILITIES: process.env.STRICT_CAPABILITIES || process.env.PLUGIN_STRICT_CAPABILITIES || null,
        REQUIRE_SIGNATURES: process.env.REQUIRE_SIGNATURES || null,
        PLUGIN_REQUIRE_SIGNED: process.env.PLUGIN_REQUIRE_SIGNED || null,
        SANDBOX_AVAILABLE: process.env.SANDBOX_AVAILABLE || null,
        SCHEMA_PATH: process.env.SCHEMA_PATH || null
      };
      return { content: [{ type: 'text', text: JSON.stringify({ flags }, null, 2) }] };
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
    case 'tool_store_show': {
      const plugin = pm.getPlugin(args.pluginId);
      if (!plugin) return { content: [{ type: 'text', text: 'Plugin not found' }], isError: true };
      const rootDir = fs.existsSync(plugin.path) && fs.statSync(plugin.path).isDirectory() ? plugin.path : path.dirname(plugin.path);
      let lock = null;
      try { const lp = path.join(rootDir, 'install.lock.json'); if (fs.existsSync(lp)) lock = JSON.parse(fs.readFileSync(lp,'utf8')); } catch {}
      return { content: [{ type: 'text', text: JSON.stringify({ manifest: plugin.manifest, lock, capabilitySnapshot: plugin.capabilitySnapshot || null }, null, 2) }] };
    }
    case 'tool_store_rescan_integrity': {
      const plugin = pm.getPlugin(args.pluginId);
      if (!plugin) return { content: [{ type: 'text', text: 'Plugin not found' }], isError: true };
      if (!(plugin.manifest && plugin.manifest.dist && plugin.manifest.dist.hash)) {
        return { content: [{ type: 'text', text: 'Plugin missing dist metadata (not v2 spec?)' }], isError: true };
      }
      const rootDir = fs.existsSync(plugin.path) && fs.statSync(plugin.path).isDirectory() ? plugin.path : path.dirname(plugin.path);
      const distDir = path.join(rootDir, 'dist');
      if (!fs.existsSync(distDir)) return { content: [{ type: 'text', text: 'dist directory missing' }], isError: true };
      const { computeDistHashDetailed } = require('./registry/plugin_loader');
      const { hashHex, fileCount, totalBytes } = computeDistHashDetailed(distDir);
      const declared = (plugin.manifest.dist.hash || '').replace(/^sha256:/,'');
      const match = hashHex.toLowerCase() === declared.toLowerCase();
      return { content: [{ type: 'text', text: JSON.stringify({ recomputed: { hashHex, fileCount, totalBytes }, declared, match }, null, 2) }], isError: !match };
    }
    default:
      throw new Error(`Unknown marketplace tool: ${name}`);
  }
}

module.exports = { tools, handleToolCall };
