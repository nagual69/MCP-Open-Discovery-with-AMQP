import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SetLevelRequestSchema } from '@modelcontextprotocol/sdk/types.js';

import type { AppConfig } from './config';
import { bootstrapBuiltinPlugins, getStats, initialize } from './plugins/plugin-registry';
import { startConfiguredTransports, type ManagedTransports } from './transports';

let serverInstance: McpServer | null = null;
let managedTransports: ManagedTransports | null = null;

export function createAppConfig(): AppConfig {
  const transportModes = (process.env.TRANSPORT_MODE || '')
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry): entry is 'stdio' | 'http' | 'amqp' => entry === 'stdio' || entry === 'http' || entry === 'amqp');

  return {
    nodeEnv: process.env.NODE_ENV || 'development',
    transportModes,
    port: Number.parseInt(process.env.HTTP_PORT || process.env.PORT || '3000', 10),
    host: process.env.HTTP_HOST || '0.0.0.0',
    pluginsRoot: process.env.PLUGINS_ROOT || 'plugins',
    dataDir: process.env.DATA_DIR || 'data',
    requireSignatures: /^(1|true)$/i.test(process.env.REQUIRE_SIGNATURES || process.env.PLUGIN_REQUIRE_SIGNED || ''),
    allowRuntimeDependencies: /^(1|true)$/i.test(process.env.PLUGIN_ALLOW_RUNTIME_DEPS || ''),
    strictCapabilities: /^(1|true)$/i.test(process.env.STRICT_CAPABILITIES || ''),
    strictIntegrity: /^(1|true)$/i.test(process.env.STRICT_INTEGRITY || ''),
    oauth: {
      enabled: process.env.OAUTH_ENABLED === 'true',
      realm: process.env.OAUTH_REALM || 'mcp-open-discovery',
      protectedEndpoints: (process.env.OAUTH_PROTECTED_ENDPOINTS || '/mcp').split(',').map((entry) => entry.trim()),
    },
  };
}

export async function createMcpServer(): Promise<McpServer> {
  if (serverInstance) {
    return serverInstance;
  }

  const server = new McpServer(
    {
      name: 'mcp-open-discovery',
      version: '2.0.0',
      description: 'Network discovery tools via Model Context Protocol',
    },
    {
      capabilities: {
        tools: { listChanged: true },
        resources: { listChanged: true },
        prompts: { listChanged: true },
        logging: {},
      },
    },
  );

  server.server.setRequestHandler(SetLevelRequestSchema, async () => ({}));
  await initialize(server);
  await bootstrapBuiltinPlugins();

  serverInstance = server;
  return server;
}

export async function startServer(config: AppConfig = createAppConfig()): Promise<{
  server: McpServer;
  stats: ReturnType<typeof getStats>;
}> {
  const server = await createMcpServer();
  const started = await startConfiguredTransports(server, config);
  managedTransports = started.managed;

  return {
    server,
    stats: getStats(),
  };
}

export function getServerInstance(): McpServer | null {
  return serverInstance;
}

export function getManagedTransports(): ManagedTransports | null {
  return managedTransports;
}