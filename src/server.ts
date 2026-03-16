import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SetLevelRequestSchema } from '@modelcontextprotocol/sdk/types.js';

import type { AppConfig } from './config';
import { bootstrapBuiltinPlugins, getStats, initialize } from './plugins/plugin-registry';
import { createSetLevelHandler, logAndNotify } from './runtime/logging';
import { createOauthMiddlewareFactory, createProtectedResourceMetadataHandler } from './runtime/oauth';
import { clearManagedTransports } from './runtime/transport-state';
import { startConfiguredTransports, stopConfiguredTransports, type ManagedTransports } from './transports';
import { createLogger } from './utils';

let serverInstance: McpServer | null = null;
let managedTransports: ManagedTransports | null = null;
let serverInitialization: Promise<McpServer> | null = null;
let processHandlersInstalled = false;

const logger = createLogger('SERVER');

function detectDefaultTransportModes(): Array<'stdio' | 'http' | 'amqp'> {
  const environmentValue = process.env.TRANSPORT_MODE;
  if (environmentValue) {
    return environmentValue
      .split(',')
      .map((entry) => entry.trim().toLowerCase())
      .filter((entry): entry is 'stdio' | 'http' | 'amqp' => entry === 'stdio' || entry === 'http' || entry === 'amqp');
  }

  const isContainer = Boolean(process.env.DOCKER_CONTAINER || process.env.KUBERNETES_SERVICE_HOST || process.env.container);
  const isInteractive = Boolean(process.stdin.isTTY && process.stdout.isTTY);
  if (isContainer) {
    return ['http', 'amqp'];
  }
  if (isInteractive) {
    return ['stdio'];
  }
  return ['stdio', 'http'];
}

function serverLog(level: 'debug' | 'info' | 'warn' | 'error', message: string, context?: Record<string, unknown>): void {
  if (level === 'error') {
    logger.error(message, context);
    void logAndNotify('error', message, context);
    return;
  }
  if (level === 'warn') {
    logger.warn(message, context);
    void logAndNotify('warning', message, context);
    return;
  }
  if (level === 'debug') {
    logger.debug(message, context);
    void logAndNotify('debug', message, context);
    return;
  }

  logger.info(message, context);
  void logAndNotify('info', message, context);
}

export function createAppConfig(): AppConfig {
  const port = Number.parseInt(process.env.HTTP_PORT || process.env.PORT || '6270', 10);

  return {
    nodeEnv: process.env.NODE_ENV || 'development',
    transportModes: detectDefaultTransportModes(),
    port,
    host: process.env.HTTP_HOST || '0.0.0.0',
    pluginsRoot: process.env.PLUGINS_ROOT || 'plugins',
    dataDir: process.env.DATA_DIR || 'data',
    logLevel: process.env.LOG_LEVEL || 'info',
    requireSignatures: /^(1|true)$/i.test(process.env.REQUIRE_SIGNATURES || process.env.PLUGIN_REQUIRE_SIGNED || ''),
    allowRuntimeDependencies: /^(1|true)$/i.test(process.env.PLUGIN_ALLOW_RUNTIME_DEPS || ''),
    strictCapabilities: /^(1|true)$/i.test(process.env.STRICT_CAPABILITIES || ''),
    strictIntegrity: /^(1|true)$/i.test(process.env.STRICT_INTEGRITY || ''),
    oauth: {
      enabled: process.env.OAUTH_ENABLED === 'true',
      realm: process.env.OAUTH_REALM || 'mcp-open-discovery',
      protectedEndpoints: (process.env.OAUTH_PROTECTED_ENDPOINTS || '/mcp').split(',').map((entry) => entry.trim()),
      supportedScopes: (process.env.OAUTH_SUPPORTED_SCOPES || 'mcp:read mcp:tools mcp:resources').split(' ').filter(Boolean),
      authorizationServer: process.env.OAUTH_AUTHORIZATION_SERVER || null,
      introspectionEndpoint: process.env.OAUTH_INTROSPECTION_ENDPOINT || null,
      clientId: process.env.OAUTH_CLIENT_ID || null,
      clientSecret: process.env.OAUTH_CLIENT_SECRET || null,
      resourceServerUri: process.env.OAUTH_RESOURCE_SERVER_URI || `http://localhost:${port}`,
      tokenCacheTtl: Number.parseInt(process.env.OAUTH_TOKEN_CACHE_TTL || '300', 10),
      requireHttps: process.env.NODE_ENV === 'production',
    },
    amqp: {
      enabled: process.env.AMQP_ENABLED !== 'false',
      url: process.env.AMQP_URL || 'amqp://guest:guest@localhost:5672',
      exchange: process.env.AMQP_EXCHANGE || 'mcp.notifications',
      queuePrefix: process.env.AMQP_QUEUE_PREFIX || 'mcp.discovery',
      prefetch: Number.parseInt(process.env.AMQP_PREFETCH_COUNT || '1', 10),
      reconnectDelay: Number.parseInt(process.env.AMQP_RECONNECT_DELAY || '5000', 10),
      maxReconnectAttempts: Number.parseInt(process.env.AMQP_MAX_RETRY_ATTEMPTS || '10', 10),
      messageTTL: Number.parseInt(process.env.AMQP_MESSAGE_TTL || '3600000', 10),
      queueTTL: Number.parseInt(process.env.AMQP_QUEUE_TTL || '7200000', 10),
    },
  };
}

