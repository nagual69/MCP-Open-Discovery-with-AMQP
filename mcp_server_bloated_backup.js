/**
 * MCP Open Discovery Server - Multi-Transport (SDK Compatible)
 * 
 * This is an enhanced server implementation using the official MCP TypeScript SDK
 * that supports multiple transports (stdio, HTTP, AMQP) through a componentized
 * transport architecture, making it suitable for CLI, web, and distributed clients.
 */

const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { registerAllTools, registerAllResources, getResourceCounts, getRegistry, getHotReloadManager, getValidationManager, cleanup } = require('./tools/registry/index');
const { registerAllPrompts, getPromptCounts } = require('./tools/prompts_sdk');

// Componentized transport system - NEW TRANSPORT MANAGER v2.0
const { 
  startAllTransports, 
  getAllTransportStatus, 
  cleanupAllTransports,
  detectEnvironment,
  getTransportRecommendations,
  parseTransportMode
} = require('./tools/transports/core/transport-manager');

// Environment configuration with defaults
const CONFIG = {
  MAX_CONNECTIONS: parseInt(process.env.MAX_CONNECTIONS) || 100,
  REQUEST_TIMEOUT: parseInt(process.env.REQUEST_TIMEOUT) || 30000,
  ENABLE_RATE_LIMITING: process.env.ENABLE_RATE_LIMITING !== 'false',
  LOG_LEVEL: process.env.LOG_LEVEL || 'info',
  SECURITY_MODE: process.env.SECURITY_MODE || 'standard',
  HTTP_PORT: parseInt(process.env.HTTP_PORT) || 3000,
  // Smart default: HTTP + AMQP in containers, stdio otherwise
  // Supported modes: stdio, http, amqp, grpc (future)
  TRANSPORT_MODE: process.env.TRANSPORT_MODE || (isRunningInContainer() ? 'http,amqp' : 'stdio'),
  // OAuth 2.1 configuration
  OAUTH_ENABLED: process.env.OAUTH_ENABLED === 'true' || false,
  OAUTH_PROTECTED_ENDPOINTS: (process.env.OAUTH_PROTECTED_ENDPOINTS || '/mcp').split(',').map(p => p.trim()),
  // 🔥 Dynamic Registry Configuration
  ENABLE_DYNAMIC_REGISTRY: process.env.ENABLE_DYNAMIC_REGISTRY === 'true' || false,
  DYNAMIC_REGISTRY_DB: process.env.DYNAMIC_REGISTRY_DB || './data/dynamic_registry.db',
  // AMQP Transport Configuration
  AMQP_ENABLED: process.env.AMQP_ENABLED !== 'false', // Enabled by default
  AMQP_URL: process.env.AMQP_URL || 'amqp://mcp:discovery@localhost:5672',
  AMQP_QUEUE_PREFIX: process.env.AMQP_QUEUE_PREFIX || 'mcp.discovery',
  AMQP_EXCHANGE: process.env.AMQP_EXCHANGE || 'mcp.notifications',
  // gRPC Transport Configuration (future implementation)
  GRPC_ENABLED: process.env.GRPC_ENABLED !== 'false', // Enabled by default
  GRPC_PORT: parseInt(process.env.GRPC_PORT) || 50051,
  GRPC_MAX_CONNECTIONS: parseInt(process.env.GRPC_MAX_CONNECTIONS) || 1000,
  GRPC_KEEPALIVE_TIME: parseInt(process.env.GRPC_KEEPALIVE_TIME) || 30000
};

/**
 * Detect if we're running inside a Docker container
 */
function isRunningInContainer() {
  try {
    return require('fs').existsSync('/.dockerenv') || 
           require('fs').readFileSync('/proc/1/cgroup', 'utf8').includes('docker');
  } catch {
    return false;
  }
}

/**
 * Enhanced logging with different levels
 */
function log(level, message, data = null) {
  const timestamp = new Date().toISOString();
  const logLevels = { error: 0, warn: 1, info: 2, debug: 3 };
  const currentLevel = logLevels[CONFIG.LOG_LEVEL] || 2;
  
  if (logLevels[level] <= currentLevel) {
    const logMessage = `[${timestamp}] [${level.toUpperCase()}] ${message}`;
    
    if (level === 'error') {
      console.error(logMessage, data ? JSON.stringify(data, null, 2) : '');
    } else {
      console.log(logMessage, data ? JSON.stringify(data, null, 2) : '');
    }
  }
}

