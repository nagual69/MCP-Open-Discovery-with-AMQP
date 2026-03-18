import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import fs from 'fs';
import path from 'path';

import type { PluginLoaderResult, PluginRegistryStats } from '../types';
import { getActivePlugins, getActiveToolNames, getDb, getPlugin, getPromptCounts } from './db/plugin-db';
import { activate, install, setMcpServer } from './plugin-manager';

let stats: PluginRegistryStats = {
  totalPlugins: 0,
  activePlugins: 0,
  activeTools: 0,
  activeResources: 0,
  activePrompts: 0,
};
let initialized = false;

const BUILTIN_SOURCE_ROOT = path.join(process.cwd(), 'plugins', 'src');

function refreshStats(): void {
  const database = getDb();
  stats = {
    totalPlugins: (database.prepare('SELECT COUNT(*) AS count FROM plugins').get() as { count: number }).count,
    activePlugins: (database.prepare("SELECT COUNT(*) AS count FROM plugins WHERE lifecycle_state = 'active'").get() as { count: number }).count,
    activeTools: getActiveToolNames().length,
    activeResources: (database.prepare('SELECT COUNT(*) AS count FROM plugin_resources WHERE is_active = 1').get() as { count: number }).count,
    activePrompts: getPromptCounts(),
  };
}

export async function initialize(server: McpServer): Promise<PluginLoaderResult> {
  if (initialized) {
    refreshStats();
    return { loaded: [], failed: [] };
  }

  setMcpServer(server);
  const activePlugins = getActivePlugins();
  const loaded: PluginLoaderResult['loaded'] = [];
  const failed: PluginLoaderResult['failed'] = [];

  for (const plugin of activePlugins) {
    try {
      const activation = await activate(plugin.id, { actor: 'system_startup' });
      loaded.push({
        id: plugin.id,
        tools: activation.toolCount ?? 0,
        resources: activation.resourceCount ?? 0,
        prompts: activation.promptCount ?? 0,
      });
    } catch (error) {
      failed.push({ id: plugin.id, error: error instanceof Error ? error.message : 'Activation failed' });
    }
  }

  refreshStats();
  initialized = true;

  return {
    loaded,
    failed,
    stats: {
      toolsRegistered: getActiveToolNames().length,
      resourcesRegistered: stats.activeResources,
      promptsRegistered: getPromptCounts(),
      invalidTools: 0,
      warnings: 0,
    },
  };
}

export async function bootstrapBuiltinPlugins(): Promise<void> {
  if (!fs.existsSync(BUILTIN_SOURCE_ROOT)) {
    return;
  }

  const pluginRoots = fs
    .readdirSync(BUILTIN_SOURCE_ROOT, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(BUILTIN_SOURCE_ROOT, entry.name));

  for (const pluginRoot of pluginRoots) {
    const manifestPath = path.join(pluginRoot, 'mcp-plugin.json');
    if (!fs.existsSync(manifestPath)) {
      continue;
    }

    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as { name: string; version: string };
    const pluginId = `${manifest.name}@${manifest.version}`;
    const existing = getPlugin(pluginId);

    if (!existing) {
      await install(pluginRoot, { actor: 'system', isBuiltin: true, autoActivate: true });
      continue;
    }

    if (existing.lifecycle_state !== 'active') {
      await activate(pluginId, { actor: 'system_bootstrap' });
    }
  }

  refreshStats();
}

export function getStats(): PluginRegistryStats {
  refreshStats();
  return stats;
}