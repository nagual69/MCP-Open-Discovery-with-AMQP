// SPDX-License-Identifier: MPL-2.0
/**
 * MCP Open Discovery Server v2.0 - Clean Multi-Transport Architecture
 * 
 * Singleton MCP server with modular transport management.
 * Supports stdio, HTTP, AMQP, and gRPC transports via transport-manager.js
 */

const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { setDefaultLevel, setSessionLevel, logAndNotify } = require('./tools/mcp/logging_adapter');
const { broadcast, buildNotification } = require('./tools/mcp/notification_hub');
const { registerAllTools, registerAllResources, getServerInstance } = require('./tools/registry/index');
const { registerAllPrompts } = require('./tools/prompts_sdk');

// Transport Manager v2.0 - Modular Architecture
const { 
  startAllTransports, 
  cleanupAllTransports,
  detectEnvironment,
  createTransportConfig,
  parseTransportMode
} = require('./tools/transports/core/transport-manager');

// Import OAuth and registry utilities  
const { 
  getRegistry, 
  getResourceCounts, 
  getPromptCounts, 
  cleanup 
} = require('./tools/registry/index');

// OAuth and other utilities
let getAmqpStatus, protectedResourceMetadataHandler, oauthMiddleware;
try {
  const oauth = require('./tools/transports/core/oauth-middleware');
  protectedResourceMetadataHandler = oauth.protectedResourceMetadataHandler;
  oauthMiddleware = oauth.oauthMiddleware;
} catch (error) {
  log('debug', 'OAuth middleware not available', { error: error.message });
}

try {
  const amqpStatus = require('./tools/transports/status/amqp-status');
  getAmqpStatus = amqpStatus.getAmqpStatus;
} catch (error) {
  log('debug', 'AMQP status module not available', { error: error.message });
}

/**
 * Environment Configuration
 */
const CONFIG = {
  HTTP_PORT: parseInt(process.env.HTTP_PORT) || 3000,
  TRANSPORT_MODE: process.env.TRANSPORT_MODE || (detectEnvironment().isContainer ? 'http,amqp' : 'stdio'),
  LOG_LEVEL: process.env.LOG_LEVEL || 'info',
  
  // OAuth Configuration
  OAUTH_ENABLED: process.env.OAUTH_ENABLED === 'true',
  OAUTH_REALM: process.env.OAUTH_REALM || 'mcp-open-discovery',
  OAUTH_PROTECTED_ENDPOINTS: (process.env.OAUTH_PROTECTED_ENDPOINTS || '/mcp').split(','),
  
  // AMQP Configuration
  AMQP_URL: process.env.AMQP_URL || 'amqp://mcp:discovery@rabbitmq:5672',
  AMQP_QUEUE_PREFIX: process.env.AMQP_QUEUE_PREFIX || 'mcp.discovery',
  AMQP_EXCHANGE: process.env.AMQP_EXCHANGE || 'mcp.notifications',
  
  // gRPC Configuration
  GRPC_PORT: parseInt(process.env.GRPC_PORT) || 3001,
  GRPC_MAX_CONNECTIONS: parseInt(process.env.GRPC_MAX_CONNECTIONS) || 100,
  GRPC_KEEPALIVE_TIME: parseInt(process.env.GRPC_KEEPALIVE_TIME) || 30000
};

/**
 * Simple logging
 */