/**
 * Input sanitization for security
 */
function sanitizeInput(input) {
  if (typeof input === 'string') {
    // Remove potentially dangerous characters and limit length
    return input
      .replace(/[<>'"&]/g, '') // Remove HTML/script characters
      .replace(/\.\./g, '')     // Remove path traversal attempts
      .slice(0, 1000);          // Limit string length
  } else if (typeof input === 'object' && input !== null) {
    const sanitized = {};
    for (const [key, value] of Object.entries(input)) {
      sanitized[sanitizeInput(key)] = sanitizeInput(value);
    }
    return sanitized;
  } else if (Array.isArray(input)) {
    return input.map(item => sanitizeInput(item));
  }
  return input;
}

/**
 * Rate limiting implementation
 */
class RateLimiter {
  constructor(maxRequests = 100, windowMs = 60000) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
    this.requests = new Map();
  }

  isAllowed(identifier) {
    if (!CONFIG.ENABLE_RATE_LIMITING) return true;

    const now = Date.now();
    const windowStart = now - this.windowMs;
    
    if (!this.requests.has(identifier)) {
      this.requests.set(identifier, []);
    }
    
    const userRequests = this.requests.get(identifier);
    // Remove old requests outside the window
    const recentRequests = userRequests.filter(time => time > windowStart);
    this.requests.set(identifier, recentRequests);
    
    if (recentRequests.length >= this.maxRequests) {
      return false;
    }
    
    recentRequests.push(now);
    return true;
  }
}

const rateLimiter = new RateLimiter();

/**
 * SINGLETON SERVER PATTERN (Architecture Fix)
 * 
 * This ensures only ONE server instance exists across all transports,
 * eliminating the root cause of duplicate tool registration.
 */
let globalMcpServer = null;
let serverInitialized = false;

/**
 * Create and configure the SINGLETON MCP server instance
 * 
 * This replaces the old pattern of creating multiple server instances.
 * All transports (stdio, HTTP, AMQP) will share this single instance.
 */
async function createServer() {
  // Validated - Function ID#1003 - SINGLETON SERVER CREATION (CRITICAL)
  // Return existing instance if already created (SINGLETON PATTERN)
  if (globalMcpServer && serverInitialized) {
    log('debug', '[SINGLETON] Returning existing MCP server instance');
    return globalMcpServer;
  }

  // Prevent concurrent initialization
  if (globalMcpServer && !serverInitialized) {
    log('debug', '[SINGLETON] Server initialization in progress, waiting...');
    // Wait for initialization to complete
    while (!serverInitialized) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    return globalMcpServer;
  }

  log('info', '[SINGLETON] Creating new MCP server instance (ONE-TIME ONLY)');
  
  globalMcpServer = new McpServer(
    {
      name: 'mcp-open-discovery',
      version: '2.0.0',
      description: 'Networking Discovery tools exposed via Model Context Protocol - SDK Compatible with Multi-Transport Support'
    },
    {
      capabilities: {
        tools: {},
        resources: {},
        prompts: {}
      }
    }
  );

  log('info', '[SINGLETON] Starting tool registration (ONE-TIME ONLY)');
  try {
    // Pass dynamic registry configuration
    await registerAllTools(globalMcpServer, {
      enableDynamicRegistry: CONFIG.ENABLE_DYNAMIC_REGISTRY,
      dynamicDbPath: CONFIG.DYNAMIC_REGISTRY_DB,
      ciMemory: {} // Default memory configuration
    });
    
    if (CONFIG.ENABLE_DYNAMIC_REGISTRY) {
      log('info', '[SINGLETON] 🔥 Dynamic registry enabled with hot-reload capabilities');
    }
    log('info', '[SINGLETON] Tool registration complete');
  } catch (err) {
    console.error('[FATAL] Tool registration failed:', JSON.stringify(err, null, 2));
    if (err && err.stack) console.error(err.stack);
    process.exit(1);
  }

  log('info', '[SINGLETON] Starting resource registration');
  try {
    await registerAllResources(globalMcpServer);
    log('info', '[SINGLETON] Resource registration complete');
  } catch (err) {
    console.error('[FATAL] Resource registration failed:', JSON.stringify(err, null, 2));
    if (err && err.stack) console.error(err.stack);
    process.exit(1);
  }

  log('info', '[SINGLETON] Starting prompt registration');
  try {
    // If registerAllPrompts is async, await it
    const maybePromise = registerAllPrompts(globalMcpServer);
    if (maybePromise && typeof maybePromise.then === 'function') {
      await maybePromise;
    }
    log('info', '[SINGLETON] Prompt registration complete');
  } catch (err) {
    console.error('[FATAL] Prompt registration failed:', JSON.stringify(err, null, 2));
    if (err && err.stack) console.error(err.stack);
    process.exit(1);
  }

  serverInitialized = true;
    log('info', '[SINGLETON] ✅ MCP server instance ready for all transports');

  return globalMcpServer;

  // Debug: Check what methods are available on the server instance
  log('debug', '[DEBUG] Available methods on globalMcpServer:', {
    methods: Object.getOwnPropertyNames(globalMcpServer).filter(name => typeof globalMcpServer[name] === 'function'),
    hasHandleRequest: typeof globalMcpServer.handleRequest === 'function',
    hasRequestHandler: typeof globalMcpServer.requestHandler === 'function',
    hasHandle: typeof globalMcpServer.handle === 'function'
  });

  // Add request/response logging and security middleware (same pattern as working server)
  const originalHandleRequest = globalMcpServer.handleRequest;
  log('debug', '[DEBUG] Original handleRequest method:', { 
    exists: !!originalHandleRequest, 
    type: typeof originalHandleRequest 
  });
  
  globalMcpServer.handleRequest = async function(request) {
    const startTime = Date.now();
    const requestId = Math.random().toString(36).substring(2, 15);
    const identifier = requestId; // Use request ID as identifier for rate limiting
    
    try {
      // Rate limiting check
      if (!rateLimiter.isAllowed(identifier)) {
        log('warn', 'Rate limit exceeded', { identifier, method: request.method });
        throw new Error('Rate limit exceeded. Please slow down your requests.');
      }

      log('debug', `Request ${requestId}: ${request.method}`, {
        params: CONFIG.LOG_LEVEL === 'debug' ? request.params : undefined
      });
      
      // Sanitize input for security (if strict mode)
      if (request.params && CONFIG.SECURITY_MODE === 'strict') {
        request.params = sanitizeInput(request.params);
      }
      
      // Call original handler with timeout
      const result = await Promise.race([
        originalHandleRequest.call(this, request),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Request timeout')), CONFIG.REQUEST_TIMEOUT)
        )
      ]);

      // CRITICAL FIX: Sanitize tools/list response schemas to fix keyValidator._parse error
      if (request.method === 'tools/list' && result && result.tools && Array.isArray(result.tools)) {
        log('debug', `🔧 Sanitizing ${result.tools.length} tool schemas in tools/list response`);
        
        result.tools = result.tools.map(tool => {
          if (tool.inputSchema) {
            const originalSchema = tool.inputSchema;
            
            // Create sanitized copy
            const sanitizedSchema = { ...originalSchema };
            
            // Remove problematic properties that break MCP SDK validation
            delete sanitizedSchema.$schema;
            delete sanitizedSchema.$defs;
            delete sanitizedSchema.definitions;
            
            // Fix additionalProperties for MCP compatibility
            if (sanitizedSchema.additionalProperties === false) {
              sanitizedSchema.additionalProperties = true;
            }
            
            log('debug', `✅ Sanitized schema for tool: ${tool.name}`, {
              before: {
                hasSchema: '$schema' in originalSchema,
                additionalProperties: originalSchema.additionalProperties,
                hasDefs: '$defs' in originalSchema || 'definitions' in originalSchema
              },
              after: {
                hasSchema: '$schema' in sanitizedSchema,
                additionalProperties: sanitizedSchema.additionalProperties,
                hasDefs: '$defs' in sanitizedSchema || 'definitions' in sanitizedSchema
              }
            });
            
            return { ...tool, inputSchema: sanitizedSchema };
          }
          return tool;
        });
        
        log('info', `🎯 SCHEMA FIX: Sanitized ${result.tools.length} tool schemas in tools/list response`);
      }

      const duration = Date.now() - startTime;
      log('debug', `Request ${requestId} completed in ${duration}ms`);

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      log('error', `Request ${requestId} failed after ${duration}ms`, {
        method: request.method,
        error: error.message,
        success: false
      });
      throw error;
    }
  };
  return globalMcpServer;
}

