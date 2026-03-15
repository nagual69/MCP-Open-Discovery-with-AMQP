// SPDX-License-Identifier: MPL-2.0
// tools/plugins/plugin-registry.js
// Replaces tools/registry/index.js as the primary capability manager.
// On startup loads all active plugins from SQLite; provides interface for main server.

const pluginManager = require('./plugin-manager');
const pluginDb = require('./db/plugin-db');
const path = require('path');
const fs = require('fs');

let mcpServer = null;
let initialized = false;

/**
 * Initialize the plugin registry with the singleton MCP server.
 * Loads all previously active plugins from SQLite on startup.
 */
async function initialize(server) {
  if (initialized) return;
  mcpServer = server;
  pluginManager.setMcpServer(server);

  // Re-activate all plugins that were active before this server instance started
  const activePlugins = pluginDb.getActivePlugins();
  const results = { loaded: [], failed: [] };

  for (const plugin of activePlugins) {
    try {
      await pluginManager.activate(plugin.id, { actor: 'system_startup', force: true });
      const manifest = JSON.parse(plugin.manifest_json);
      results.loaded.push({
        id: plugin.id,
        tools: manifest.capabilities?.tools?.length || 0,
        resources: manifest.capabilities?.resources?.length || 0,
        prompts: manifest.capabilities?.prompts?.length || 0
      });
    } catch (error) {
      console.error(`[PluginRegistry] Failed to re-activate ${plugin.id}:`, error.message);
      results.failed.push({ id: plugin.id, error: error.message });
    }
  }

  initialized = true;
  console.log(`[PluginRegistry] Initialized — ${results.loaded.length} active, ${results.failed.length} failed`);
  return results;
}

/**
 * Bootstrap built-in (blessed) plugins on first run.
 * Built-in plugins are pre-packaged in the server's plugins/builtin/ directory.
 * They are installed and activated automatically if not already in the DB.
 */
async function bootstrapBuiltinPlugins() {
  const builtinDir = path.join(__dirname, '../../plugins/builtin');
  if (!fs.existsSync(builtinDir)) {
    console.log('[PluginRegistry] No plugins/builtin/ directory found — skipping bootstrap');
    return;
  }

  const builtinZips = fs.readdirSync(builtinDir).filter(f => f.endsWith('.zip'));
  console.log(`[PluginRegistry] Bootstrapping ${builtinZips.length} built-in plugins...`);

  for (const zipFile of builtinZips) {
    // Convert filename like "net-utils@1.0.0.zip" → id "net-utils@1.0.0"
    const pluginId = zipFile.replace(/\.zip$/, '');
    const zipPath = path.join(builtinDir, zipFile);

    try {
      const existing = pluginDb.getPlugin(pluginId);
      if (!existing) {
        console.log(`[PluginRegistry] Installing built-in plugin: ${pluginId}`);
        await pluginManager.install(zipPath, {
          actor: 'system',
          isBuiltin: true,
          autoActivate: true
        });
        console.log(`[PluginRegistry] ✅ Bootstrapped: ${pluginId}`);
      } else if (existing.lifecycle_state !== 'active') {
        // Re-activate if not currently active
        await pluginManager.activate(pluginId, { actor: 'system_bootstrap' });
        console.log(`[PluginRegistry] ✅ Re-activated: ${pluginId}`);
      }
    } catch (error) {
      console.error(`[PluginRegistry] ❌ Failed to bootstrap ${zipFile}:`, error.message);
    }
  }
}

function getStats() {
  const db = pluginDb.getDb();
  const total = db.prepare('SELECT COUNT(*) as c FROM plugins').get().c;
  const active = db.prepare("SELECT COUNT(*) as c FROM plugins WHERE lifecycle_state = 'active'").get().c;
  const tools = db.prepare('SELECT COUNT(*) as c FROM plugin_tools WHERE is_active = 1').get().c;
  const resources = db.prepare('SELECT COUNT(*) as c FROM plugin_resources WHERE is_active = 1').get().c;
  const prompts = db.prepare('SELECT COUNT(*) as c FROM plugin_prompts WHERE is_active = 1').get().c;

  return {
    totalPlugins: total,
    activePlugins: active,
    activeTools: tools,
    activeResources: resources,
    activePrompts: prompts,
    // For backward compatibility with existing health endpoint
    tools,
    modules: active,
    categories: active
  };
}

function getPromptCounts() {
  return { total: pluginDb.getPromptCounts() };
}

function reset() {
  initialized = false;
  mcpServer = null;
}

module.exports = { initialize, bootstrapBuiltinPlugins, getStats, getPromptCounts, reset };
