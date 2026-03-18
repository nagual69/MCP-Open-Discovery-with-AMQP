import fs from 'fs/promises';
import os from 'os';
import path from 'path';

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

interface PluginManifest {
  name: string;
  version: string;
  capabilities?: {
    tools?: string[];
    resources?: string[];
    prompts?: string[];
  };
}

interface ExpectedCapabilities {
  prompts: number;
  resources: number;
  tools: number;
}

async function resolvePluginValidationTarget(pluginNameArg?: string): Promise<{
  expectedCapabilities: ExpectedCapabilities;
  manifest: PluginManifest;
  pluginZip: string;
}> {
  const pluginName = pluginNameArg || 'net-utils';
  const manifestPath = path.join(process.cwd(), 'plugins', 'src', pluginName, 'mcp-plugin.json');
  const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8')) as PluginManifest;
  const expectedCapabilities = {
    tools: manifest.capabilities?.tools?.length ?? 0,
    resources: manifest.capabilities?.resources?.length ?? 0,
    prompts: manifest.capabilities?.prompts?.length ?? 0,
  };
  const expectedRegistrationTotal =
    expectedCapabilities.tools + expectedCapabilities.resources + expectedCapabilities.prompts;

  if (!manifest.name || !manifest.version) {
    throw new Error(`Plugin manifest at ${manifestPath} is missing name or version`);
  }

  if (expectedRegistrationTotal === 0) {
    throw new Error(`Plugin manifest at ${manifestPath} does not declare any tools, resources, or prompts to validate`);
  }

  return {
    expectedCapabilities,
    manifest,
    pluginZip: path.join(process.cwd(), 'plugins', 'builtin', `${manifest.name}@${manifest.version}.zip`),
  };
}

async function main(): Promise<void> {
  const pluginNameArg = process.argv[2];
  const workspaceTempBase = path.join(os.tmpdir(), 'mcpod-typed-validation');
  await fs.mkdir(workspaceTempBase, { recursive: true });
  const tempRoot = await fs.mkdtemp(path.join(workspaceTempBase, 'run-'));
  const dataDir = path.join(tempRoot, 'data');
  const pluginsRoot = path.join(tempRoot, 'plugins');

  let closeDb: (() => void) | undefined;

  try {
    process.env.DATA_DIR = dataDir;
    process.env.PLUGIN_DB_PATH = path.join(dataDir, 'plugin_store.db');
    process.env.PLUGINS_ROOT = pluginsRoot;

    await fs.mkdir(dataDir, { recursive: true });
    await fs.mkdir(pluginsRoot, { recursive: true });

    const [{ closeDb: loadedCloseDb, getPlugin }, pluginManager, validationTarget] = await Promise.all([
      import('./plugins/db/plugin-db'),
      import('./plugins/plugin-manager'),
      resolvePluginValidationTarget(pluginNameArg),
    ]);
    closeDb = loadedCloseDb;

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

    const installed = await install(validationTarget.pluginZip, { actor: 'typed_validation' });
    const activated = await activate(installed.pluginId, { actor: 'typed_validation' });
    const activeRecord = getPlugin(installed.pluginId);
    const activeRegistration = getActiveRegistrations().get(installed.pluginId);

    if (!activeRecord || activeRecord.lifecycle_state !== 'active') {
      throw new Error(`Expected ${installed.pluginId} to be active after activation`);
    }

    const actualCapabilities = {
      tools: activeRegistration?.tools.length ?? 0,
      resources: activeRegistration?.resources.length ?? 0,
      prompts: activeRegistration?.prompts.length ?? 0,
    };

    if (
      !activeRegistration ||
      actualCapabilities.tools !== validationTarget.expectedCapabilities.tools ||
      actualCapabilities.resources !== validationTarget.expectedCapabilities.resources ||
      actualCapabilities.prompts !== validationTarget.expectedCapabilities.prompts
    ) {
      throw new Error(
        `Expected capabilities ${JSON.stringify(validationTarget.expectedCapabilities)} for ${installed.pluginId}, got ${JSON.stringify(actualCapabilities)}`,
      );
    }

    const deactivated = await deactivate(installed.pluginId, { actor: 'typed_validation' });
    const inactiveRecord = getPlugin(installed.pluginId);

    if (!inactiveRecord || inactiveRecord.lifecycle_state !== 'inactive') {
      throw new Error(`Expected ${installed.pluginId} to be inactive after deactivation`);
    }

    await uninstall(installed.pluginId, { actor: 'typed_validation' });

    console.log(
      JSON.stringify(
        {
          pluginId: installed.pluginId,
          pluginName: validationTarget.manifest.name,
          pluginVersion: validationTarget.manifest.version,
          activated,
          deactivated,
          capturedCapabilities: actualCapabilities,
          expectedCapabilities: validationTarget.expectedCapabilities,
          validation: 'ok',
        },
        null,
        2,
      ),
    );
  } finally {
    closeDb?.();
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});