/**
 * Start the server with stdio transport
 */
async function startStdioServer() {
  const server = await createServer(); // Uses singleton pattern
  const transport = new StdioServerTransport();
  
  await server.connect(transport);
  
  // Log successful startup
  const registry = getRegistry();
  const stats = registry ? registry.getStats() : { tools: 0, modules: 0, categories: 0 };
  log('info', 'MCP Open Discovery Server (SDK) started successfully', {
    version: '2.0.0',
    transport: 'stdio',
    registry: stats,
    singleton: true, // Mark as using singleton pattern
    config: {
      maxConnections: CONFIG.MAX_CONNECTIONS,
      requestTimeout: CONFIG.REQUEST_TIMEOUT,
      rateLimiting: CONFIG.ENABLE_RATE_LIMITING,
      securityMode: CONFIG.SECURITY_MODE,
      logLevel: CONFIG.LOG_LEVEL
    }
  });
  
  log('info', 'Server connected and ready (stdio)');
}

/**
 * Start the server with HTTP transport
 */
async function startHttpServer() {
  // Validated - Function ID#1002 - HTTP Server Startup
  log('debug', 'Starting HTTP server setup');
  
  // Import OAuth module here to avoid initialization order issues
  let oauthMiddleware, protectedResourceMetadataHandler, OAUTH_CONFIG;
  try {
    const oauthModule = require('./tools/oauth_middleware_sdk');
    oauthMiddleware = oauthModule.oauthMiddleware;
    protectedResourceMetadataHandler = oauthModule.protectedResourceMetadataHandler;
    OAUTH_CONFIG = oauthModule.OAUTH_CONFIG;
    
    log('debug', 'OAuth module loaded successfully', {
      oauthEnabled: OAUTH_CONFIG.OAUTH_ENABLED,
      realm: OAUTH_CONFIG.REALM
    });
  } catch (error) {
    log('error', 'Failed to load OAuth module', { error: error.message });
    throw error;
  }

  const app = express();
  app.use(express.json({ limit: '10mb' }));
  
  // Use the singleton MCP server instance (NO DUPLICATION)
  const mcpServer = await createServer();
  
  // Map to store transports by session ID
  const transports = {};
  
  // Health check endpoint
  app.get('/health', (req, res) => {
    const registry = getRegistry();
    const stats = registry ? registry.getStats() : { tools: 0, modules: 0, categories: 0 };
    const validationManager = getValidationManager();
    const hotReloadManager = getHotReloadManager();
    
    // Get AMQP status if available
    let amqpStatus = null;
    try {
      // Use the fixed AMQP status
      amqpStatus = getAmqpStatus();
    } catch (error) {
      // AMQP module not available or not loaded
    }
    
    const healthResponse = {
      status: 'healthy',
      version: '2.0.0',
      transport: 'http',
      registry: stats,
      resources: getResourceCounts(),
      validation: validationManager ? validationManager.getValidationSummary() : null,
      hotReload: hotReloadManager ? hotReloadManager.getStatus() : null,
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      oauth: {
        enabled: OAUTH_CONFIG.OAUTH_ENABLED,
        realm: OAUTH_CONFIG.REALM,
        supportedScopes: OAUTH_CONFIG.SUPPORTED_SCOPES
      }
    };
    
    // Add AMQP status if available
    if (amqpStatus) {
      healthResponse.amqp = amqpStatus;
    }
    
    res.json(healthResponse);
  });

  // OAuth 2.1 Protected Resource Metadata endpoint (RFC 9728)
  log('debug', 'Registering OAuth protected resource metadata endpoint', {
    handlerType: typeof protectedResourceMetadataHandler,
    handlerExists: !!protectedResourceMetadataHandler
  });
  
  if (protectedResourceMetadataHandler) {
    const oauthPath = '/.well-known/oauth-protected-resource';
    log('debug', 'Registering OAuth route', { path: oauthPath });
    app.get(oauthPath, protectedResourceMetadataHandler);
    
    // Add a simple test endpoint to debug routing
    app.get('/test-oauth', (req, res) => {
      res.json({ test: 'oauth routing works', timestamp: new Date().toISOString() });
    });
    
    // Alternative route without dots to test
    app.get('/oauth-metadata', protectedResourceMetadataHandler);
  } else {
    log('error', 'protectedResourceMetadataHandler is undefined!');
    // Fallback handler
    app.get('/.well-known/oauth-protected-resource', (req, res) => {
      res.status(500).json({ error: 'OAuth handler not available' });
    });
  }

  // OAuth discovery endpoint (additional convenience endpoint)
  app.get('/.well-known/oauth-authorization-server', (req, res) => {
    if (!OAUTH_CONFIG.AUTHORIZATION_SERVER) {
      return res.status(404).json({
        error: 'not_found',
        error_description: 'Authorization server not configured'
      });
    }
    
    // Redirect to the actual authorization server's discovery endpoint
    res.redirect(302, `${OAUTH_CONFIG.AUTHORIZATION_SERVER}/.well-known/oauth-authorization-server`);
  });
  
  log('debug', 'OAuth endpoints registered successfully');

  // Root endpoint - provide information about available MCP endpoints
  app.get('/', (req, res) => {
    res.json({
      service: 'MCP Open Discovery Server',
      version: '2.0.0',
      endpoints: {
        health: '/health',
        mcp: '/mcp',
        oauth_metadata: '/.well-known/oauth-protected-resource'
      },
      oauth: {
        enabled: OAUTH_CONFIG.OAUTH_ENABLED,
        realm: OAUTH_CONFIG.REALM,
        supportedScopes: OAUTH_CONFIG.SUPPORTED_SCOPES,
        authorizationServer: OAUTH_CONFIG.AUTHORIZATION_SERVER
      },
      note: 'Use /mcp endpoint for MCP communication',
      redirect: '/mcp'
    });
  });

  // CORS middleware for web clients
  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, mcp-session-id, last-event-id, Authorization');
    
    if (req.method === 'OPTIONS') {
      res.sendStatus(200);
      return;
    }
    next();
  });

  // OAuth 2.1 middleware for protected MCP endpoints
  if (OAUTH_CONFIG.OAUTH_ENABLED) {
    log('info', 'OAuth 2.1 authentication enabled', {
      protectedEndpoints: CONFIG.OAUTH_PROTECTED_ENDPOINTS,
      realm: OAUTH_CONFIG.REALM,
      supportedScopes: OAUTH_CONFIG.SUPPORTED_SCOPES
    });
    
    // Apply OAuth middleware to MCP endpoints
    app.use('/mcp', oauthMiddleware({
      requiredScope: 'mcp:read',
      skipPaths: [] // Don't skip any paths under /mcp when OAuth is enabled
    }));
  } else {
    log('info', 'OAuth 2.1 authentication disabled');
  }

  // MCP POST endpoint
  app.post('/mcp', async (req, res) => {
    const clientIp = req.ip || req.connection.remoteAddress || 'unknown';
    log('debug', 'Received MCP request', { 
      method: req.body?.method, 
      ip: clientIp,
      sessionId: req.headers['mcp-session-id']
    });

    try {
      // Check for existing session ID
      const sessionId = req.headers['mcp-session-id'];
      let transport;

      if (sessionId && transports[sessionId]) {
        // Reuse existing transport
        transport = transports[sessionId];
        log('debug', 'Reusing existing transport', { sessionId });
      } else if (!sessionId && req.body?.method === 'initialize') {
        // New initialization request
        log('info', 'Creating new HTTP transport session');
        
        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          onsessioninitialized: (newSessionId) => {
            log('info', `HTTP session initialized`, { sessionId: newSessionId });
            transports[newSessionId] = transport;
          }
        });

        // Set up onclose handler to clean up transport when closed
        transport.onclose = () => {
          const sid = transport.sessionId;
          if (sid && transports[sid]) {
            log('info', `HTTP transport closed`, { sessionId: sid });
            delete transports[sid];
          }
        };

        // Connect the shared MCP server to this transport
        await mcpServer.connect(transport);
        await transport.handleRequest(req, res, req.body);
        return; // Already handled
      } else {
        // Invalid request - no session ID or not initialization request
        res.status(400).json({
          jsonrpc: '2.0',
          error: {
            code: -32000,
            message: 'Bad Request: No valid session ID provided or invalid request',
          },
          id: req.body?.id || null,
        });
        return;
      }

      // Handle the request with existing transport
      // CRITICAL FIX: Add schema sanitization for existing transports too
      if (req.body && req.body.method === 'tools/list') {
        log('debug', '🔧 Intercepting tools/list request for existing transport schema sanitization');
        
        // Capture the original response method
        const originalJson = res.json.bind(res);
        
        // Override res.json to sanitize the response
        res.json = function(data) {
          if (data && data.result && data.result.tools && Array.isArray(data.result.tools)) {
            log('debug', `🔧 Sanitizing ${data.result.tools.length} tool schemas in existing transport tools/list response`);
            
            data.result.tools = data.result.tools.map(tool => {
              if (tool.inputSchema) {
                const originalSchema = tool.inputSchema;
                
                // Create sanitized copy
                const sanitizedSchema = { ...originalSchema };
                
                // Remove problematic properties that break MCP SDK validation
                delete sanitizedSchema.$schema;
                delete sanitizedSchema.$defs;
                delete sanitizedSchema.definitions;
                
                // Fix additionalProperties for MCP compatibility
                if (sanitizedSchema.additionalProperties === false) {
                  sanitizedSchema.additionalProperties = true;
                }
                
                log('debug', `✅ Sanitized schema for tool: ${tool.name}`, {
                  before: {
                    hasSchema: '$schema' in originalSchema,
                    additionalProperties: originalSchema.additionalProperties,
                    hasDefs: '$defs' in originalSchema || 'definitions' in originalSchema
                  },
                  after: {
                    hasSchema: '$schema' in sanitizedSchema,
                    additionalProperties: sanitizedSchema.additionalProperties,
                    hasDefs: '$defs' in sanitizedSchema || 'definitions' in sanitizedSchema
                  }
                });
                
                return { ...tool, inputSchema: sanitizedSchema };
              }
              return tool;
            });
            
            log('info', `🎯 SCHEMA FIX: Sanitized ${data.result.tools.length} tool schemas in existing transport tools/list response`);
          }
          
          // Call original json method with sanitized data
          return originalJson(data);
        };
      }
      
      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      log('error', 'Error handling MCP HTTP request', {
        error: error.message,
        stack: error.stack,
        ip: clientIp
      });
      
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: '2.0',
          error: {
            code: -32603,
            message: 'Internal server error',
          },
          id: req.body?.id || null,
        });
      }
    }
  });

  // Handle GET requests for SSE streams
  app.get('/mcp', async (req, res) => {
    const sessionId = req.headers['mcp-session-id'];
    if (!sessionId || !transports[sessionId]) {
      res.status(400).send('Invalid or missing session ID');
      return;
    }

    const lastEventId = req.headers['last-event-id'];
    if (lastEventId) {
      log('debug', `Client reconnecting with Last-Event-ID: ${lastEventId}`, { sessionId });
    } else {
      log('debug', `Establishing new SSE stream`, { sessionId });
    }

    const transport = transports[sessionId];
    await transport.handleRequest(req, res);
  });

  // Handle DELETE requests for session termination
  app.delete('/mcp', async (req, res) => {
    const sessionId = req.headers['mcp-session-id'];
    if (!sessionId || !transports[sessionId]) {
      res.status(400).send('Invalid or missing session ID');
      return;
    }

    log('info', `Received session termination request`, { sessionId });
    try {
      const transport = transports[sessionId];
      await transport.handleRequest(req, res);
    } catch (error) {
      log('error', 'Error handling session termination', {
        error: error.message,
        sessionId
      });
      if (!res.headersSent) {
        res.status(500).send('Error processing session termination');
      }
    }
  });

  // Start HTTP server
  app.listen(CONFIG.HTTP_PORT, () => {
    const registry = getRegistry();
    const stats = registry ? registry.getStats() : { tools: 0, modules: 0, categories: 0 };
    const resourceCounts = getResourceCounts();
    const promptCounts = getPromptCounts();
    log('info', 'MCP Open Discovery Server (SDK) started successfully', {
      version: '2.0.0',
      transport: 'http',
      port: CONFIG.HTTP_PORT,
      registry: stats,
      resources: resourceCounts,
      prompts: promptCounts,
      config: {
        maxConnections: CONFIG.MAX_CONNECTIONS,
        requestTimeout: CONFIG.REQUEST_TIMEOUT,
        rateLimiting: CONFIG.ENABLE_RATE_LIMITING,
        securityMode: CONFIG.SECURITY_MODE,
        logLevel: CONFIG.LOG_LEVEL,
        oauth: {
          enabled: OAUTH_CONFIG.OAUTH_ENABLED,
          realm: OAUTH_CONFIG.REALM,
          supportedScopes: OAUTH_CONFIG.SUPPORTED_SCOPES,
          authorizationServer: OAUTH_CONFIG.AUTHORIZATION_SERVER
        }
      }
    });
    
    log('info', `HTTP server listening on port ${CONFIG.HTTP_PORT}`);
    log('info', `Health endpoint: http://localhost:${CONFIG.HTTP_PORT}/health`);
    log('info', `MCP endpoint: http://localhost:${CONFIG.HTTP_PORT}/mcp`);
    if (OAUTH_CONFIG.OAUTH_ENABLED) {
      log('info', `OAuth metadata: http://localhost:${CONFIG.HTTP_PORT}/.well-known/oauth-protected-resource`);
    }
  });

  // Handle server shutdown
  process.on('SIGINT', async () => {
    log('info', 'Shutting down HTTP server...');
    
    // Clean up dynamic registry resources
    try {
      cleanup();
    } catch (error) {
      log('warn', 'Error during registry cleanup', { error: error.message });
    }
    
    // Close all active transports to properly clean up resources
    for (const sessionId in transports) {
      try {
        log('debug', `Closing transport`, { sessionId });
        await transports[sessionId].close();
        delete transports[sessionId];
      } catch (error) {
        log('error', `Error closing transport`, { sessionId, error: error.message });
      }
    }
    log('info', 'HTTP server shutdown complete');
    process.exit(0);
  });
}

