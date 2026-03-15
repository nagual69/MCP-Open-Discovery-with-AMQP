"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createAppConfig = createAppConfig;
exports.createMcpServer = createMcpServer;
exports.startServer = startServer;
exports.getServerInstance = getServerInstance;
exports.getManagedTransports = getManagedTransports;
const mcp_js_1 = require("@modelcontextprotocol/sdk/server/mcp.js");
const types_js_1 = require("@modelcontextprotocol/sdk/types.js");
const plugin_registry_1 = require("./plugins/plugin-registry");
const transports_1 = require("./transports");
let serverInstance = null;
let managedTransports = null;
function createAppConfig() {
    const transportModes = (process.env.TRANSPORT_MODE || '')
        .split(',')
        .map((entry) => entry.trim().toLowerCase())
        .filter((entry) => entry === 'stdio' || entry === 'http' || entry === 'amqp');
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
async function createMcpServer() {
    if (serverInstance) {
        return serverInstance;
    }
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
    server.server.setRequestHandler(types_js_1.SetLevelRequestSchema, async () => ({}));
    await (0, plugin_registry_1.initialize)(server);
    await (0, plugin_registry_1.bootstrapBuiltinPlugins)();
    serverInstance = server;
    return server;
}
async function startServer(config = createAppConfig()) {
    const server = await createMcpServer();
    const started = await (0, transports_1.startConfiguredTransports)(server, config);
    managedTransports = started.managed;
    return {
        server,
        stats: (0, plugin_registry_1.getStats)(),
    };
}
function getServerInstance() {
    return serverInstance;
}
function getManagedTransports() {
    return managedTransports;
}
//# sourceMappingURL=server.js.map