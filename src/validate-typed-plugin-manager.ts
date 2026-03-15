import fs from 'fs/promises';
import os from 'os';
import path from 'path';

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

async function main(): Promise<void> {
  const workspaceTempBase = path.join(process.cwd(), '.typed-validation');
  await fs.mkdir(workspaceTempBase, { recursive: true });
  const tempRoot = await fs.mkdtemp(path.join(workspaceTempBase, 'run-'));
  const dataDir = path.join(tempRoot, 'data');
  const pluginsRoot = path.join(tempRoot, 'plugins');

  process.env.DATA_DIR = dataDir;
  process.env.PLUGIN_DB_PATH = path.join(dataDir, 'plugin_store.db');
  process.env.PLUGINS_ROOT = pluginsRoot;

  await fs.mkdir(dataDir, { recursive: true });
  await fs.mkdir(pluginsRoot, { recursive: true });

  const [{ closeDb, getPlugin }, pluginManager] = await Promise.all([
    import('./plugins/db/plugin-db'),
    import('./plugins/plugin-manager'),
  ]);

  const { activate, deactivate, getActiveRegistrations, install, setMcpServer, uninstall } = pluginManager;

  const server = new McpServer(
    {
      name: 'typed-plugin-manager-validator',
      version: '0.0.0',
    },
    {
      capabilities: {
        tools: { listChanged: true },
        resources: { listChanged: true },
        prompts: { listChanged: true },
      },
    },
  );

  setMcpServer(server);

  const pluginZip = path.join(process.cwd(), 'plugins', 'builtin', 'net-utils@1.0.0.zip');
  const installed = await install(pluginZip, { actor: 'typed_validation' });
  const activated = await activate(installed.pluginId, { actor: 'typed_validation' });
  const activeRecord = getPlugin(installed.pluginId);
  const activeRegistration = getActiveRegistrations().get(installed.pluginId);

  if (!activeRecord || activeRecord.lifecycle_state !== 'active') {
    throw new Error(`Expected ${installed.pluginId} to be active after activation`);
  }

  if (!activeRegistration || activeRegistration.tools.length !== 9) {
    throw new Error(`Expected 9 captured tools for ${installed.pluginId}`);
  }

  const deactivated = await deactivate(installed.pluginId, { actor: 'typed_validation' });
  const inactiveRecord = getPlugin(installed.pluginId);

  if (!inactiveRecord || inactiveRecord.lifecycle_state !== 'inactive') {
    throw new Error(`Expected ${installed.pluginId} to be inactive after deactivation`);
  }

  await uninstall(installed.pluginId, { actor: 'typed_validation' });
  closeDb();

  await fs.rm(tempRoot, { recursive: true, force: true });

  console.log(
    JSON.stringify(
      {
        pluginId: installed.pluginId,
        activated,
        deactivated,
        capturedTools: activeRegistration.tools.length,
        validation: 'ok',
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});