/**
 * Main server startup function
 * 
 * ARCHITECTURAL DESIGN: Multi-Transport Support (HTTP, AMQP, gRPC)
 * 
 * This function is designed to support multiple transports that all share
 * the same singleton MCP server instance, preventing registration duplication.
 * 
 * Validated - Function ID#1001 - MAIN ENTRY POINT
 */
async function startServer() {
  try {
    // Detect environment and get transport recommendations
    const environment = detectEnvironment();
    log('info', 'Environment detected', environment);
    
    // Parse transport modes using the new transport manager
    const transportModes = parseTransportMode(CONFIG.TRANSPORT_MODE);
    log('info', `Starting server with transport modes: ${transportModes.join(', ')}`, {
      originalValue: CONFIG.TRANSPORT_MODE,
      envValue: process.env.TRANSPORT_MODE,
      parsedModes: transportModes,
      environment: environment,
      architecture: 'transport-manager-v2.0'
    });

    // Create singleton MCP server instance
    const mcpServer = await createServer();
    log('info', 'Singleton MCP server created and ready for all transports');

    // Start all transports using the new transport manager
    const transportResults = await startAllTransports(mcpServer, transportModes, {
      httpPort: CONFIG.HTTP_PORT,
      oauthEnabled: CONFIG.OAUTH_ENABLED,
      oauthProtectedEndpoints: CONFIG.OAUTH_PROTECTED_ENDPOINTS,
      amqpUrl: CONFIG.AMQP_URL,
      amqpQueuePrefix: CONFIG.AMQP_QUEUE_PREFIX,
      amqpExchange: CONFIG.AMQP_EXCHANGE,
      grpcPort: CONFIG.GRPC_PORT,
      grpcMaxConnections: CONFIG.GRPC_MAX_CONNECTIONS,
      grpcKeepaliveTime: CONFIG.GRPC_KEEPALIVE_TIME,
      logFunction: log
    });

    // Report startup status from transport manager
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
    
    // Enhanced graceful shutdown
    const gracefulShutdown = async (signal) => {
      log('info', `Received ${signal}, shutting down gracefully...`);
      
      try {
        // Use transport manager for clean shutdown
        await cleanupAllTransports(transportResults);
        
        log('info', 'Graceful shutdown complete');
        process.exit(0);
      } catch (error) {
        log('error', 'Error during graceful shutdown', {
          error: error.message,
          stack: error.stack
        });
        process.exit(1);
      }
    };
    
    process.on('SIGINT', gracefulShutdown);
    process.on('SIGTERM', gracefulShutdown);
    
  } catch (error) {
    log('error', 'Server startup failed', {
      message: error.message,
      stack: error.stack,
      name: error.name
    });
    process.exit(1);
  }
}

// Enhanced error handling for uncaught exceptions
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

// Start the server if this file is run directly
if (require.main === module) {
  startServer().catch((error) => {
    log('error', 'Server startup failed', error);
    process.exit(1);
  });
}

module.exports = { startServer, startStdioServer, startHttpServer, CONFIG, log };
