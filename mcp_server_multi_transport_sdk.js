/**
 * MCP Open Discovery Server - Multi-Transport (SDK Compatible)
 * 
 * This is an enhanced server implementation using the official MCP TypeScript SDK
 * that supports both stdio and HTTP transports, making it suitable for both
 * CLI and web-based MCP clients.
 */

const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { StreamableHTTPServerTransport } = require('@modelcontextprotocol/sdk/server/streamableHttp.js');
const express = require('express');
const { randomUUID } = require('node:crypto');
const { registerAllTools, getToolCounts } = require('./tools/sdk_tool_registry');
const { getResourceCounts } = require('./tools/resource_registry');

// Environment configuration with defaults
const CONFIG = {
  MAX_CONNECTIONS: parseInt(process.env.MAX_CONNECTIONS) || 100,
  REQUEST_TIMEOUT: parseInt(process.env.REQUEST_TIMEOUT) || 30000,
  ENABLE_RATE_LIMITING: process.env.ENABLE_RATE_LIMITING !== 'false',
  LOG_LEVEL: process.env.LOG_LEVEL || 'info',
  SECURITY_MODE: process.env.SECURITY_MODE || 'standard',
  HTTP_PORT: parseInt(process.env.HTTP_PORT) || 3000,
  TRANSPORT_MODE: process.env.TRANSPORT_MODE || 'stdio' // 'stdio', 'http', or 'both'
};

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
 * Create and configure the MCP server instance (following official MCP SDK pattern)
 */
function createServer() {
  const server = new McpServer(
    {
      name: 'mcp-open-discovery',
      version: '2.0.0',
      description: 'Networking Discovery tools exposed via Model Context Protocol - SDK Compatible with Multi-Transport Support'
    },
    {
      capabilities: {
        tools: {},
        resources: {},
        logging: {},
        prompts: {}
      }
    }
  );

  // Register all tools using the SDK's built-in registration
  registerAllTools(server);
  // Add request/response logging and security middleware (same pattern as working server)
  const originalHandleRequest = server.handleRequest;
  server.handleRequest = async function(request) {
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
  return server;
}

/**
 * Start the server with stdio transport
 */
async function startStdioServer() {
  const server = createServer();
  const transport = new StdioServerTransport();
  
  await server.connect(transport);
  
  // Log successful startup
  const toolCounts = getToolCounts();
  const resourceCounts = getResourceCounts();
  log('info', 'MCP Open Discovery Server (SDK) started successfully', {
    version: '2.0.0',
    transport: 'stdio',
    tools: toolCounts,
    resources: resourceCounts,
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
  const app = express();
  app.use(express.json({ limit: '10mb' }));
  
  // Map to store transports by session ID
  const transports = {};
  
  // Health check endpoint
  app.get('/health', (req, res) => {
    const toolCounts = getToolCounts();
    const resourceCounts = getResourceCounts();
    res.json({
      status: 'healthy',
      version: '2.0.0',
      transport: 'http',
      tools: toolCounts,
      resources: resourceCounts,
      uptime: process.uptime(),
      timestamp: new Date().toISOString()
    });
  });

  // Root endpoint - provide information about available MCP endpoints
  app.get('/', (req, res) => {
    res.json({
      service: 'MCP Open Discovery Server',
      version: '2.0.0',
      endpoints: {
        health: '/health',
        mcp: '/mcp'
      },
      note: 'Use /mcp endpoint for MCP communication',
      redirect: '/mcp'
    });
  });

  // CORS middleware for web clients
  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, mcp-session-id, last-event-id');
    
    if (req.method === 'OPTIONS') {
      res.sendStatus(200);
      return;
    }
    next();
  });

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

        // Connect the transport to the MCP server
        const server = createServer();
        await server.connect(transport);
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
    const toolCounts = getToolCounts();
    const resourceCounts = getResourceCounts();
    log('info', 'MCP Open Discovery Server (SDK) started successfully', {
      version: '2.0.0',
      transport: 'http',
      port: CONFIG.HTTP_PORT,
      tools: toolCounts,
      resources: resourceCounts,
      config: {
        maxConnections: CONFIG.MAX_CONNECTIONS,
        requestTimeout: CONFIG.REQUEST_TIMEOUT,
        rateLimiting: CONFIG.ENABLE_RATE_LIMITING,
        securityMode: CONFIG.SECURITY_MODE,
        logLevel: CONFIG.LOG_LEVEL
      }
    });
    
    log('info', `HTTP server listening on port ${CONFIG.HTTP_PORT}`);
    log('info', `Health endpoint: http://localhost:${CONFIG.HTTP_PORT}/health`);
    log('info', `MCP endpoint: http://localhost:${CONFIG.HTTP_PORT}/mcp`);
  });

  // Handle server shutdown
  process.on('SIGINT', async () => {
    log('info', 'Shutting down HTTP server...');
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
 */
async function startServer() {
  try {
    const mode = CONFIG.TRANSPORT_MODE.toLowerCase().trim();
    
    log('info', `Starting server with transport mode: "${mode}"`, {
      originalValue: CONFIG.TRANSPORT_MODE,
      envValue: process.env.TRANSPORT_MODE
    });
    
    if (mode === 'stdio' || mode === 'both') {
      await startStdioServer();
    }
    
    if (mode === 'http' || mode === 'both') {
      await startHttpServer();
    }
    
    if (mode !== 'stdio' && mode !== 'http' && mode !== 'both') {
      log('error', `Invalid TRANSPORT_MODE: "${mode}". Use "stdio", "http", or "both"`);
      process.exit(1);
    }
    
  } catch (error) {
    log('error', 'Failed to start server', {
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
  log('error', 'Unhandled promise rejection', { reason, promise });
  process.exit(1);
});

// Start the server if this file is run directly
if (require.main === module) {
  startServer().catch((error) => {
    log('error', 'Server startup failed', error);
    process.exit(1);
  });
}

module.exports = { startServer, startStdioServer, startHttpServer, CONFIG };
