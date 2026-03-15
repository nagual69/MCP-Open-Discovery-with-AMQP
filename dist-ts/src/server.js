"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createAppConfig = createAppConfig;
exports.createMcpServer = createMcpServer;
exports.startServer = startServer;
exports.stopServer = stopServer;
exports.installProcessHandlers = installProcessHandlers;
exports.runServerAsMain = runServerAsMain;
exports.getServerInstance = getServerInstance;
exports.getManagedTransports = getManagedTransports;
const mcp_js_1 = require("@modelcontextprotocol/sdk/server/mcp.js");
const types_js_1 = require("@modelcontextprotocol/sdk/types.js");
const plugin_registry_1 = require("./plugins/plugin-registry");
const logging_1 = require("./runtime/logging");
const oauth_1 = require("./runtime/oauth");
const transport_state_1 = require("./runtime/transport-state");
const transports_1 = require("./transports");
const utils_1 = require("./utils");
let serverInstance = null;
let managedTransports = null;
let serverInitialization = null;
let processHandlersInstalled = false;
const logger = (0, utils_1.createLogger)('SERVER');
function detectDefaultTransportModes() {
    const environmentValue = process.env.TRANSPORT_MODE;
    if (environmentValue) {
        return environmentValue
            .split(',')
            .map((entry) => entry.trim().toLowerCase())
            .filter((entry) => entry === 'stdio' || entry === 'http' || entry === 'amqp');
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
function serverLog(level, message, context) {
    if (level === 'error') {
        logger.error(message, context);
        void (0, logging_1.logAndNotify)('error', message, context);
        return;
    }
    if (level === 'warn') {
        logger.warn(message, context);
        void (0, logging_1.logAndNotify)('warning', message, context);
        return;
    }
    if (level === 'debug') {
        logger.debug(message, context);
        void (0, logging_1.logAndNotify)('debug', message, context);
        return;
    }
    logger.info(message, context);
    void (0, logging_1.logAndNotify)('info', message, context);
}
function createAppConfig() {
    const port = Number.parseInt(process.env.HTTP_PORT || process.env.PORT || '3000', 10);
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
async function createMcpServer() {
    if (serverInstance) {
        return serverInstance;
    }
    if (serverInitialization) {
        return serverInitialization;
    }
    serverInitialization = (async () => {
        const server = new mcp_js_1.McpServer({
            name: 'mcp-open-discovery',
            version: '2.0.0',
            description: 'Network discovery tools via Model Context Protocol',
        }, {
            capabilities: {
                tools: { listChanged: true },
                resources: { listChanged: true },
                prompts: { listChanged: true },
                logging: {},
            },
        });
        server.server.setRequestHandler(types_js_1.SetLevelRequestSchema, (0, logging_1.createSetLevelHandler)());
        await (0, plugin_registry_1.initialize)(server);
        await (0, plugin_registry_1.bootstrapBuiltinPlugins)();
        serverInstance = server;
        return server;
    })();
    try {
        return await serverInitialization;
    }
    catch (error) {
        serverInitialization = null;
        throw error;
    }
}
async function startServer(config = createAppConfig()) {
    serverLog('info', 'Starting typed MCP Open Discovery runtime', {
        transportModes: config.transportModes,
        oauthEnabled: config.oauth.enabled,
        amqpEnabled: config.amqp.enabled,
    });
    const server = await createMcpServer();
    const started = await (0, transports_1.startConfiguredTransports)(server, config, {
        oauthMiddleware: (0, oauth_1.createOauthMiddlewareFactory)(config.oauth),
        protectedResourceMetadataHandler: (0, oauth_1.createProtectedResourceMetadataHandler)(config.oauth),
    });
    managedTransports = started.managed;
    if (!started.results.transports.some((result) => result.started)) {
        throw new Error('No transports could be started');
    }
    return {
        server,
        stats: (0, plugin_registry_1.getStats)(),
    };
}
async function stopServer() {
    if (!managedTransports) {
        (0, transport_state_1.clearManagedTransports)();
        return;
    }
    await (0, transports_1.stopConfiguredTransports)(managedTransports);
    managedTransports = null;
}
function installProcessHandlers() {
    if (processHandlersInstalled) {
        return;
    }
    processHandlersInstalled = true;
    const shutdown = async (signal, exitCode = 0) => {
        try {
            serverLog('info', 'Received shutdown signal', { signal });
            await stopServer();
            process.exit(exitCode);
        }
        catch (error) {
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
async function runServerAsMain(config = createAppConfig()) {
    installProcessHandlers();
    const { stats } = await startServer(config);
    serverLog('info', 'Typed MCP Open Discovery runtime started', {
        transportModes: config.transportModes,
        registry: stats,
    });
}
function getServerInstance() {
    return serverInstance;
}
function getManagedTransports() {
    return managedTransports;
}
//# sourceMappingURL=server.js.map