"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.determineEnabledTransports = determineEnabledTransports;
exports.startConfiguredTransports = startConfiguredTransports;
exports.stopConfiguredTransports = stopConfiguredTransports;
exports.getTransportStatus = getTransportStatus;
const stdio_js_1 = require("@modelcontextprotocol/sdk/server/stdio.js");
const transport_state_1 = require("../../runtime/transport-state");
const utils_1 = require("../../utils");
const plugin_registry_1 = require("../../plugins/plugin-registry");
const amqp_transport_1 = require("../amqp/amqp-transport");
const amqp_server_transport_1 = require("../amqp/amqp-server-transport");
const streamable_http_transport_1 = require("./streamable-http-transport");
const logger = (0, utils_1.createLogger)('TRANSPORT_MANAGER');
function detectEnvironment() {
    const isContainer = Boolean(process.env.DOCKER_CONTAINER || process.env.KUBERNETES_SERVICE_HOST || process.env.container);
    const isInteractive = Boolean(process.stdin.isTTY && process.stdout.isTTY);
    return {
        isContainer,
        isInteractive,
        nodeEnv: process.env.NODE_ENV || 'development',
        transportMode: process.env.TRANSPORT_MODE,
    };
}
function determineEnabledTransports(config, environment = detectEnvironment()) {
    if (config.transportModes.length > 0) {
        return config.transportModes;
    }
    if (environment.transportMode) {
        return environment.transportMode
            .split(',')
            .map((entry) => entry.trim().toLowerCase())
            .filter((entry) => entry === 'stdio' || entry === 'http' || entry === 'amqp');
    }
    if (environment.isContainer) {
        return ['http', 'amqp'];
    }
    if (environment.isInteractive) {
        return ['stdio'];
    }
    return ['stdio', 'http'];
}
function buildHealthResponse(config, amqpStatus) {
    return {
        status: 'healthy',
        version: '2.0.0',
        registry: (0, plugin_registry_1.getStats)(),
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
        oauth: config.oauth,
        amqp: amqpStatus,
    };
}
function createHttpConfig(config) {
    return {
        enabled: true,
        mode: 'http',
        host: config.host,
        port: config.port,
        healthPath: '/health',
        mcpPath: '/mcp',
        oauthEnabled: config.oauth.enabled,
    };
}
function createAmqpConfig(config) {
    return {
        enabled: config.amqp.enabled,
        mode: 'amqp',
        url: config.amqp.url,
        exchange: config.amqp.exchange,
        queuePrefix: config.amqp.queuePrefix,
        prefetch: config.amqp.prefetch,
        reconnectDelay: config.amqp.reconnectDelay,
        maxReconnectAttempts: config.amqp.maxReconnectAttempts,
        messageTTL: config.amqp.messageTTL,
        queueTTL: config.amqp.queueTTL,
        autoRecoveryEnabled: config.amqp.autoRecoveryEnabled,
        recoveryRetryInterval: config.amqp.recoveryRetryInterval,
        recoveryMaxRetries: config.amqp.recoveryMaxRetries,
        recoveryBackoffMultiplier: config.amqp.recoveryBackoffMultiplier,
        recoveryMaxRetryInterval: config.amqp.recoveryMaxRetryInterval,
    };
}
async function startConfiguredTransports(server, config, options = {}) {
    const enabled = determineEnabledTransports(config);
    const results = [];
    const managed = {
        amqpRuntime: options.amqpRuntime ?? new amqp_server_transport_1.NativeAmqpRuntimeAdapter(),
        startedModes: [],
    };
    for (const mode of enabled) {
        if (mode === 'stdio') {
            const transport = new stdio_js_1.StdioServerTransport();
            await server.connect(transport);
            managed.stdioTransport = transport;
            results.push({ mode: 'stdio', started: true, details: 'Stdio transport connected' });
            managed.startedModes.push('stdio');
            continue;
        }
        if (mode === 'http') {
            const http = await (0, streamable_http_transport_1.startStreamableHttpTransport)(server, createHttpConfig(config), {
                oauthMiddleware: options.oauthMiddleware ?? null,
                protectedResourceMetadataHandler: options.protectedResourceMetadataHandler ?? null,
                authorizationServer: config.oauth.authorizationServer,
                getHealthResponse: () => buildHealthResponse(config, (0, amqp_transport_1.getAmqpTransportStatus)(managed.amqpRuntime)),
            });
            managed.http = http.runtime;
            results.push(http.result);
            managed.startedModes.push('http');
            continue;
        }
        if (mode === 'amqp') {
            const amqpResult = await (0, amqp_transport_1.startAmqpTransport)(server, createAmqpConfig(config), managed.amqpRuntime);
            results.push(amqpResult);
            if (amqpResult.started) {
                managed.startedModes.push('amqp');
            }
        }
    }
    (0, transport_state_1.setManagedTransports)(managed);
    logger.info('Transport startup complete', {
        enabled,
        started: results.filter((result) => result.started).map((result) => result.mode),
        failed: results.filter((result) => !result.started).map((result) => ({ mode: result.mode, error: result.error })),
    });
    return { results: { transports: results }, managed };
}
async function stopConfiguredTransports(managed) {
    if (managed.http) {
        await (0, streamable_http_transport_1.stopStreamableHttpTransport)(managed.http);
    }
    if (managed.amqpRuntime?.stop) {
        await managed.amqpRuntime.stop();
    }
    (0, transport_state_1.clearManagedTransports)();
}
function getTransportStatus(config, managed = { startedModes: [] }) {
    const environment = detectEnvironment();
    const active = [...new Set(managed.startedModes ?? [])];
    return {
        environment,
        health: buildHealthResponse(config, (0, amqp_transport_1.getAmqpTransportStatus)(managed.amqpRuntime)),
        active,
    };
}
//# sourceMappingURL=transport-manager.js.map