"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startStreamableHttpTransport = startStreamableHttpTransport;
exports.stopStreamableHttpTransport = stopStreamableHttpTransport;
const streamableHttp_js_1 = require("@modelcontextprotocol/sdk/server/streamableHttp.js");
const express_1 = __importDefault(require("express"));
const node_crypto_1 = require("node:crypto");
function log(level, message, data) {
    const rendered = data === undefined ? '' : ` ${JSON.stringify(data)}`;
    const line = `[${new Date().toISOString()}] [${level.toUpperCase()}] [HTTP] ${message}${rendered}`;
    if (level === 'error') {
        console.error(line);
        return;
    }
    if (level === 'warn') {
        console.warn(line);
        return;
    }
    console.log(line);
}
function defaultHealthResponse() {
    const emptyRegistry = {
        totalPlugins: 0,
        activePlugins: 0,
        activeTools: 0,
        activeResources: 0,
        activePrompts: 0,
    };
    return {
        status: 'healthy',
        version: '2.0.0',
        registry: emptyRegistry,
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
        oauth: {
            enabled: false,
            realm: 'mcp-open-discovery',
            protectedEndpoints: ['/mcp'],
        },
    };
}
function setupCors(app) {
    app.use(express_1.default.json({ limit: '10mb' }));
    app.use((request, response, next) => {
        response.header('Access-Control-Allow-Origin', '*');
        response.header('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
        response.header('Access-Control-Allow-Headers', 'Content-Type, mcp-session-id, last-event-id, Authorization');
        if (request.method === 'OPTIONS') {
            response.sendStatus(200);
            return;
        }
        next();
    });
}
async function createSessionTransport(server, sessions, persistSession = true) {
    const transport = new streamableHttp_js_1.StreamableHTTPServerTransport({
        sessionIdGenerator: () => (0, node_crypto_1.randomUUID)(),
        onsessioninitialized: (sessionId) => {
            if (persistSession) {
                sessions[sessionId] = transport;
            }
        },
    });
    transport.onclose = () => {
        if (persistSession && transport.sessionId && sessions[transport.sessionId]) {
            delete sessions[transport.sessionId];
        }
    };
    await server.connect(transport);
    return transport;
}
function createMockResponse() {
    const mock = {
        headersSent: false,
        locals: {},
        setHeader() {
            return this;
        },
        getHeader() {
            return undefined;
        },
        status() {
            return this;
        },
        json() {
            return this;
        },
        send() {
            return this;
        },
        end() {
            return this;
        },
        write() {
            return true;
        },
        writeHead() {
            return this;
        },
        on() {
            return this;
        },
        once() {
            return this;
        },
        emit() {
            return true;
        },
        removeListener() {
            return this;
        },
        flushHeaders() {
            return this;
        },
    };
    return mock;
}
async function handlePostRequest(request, response, server, sessions) {
    const sessionIdHeader = request.headers['mcp-session-id'];
    const sessionId = Array.isArray(sessionIdHeader) ? sessionIdHeader[0] : sessionIdHeader;
    const existingTransport = sessionId ? sessions[sessionId] : undefined;
    const requestBody = request.body;
    if (existingTransport) {
        await existingTransport.handleRequest(request, response, requestBody);
        return;
    }
    if (!sessionId && requestBody?.method === 'initialize') {
        const transport = await createSessionTransport(server, sessions, true);
        await transport.handleRequest(request, response, requestBody);
        return;
    }
    if (requestBody?.jsonrpc === '2.0') {
        const transport = await createSessionTransport(server, sessions, false);
        if (requestBody.method !== 'initialize') {
            const initializeRequest = {
                method: 'POST',
                headers: {
                    ...request.headers,
                    accept: 'application/json, text/event-stream',
                },
                body: {
                    jsonrpc: '2.0',
                    id: `auto-init-${Date.now()}`,
                    method: 'initialize',
                    params: {
                        protocolVersion: '2024-11-05',
                        capabilities: {},
                        clientInfo: {
                            name: 'stateless-client',
                            version: '1.0.0',
                        },
                    },
                },
            };
            await transport.handleRequest(initializeRequest, createMockResponse(), initializeRequest.body);
        }
        const actualRequest = {
            ...request,
            headers: {
                ...request.headers,
                accept: 'application/json, text/event-stream',
                'mcp-session-id': transport.sessionId,
            },
        };
        await transport.handleRequest(actualRequest, response, requestBody);
        return;
    }
    response.status(400).json({
        jsonrpc: '2.0',
        error: {
            code: -32000,
            message: 'Bad Request: No valid session ID provided or invalid request',
        },
        id: requestBody?.id ?? null,
    });
}
function setupRoutes(app, server, sessions, config, options) {
    app.get(config.healthPath, (_request, response) => {
        response.json(options.getHealthResponse?.() ?? defaultHealthResponse());
    });
    app.get('/', (_request, response) => {
        response.json({
            service: 'MCP Open Discovery Server',
            version: '2.0.0',
            endpoints: {
                health: config.healthPath,
                mcp: config.mcpPath,
            },
            oauth: {
                enabled: config.oauthEnabled,
                oauth_metadata: config.oauthEnabled ? '/.well-known/oauth-protected-resource' : undefined,
                authorizationServer: options.authorizationServer ?? null,
            },
        });
    });
    if (options.protectedResourceMetadataHandler) {
        app.get('/.well-known/oauth-protected-resource', options.protectedResourceMetadataHandler);
        app.get('/oauth-metadata', options.protectedResourceMetadataHandler);
    }
    app.get('/.well-known/oauth-authorization-server', (_request, response) => {
        if (!options.authorizationServer) {
            response.status(404).json({
                error: 'not_found',
                error_description: 'Authorization server not configured',
            });
            return;
        }
        response.redirect(302, `${options.authorizationServer}/.well-known/oauth-authorization-server`);
    });
    if (config.oauthEnabled && options.oauthMiddleware) {
        app.use(config.mcpPath, options.oauthMiddleware({ requiredScope: 'mcp:read', skipPaths: [] }));
    }
    app.post(config.mcpPath, async (request, response) => {
        try {
            await handlePostRequest(request, response, server, sessions);
        }
        catch (error) {
            log('error', 'Failed to handle HTTP MCP request', {
                error: error instanceof Error ? error.message : 'Unknown error',
            });
            if (!response.headersSent) {
                response.status(500).json({
                    jsonrpc: '2.0',
                    error: { code: -32603, message: 'Internal server error' },
                    id: request.body?.id ?? null,
                });
            }
        }
    });
    app.get(config.mcpPath, async (request, response) => {
        const sessionIdHeader = request.headers['mcp-session-id'];
        const sessionId = Array.isArray(sessionIdHeader) ? sessionIdHeader[0] : sessionIdHeader;
        if (!sessionId || !sessions[sessionId]) {
            response.status(400).send('Invalid or missing session ID');
            return;
        }
        await sessions[sessionId].handleRequest(request, response);
    });
    app.delete(config.mcpPath, async (request, response) => {
        const sessionIdHeader = request.headers['mcp-session-id'];
        const sessionId = Array.isArray(sessionIdHeader) ? sessionIdHeader[0] : sessionIdHeader;
        if (!sessionId || !sessions[sessionId]) {
            response.status(400).send('Invalid or missing session ID');
            return;
        }
        await sessions[sessionId].handleRequest(request, response);
    });
}
async function startStreamableHttpTransport(server, config, options = {}) {
    const app = (0, express_1.default)();
    const sessions = {};
    setupCors(app);
    setupRoutes(app, server, sessions, config, options);
    const runtime = await new Promise((resolve, reject) => {
        const httpServer = app.listen(config.port, config.host, () => {
            log('info', 'HTTP transport listening', { host: config.host, port: config.port });
            resolve({ app, server: httpServer, sessions });
        });
        httpServer.on('error', reject);
    });
    return {
        result: {
            mode: 'http',
            started: true,
            details: `HTTP transport listening on ${config.host}:${config.port}`,
        },
        runtime,
    };
}
async function stopStreamableHttpTransport(runtime) {
    await new Promise((resolve, reject) => {
        runtime.server.close((error) => {
            if (error) {
                reject(error);
                return;
            }
            resolve();
        });
    });
}
//# sourceMappingURL=streamable-http-transport.js.map