export async function createMcpServer(): Promise<McpServer> {
  if (serverInstance) {
    return serverInstance;
  }

  if (serverInitialization) {
    return serverInitialization;
  }

  serverInitialization = (async () => {
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

    server.server.setRequestHandler(SetLevelRequestSchema, createSetLevelHandler() as never);
    await initialize(server);
    await bootstrapBuiltinPlugins();

    serverInstance = server;
    return server;
  })();

  try {
    return await serverInitialization;
  } catch (error) {
    serverInitialization = null;
    throw error;
  }
}

export async function startServer(config: AppConfig = createAppConfig()): Promise<{
  server: McpServer;
  stats: ReturnType<typeof getStats>;
}> {
  serverLog('info', 'Starting typed MCP Open Discovery runtime', {
    transportModes: config.transportModes,
    oauthEnabled: config.oauth.enabled,
    amqpEnabled: config.amqp.enabled,
  });

  const server = await createMcpServer();
  const started = await startConfiguredTransports(server, config, {
    oauthMiddleware: createOauthMiddlewareFactory(config.oauth),
    protectedResourceMetadataHandler: createProtectedResourceMetadataHandler(config.oauth),
  });
  managedTransports = started.managed;

  if (!started.results.transports.some((result) => result.started)) {
    throw new Error('No transports could be started');
  }

  return {
    server,
    stats: getStats(),
  };
}

export async function stopServer(): Promise<void> {
  if (!managedTransports) {
    clearManagedTransports();
    return;
  }

  await stopConfiguredTransports(managedTransports);
  managedTransports = null;
}

export function installProcessHandlers(): void {
  if (processHandlersInstalled) {
    return;
  }

  processHandlersInstalled = true;

  const shutdown = async (signal: string, exitCode = 0): Promise<void> => {
    try {
      serverLog('info', 'Received shutdown signal', { signal });
      await stopServer();
      process.exit(exitCode);
    } catch (error) {
      serverLog('error', 'Error during graceful shutdown', {
        signal,
        error: error instanceof Error ? error.message : String(error),
      });
      process.exit(1);
    }
  };

  process.on('SIGINT', () => {
    void shutdown('SIGINT');
  });
  process.on('SIGTERM', () => {
    void shutdown('SIGTERM');
  });
  process.on('uncaughtException', (error) => {
    serverLog('error', 'Uncaught exception', {
      error: error.message,
      stack: error.stack,
    });
    void shutdown('uncaughtException', 1);
  });
  process.on('unhandledRejection', (reason) => {
    serverLog('error', 'Unhandled rejection', {
      reason: reason instanceof Error ? reason.message : String(reason),
      stack: reason instanceof Error ? reason.stack : undefined,
    });
    void shutdown('unhandledRejection', 1);
  });
}

export async function runServerAsMain(config: AppConfig = createAppConfig()): Promise<void> {
  installProcessHandlers();
  const { stats } = await startServer(config);
  serverLog('info', 'Typed MCP Open Discovery runtime started', {
    transportModes: config.transportModes,
    registry: stats,
  });
}

export function getServerInstance(): McpServer | null {
  return serverInstance;
}

export function getManagedTransports(): ManagedTransports | null {
  return managedTransports;
}