function log(level, message, data = null) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] [${level.toUpperCase()}] ${message}`;
  
  if (level === 'error') {
    console.error(logMessage, data ? JSON.stringify(data, null, 2) : '');
  } else {
    console.log(logMessage, data ? JSON.stringify(data, null, 2) : '');
  }

  // Emit MCP notifications/message for logs as best-effort
  // Do not block on failures
  try {
    logAndNotify(level, message, data || undefined);
  } catch {}
}

/**
 * SINGLETON MCP SERVER
 * 
 * One server instance shared across all transports
 */
let globalMcpServer = null;
let serverInitialized = false;

/**
 * Create the singleton MCP server instance
 */
async function createMcpServer() {
  if (globalMcpServer && serverInitialized) {
    return globalMcpServer;
  }

  if (globalMcpServer && !serverInitialized) {
    // Wait for initialization to complete
    while (!serverInitialized) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    return globalMcpServer;
  }

  log('info', '[SINGLETON] Creating MCP server instance');
  
  globalMcpServer = new McpServer(
    {
      name: 'mcp-open-discovery',
      version: '2.0.0',
      description: 'Network discovery tools via Model Context Protocol'
    },
    {
      capabilities: {
        tools: { listChanged: true },
        resources: { listChanged: true },
        prompts: { listChanged: true }
      }
    }
  );

  // Publish server reference to global fallback for cross-module singletons
  try {
    const GLOBAL_KEY = '__MCP_OPEN_DISCOVERY__';
    const g = globalThis || global;
    g[GLOBAL_KEY] = g[GLOBAL_KEY] || {};
    g[GLOBAL_KEY].serverInstance = globalMcpServer;
  } catch {}

  try {
  // Register all components
    log('info', '[SINGLETON] Starting tool registration');
    await registerAllTools(globalMcpServer);
    // Validate that registry captured the server instance for dynamic ops
    try {
      const srv = getServerInstance && getServerInstance();
      if (!srv) {
        log('warn', '[SINGLETON] Registry did not capture server instance; dynamic ops may fail');
      }
    } catch {}
    log('info', '[SINGLETON] Tool registration complete');

    log('info', '[SINGLETON] Starting resource registration');
    await registerAllResources(globalMcpServer);
    log('info', '[SINGLETON] Resource registration complete');

    log('info', '[SINGLETON] Starting prompt registration');
    const promiseResult = registerAllPrompts(globalMcpServer);
    if (promiseResult && typeof promiseResult.then === 'function') {
      await promiseResult;
    }
    log('info', '[SINGLETON] Prompt registration complete');

    serverInitialized = true;
    log('info', '[SINGLETON] ✅ MCP server instance ready for all transports');

    // Register request handler for logging/setLevel (per MCP spec)
    try {
      if (typeof globalMcpServer.setRequestHandler === 'function') {
        globalMcpServer.setRequestHandler('logging/setLevel', async (params, context) => {
          const level = params?.level;
          const sessionId = context?.sessionId || globalMcpServer?.server?._transport?.sessionId;
          if (!level) {
            return { ok: false, error: 'level is required' };
          }
          setDefaultLevel(level);
          if (sessionId) {
            setSessionLevel(sessionId, level);
          }
          // Acknowledge
          return { ok: true, level, sessionId };
        });
      }
    } catch (e) {
      log('warn', 'Failed to register logging/setLevel handler', { error: e.message });
    }

    return globalMcpServer;

  } catch (error) {
    log('error', '[SINGLETON] Server initialization failed', {
      error: error.message,
      stack: error.stack
    });
    throw error;
  }
}

/**
 * Health data provider for transport manager
 */
function getHealthData() {
  const registry = getRegistry();
  const stats = registry ? registry.getStats() : { tools: 0, modules: 0, categories: 0 };
  
  // Get AMQP status if available
  let amqpStatus = null;
  try {
    amqpStatus = getAmqpStatus && getAmqpStatus();
  } catch (error) {
    // AMQP module not available or not loaded
  }
  
  const healthResponse = {
    status: 'healthy',
    version: '2.0.0',
    registry: stats,
    resources: getResourceCounts ? getResourceCounts() : {},
    prompts: getPromptCounts ? getPromptCounts() : {},
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    oauth: {
      enabled: CONFIG.OAUTH_ENABLED,
      realm: CONFIG.OAUTH_REALM,
      protectedEndpoints: CONFIG.OAUTH_PROTECTED_ENDPOINTS
    }
  };
  
  // Add AMQP status if available
  if (amqpStatus) {
    healthResponse.amqp = amqpStatus;
  }
  
  return healthResponse;
}

/**
 * Main server startup
 */
async function startServer() {
  try {
    log('info', 'MCP Open Discovery Server v2.0 starting...');
    
    // Detect environment
    const environment = detectEnvironment();
    log('info', 'Environment detected', {
      isContainer: environment.isContainer,
      isInteractive: environment.isInteractive,
      transportMode: environment.transportMode
    });

    // Parse transport modes using the transport manager
    const transportModes = parseTransportMode(CONFIG.TRANSPORT_MODE);
    log('info', `Starting server with transport modes: ${transportModes.join(', ')}`, {
      originalValue: CONFIG.TRANSPORT_MODE,
      envValue: process.env.TRANSPORT_MODE,
      parsedModes: transportModes,
      environment: environment,
      architecture: 'transport-manager-v2.0'
    });

    // Create singleton MCP server
    const mcpServer = await createMcpServer();
    log('info', 'Singleton MCP server created and ready for all transports');

    // Create transport configuration
    const transportConfig = createTransportConfig(environment, {
      HTTP_PORT: CONFIG.HTTP_PORT,
      OAUTH_ENABLED: CONFIG.OAUTH_ENABLED,
      OAUTH_PROTECTED_ENDPOINTS: CONFIG.OAUTH_PROTECTED_ENDPOINTS,
      OAUTH_REALM: CONFIG.OAUTH_REALM,
      AMQP_URL: CONFIG.AMQP_URL,
      AMQP_QUEUE_PREFIX: CONFIG.AMQP_QUEUE_PREFIX,
      AMQP_EXCHANGE: CONFIG.AMQP_EXCHANGE,
      GRPC_PORT: CONFIG.GRPC_PORT,
      GRPC_MAX_CONNECTIONS: CONFIG.GRPC_MAX_CONNECTIONS,
      GRPC_KEEPALIVE_TIME: CONFIG.GRPC_KEEPALIVE_TIME,
      getHealthData: getHealthData,
      protectedResourceMetadataHandler: protectedResourceMetadataHandler,
      oauthMiddleware: oauthMiddleware,
      logFunction: log
    });

    // Start all transports using the transport manager
    const transportResults = await startAllTransports(mcpServer, transportModes, transportConfig);

    // Report startup status
    if (transportResults.successful > 0) {
      const successfulTransports = Object.keys(transportResults.transports).filter(
        name => transportResults.transports[name].success
      );
      log('info', `Successfully started transports: ${successfulTransports.join(', ')}`);
    }
    
    if (transportResults.errors && transportResults.errors.length > 0) {
      log('warn', `Failed to start transports: ${transportResults.errors.map(e => `${e.transport} (${e.error})`).join(', ')}`);
    }
    
    if (transportResults.successful === 0) {
      throw new Error('No transports could be started');
    }

    log('info', 'MCP Server started successfully', {
      activeTransports: transportResults.successful,
      failedTransports: transportResults.errors.length > 0 ? transportResults.errors : 'none',
      mode: transportModes.join(', '),
      degradedOperation: transportResults.errors.length > 0
    });
    
    // Log warnings for failed transports
    if (transportResults.errors.length > 0) {
      log('warn', 'Server running in degraded mode - some transports failed', {
        failedCount: transportResults.errors.length,
        details: transportResults.errors
      });
    }

    // Graceful shutdown handler
    const gracefulShutdown = async (signal) => {
      log('info', `Received ${signal}, shutting down gracefully...`);
      
      try {
        // Use transport manager for clean shutdown
        await cleanupAllTransports(transportResults);
        
        // Clean up dynamic registry resources
        try {
          cleanup && cleanup();
        } catch (error) {
          log('warn', 'Error during registry cleanup', { error: error.message });
        }
        
        log('info', 'Graceful shutdown complete');
        process.exit(0);
      } catch (error) {
        log('error', 'Error during graceful shutdown', error);
        process.exit(1);
      }
    };

    process.on('SIGINT', gracefulShutdown);
    process.on('SIGTERM', gracefulShutdown);

  } catch (error) {
    log('error', 'Server startup failed', {
      message: error.message,
      stack: error.stack
    });
    process.exit(1);
  }
}

/**
 * Error handling
 */
process.on('uncaughtException', (error) => {
  log('error', 'Uncaught exception', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[UNHANDLED REJECTION]', JSON.stringify(reason, null, 2));
  if (reason && reason.stack) {
    console.error(reason.stack);
  }
  process.exit(1);
});

// Start server if run directly
if (require.main === module) {
  startServer().catch((error) => {
    log('error', 'Server startup failed', error);
    process.exit(1);
  });
}

module.exports = { 
  startServer, 
  createMcpServer,
  CONFIG, 
  log 
};
