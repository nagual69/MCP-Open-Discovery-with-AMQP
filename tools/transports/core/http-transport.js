// SPDX-License-Identifier: MPL-2.0
/**
 * HTTP Transport for MCP Open Discovery Server v2.0
 * 
 * Extracted from main server file to improve modularity and maintainability.
 * This module handles HTTP transport initialization, session management, and Express setup.
 */

const { StreamableHTTPServerTransport } = require('@modelcontextprotocol/sdk/server/streamableHttp.js');
const express = require('express');
const { randomUUID } = require('node:crypto');

/**
 * HTTP Transport Configuration
 */
const HTTP_CONFIG = {
  DEFAULT_PORT: 3000,
  MAX_PAYLOAD_SIZE: '10mb',
  CORS_ORIGINS: '*',
  TRANSPORT_NAME: 'http',
  DESCRIPTION: 'HTTP transport with SSE for web clients'
};

/**
 * Enhanced logging for HTTP transport
 */
function logHttp(level, message, data = null) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] [${level.toUpperCase()}] [HTTP] ${message}`;
  
  if (level === 'error') {
    console.error(logMessage, data ? JSON.stringify(data, null, 2) : '');
  } else {
    console.log(logMessage, data ? JSON.stringify(data, null, 2) : '');
  }
}

/**
 * Create Express application with common middleware
 * @param {Object} options - Configuration options
 * @returns {Object} Express app instance
 */
function createExpressApp(options = {}) {
  const app = express();
  
  // JSON parsing middleware
  app.use(express.json({ limit: options.maxPayloadSize || HTTP_CONFIG.MAX_PAYLOAD_SIZE }));
  
  // CORS middleware for web clients
  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', options.corsOrigins || HTTP_CONFIG.CORS_ORIGINS);
    res.header('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, mcp-session-id, last-event-id, Authorization');
    
    if (req.method === 'OPTIONS') {
      res.sendStatus(200);
      return;
    }
    next();
  });
  
  return app;
}

/**
 * Create health check endpoint
 * @param {Object} app - Express app instance
 * @param {Function} getHealthData - Function to get health data
 */
function setupHealthEndpoint(app, getHealthData) {
  app.get('/health', (req, res) => {
    try {
      const healthData = getHealthData();
      res.json({
        status: 'healthy',
        version: '2.0.0',
        transport: 'http',
        ...healthData,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logHttp('error', 'Health check failed', { error: error.message });
      res.status(500).json({
        status: 'unhealthy',
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  });
}

/**
 * Create root endpoint
 * @param {Object} app - Express app instance
 * @param {Object} oauthConfig - OAuth configuration
 */
function setupRootEndpoint(app, oauthConfig = {}) {
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
        enabled: oauthConfig.enabled || false,
        realm: oauthConfig.realm || 'mcp-open-discovery',
        supportedScopes: oauthConfig.supportedScopes || ['mcp:read', 'mcp:tools', 'mcp:resources'],
        authorizationServer: oauthConfig.authorizationServer || null
      },
      note: 'Use /mcp endpoint for MCP communication',
      redirect: '/mcp'
    });
  });
}

/**
 * Setup OAuth endpoints
 * @param {Object} app - Express app instance
 * @param {Object} oauthHandlers - OAuth handler functions
 * @param {Object} oauthConfig - OAuth configuration
 */
function setupOAuthEndpoints(app, oauthHandlers = {}, oauthConfig = {}) {
  const { protectedResourceMetadataHandler } = oauthHandlers;
  
  if (protectedResourceMetadataHandler) {
    // OAuth 2.1 Protected Resource Metadata endpoint (RFC 9728)
    app.get('/.well-known/oauth-protected-resource', protectedResourceMetadataHandler);
    
    // Alternative route for easier access
    app.get('/oauth-metadata', protectedResourceMetadataHandler);
    
    logHttp('info', 'OAuth endpoints registered');
  }
  
  // OAuth discovery endpoint
  app.get('/.well-known/oauth-authorization-server', (req, res) => {
    if (!oauthConfig.authorizationServer) {
      return res.status(404).json({
        error: 'not_found',
        error_description: 'Authorization server not configured'
      });
    }
    
    // Redirect to the actual authorization server's discovery endpoint
    res.redirect(302, `${oauthConfig.authorizationServer}/.well-known/oauth-authorization-server`);
  });
}

/**
 * Setup MCP endpoints with session management
 * @param {Object} app - Express app instance
 * @param {Object} mcpServer - MCP server instance
 * @param {Object} options - Configuration options
 */
function setupMcpEndpoints(app, mcpServer, options = {}) {
  const transports = {}; // Map to store transports by session ID
  
  // MCP POST endpoint for requests
  app.post('/mcp', async (req, res) => {
    const clientIp = req.ip || req.connection.remoteAddress || 'unknown';
    logHttp('debug', 'Received MCP request', { 
      method: req.body?.method, 
      ip: clientIp,
      sessionId: req.headers['mcp-session-id']
    });

    try {
      const sessionId = req.headers['mcp-session-id'];
      let transport;

      if (sessionId && transports[sessionId]) {
        // Reuse existing transport
        transport = transports[sessionId];
        logHttp('debug', 'Reusing existing transport', { sessionId });
      } else if (!sessionId && req.body?.method === 'initialize') {
        // New initialization request
        logHttp('info', 'Creating new HTTP transport session');
        
        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          onsessioninitialized: (newSessionId) => {
            logHttp('info', `HTTP session initialized`, { sessionId: newSessionId });
            transports[newSessionId] = transport;
          }
        });

        // Set up onclose handler to clean up transport when closed
        transport.onclose = () => {
          const sid = transport.sessionId;
          if (sid && transports[sid]) {
            logHttp('info', `HTTP transport closed`, { sessionId: sid });
            delete transports[sid];
          }
        };

        // Connect the shared MCP server to this transport
        await mcpServer.connect(transport);
        await transport.handleRequest(req, res, req.body);
        return; // Already handled
      } else if (req.body?.jsonrpc === '2.0' && (!sessionId || !transports[sessionId])) {
        // Stateless request OR request with unknown/stale session ID
        // This handles: ServiceNow, simple clients, and clients with cached stale session IDs
        // For backward compatibility: treat unknown session as stateless instead of 404
        const requestMethod = req.body.method;
        logHttp('info', 'Handling stateless MCP request', {
          method: requestMethod,
          staleSessionId: sessionId && !transports[sessionId] ? sessionId : undefined
        });

        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          onsessioninitialized: (sid) => {
            logHttp('debug', `Stateless session initialized`, { sessionId: sid });
          }
        });

        // Connect server to transport
        await mcpServer.connect(transport);

        // For non-initialize requests, we need to auto-initialize first
        // The SDK requires initialize to be called before any other method
        if (requestMethod !== 'initialize') {
          logHttp('debug', 'Auto-initializing for stateless request');

          // Create a mock response to capture the initialize response
          const initRes = {
            headersSent: false,
            setHeader: () => {},
            getHeader: () => null,
            status: function() { return this; },
            json: function() {},
            send: function() {},
            end: function() {},
            write: function() { return true; },
            writeHead: function() {},
            on: function() { return this; },
            once: function() { return this; },
            emit: function() { return this; },
            removeListener: function() { return this; },
            flushHeaders: function() {}
          };

          // Create initialize request
          const initReq = {
            method: 'POST',
            headers: {
              ...req.headers,
              'accept': 'application/json, text/event-stream'
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
                  version: '1.0.0'
                }
              }
            }
          };

          // Send implicit initialize
          await transport.handleRequest(initReq, initRes, initReq.body);
          logHttp('debug', 'Auto-initialization complete');
        }

        // Now handle the actual request - include session ID and proper Accept header
        const actualReq = {
          ...req,
          headers: {
            ...req.headers,
            'accept': 'application/json, text/event-stream',
            'mcp-session-id': transport.sessionId
          }
        };
        await transport.handleRequest(actualReq, res, req.body);

        // Note: We don't store this transport in the map as it's one-off
        return;
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
      logHttp('error', 'Error handling MCP HTTP request', {
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
      logHttp('debug', `Client reconnecting with Last-Event-ID: ${lastEventId}`, { sessionId });
    } else {
      logHttp('debug', `Establishing new SSE stream`, { sessionId });
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

    logHttp('info', `Received session termination request`, { sessionId });
    try {
      const transport = transports[sessionId];
      await transport.handleRequest(req, res);
    } catch (error) {
      logHttp('error', 'Error handling session termination', {
        error: error.message,
        sessionId
      });
      if (!res.headersSent) {
        res.status(500).send('Error processing session termination');
      }
    }
  });
  
  return { transports };
}

/**
 * Start HTTP transport server
 * @param {Object} mcpServer - The MCP server instance
 * @param {Object} options - Configuration options
 * @returns {Promise<Object>} Transport startup result
 */
async function startHttpTransport(mcpServer, options = {}) {
  try {
    logHttp('info', 'Initializing HTTP transport...');
    
    const {
      port = HTTP_CONFIG.DEFAULT_PORT,
      getHealthData = () => ({}),
      oauthConfig = {},
      oauthHandlers = {},
      oauthMiddleware = null
    } = options;
    
    // Create Express app
    const app = createExpressApp(options);
    
    // Setup endpoints
    setupHealthEndpoint(app, getHealthData);
    setupRootEndpoint(app, oauthConfig);
    setupOAuthEndpoints(app, oauthHandlers, oauthConfig);
    
    // Apply OAuth middleware if enabled
    if (oauthConfig.enabled && oauthMiddleware) {
      logHttp('info', 'OAuth 2.1 authentication enabled', {
        realm: oauthConfig.realm,
        supportedScopes: oauthConfig.supportedScopes
      });
      
      app.use('/mcp', oauthMiddleware({
        requiredScope: 'mcp:read',
        skipPaths: []
      }));
    } else {
      logHttp('info', 'OAuth 2.1 authentication disabled');
    }
    
    // Setup MCP endpoints
    const { transports } = setupMcpEndpoints(app, mcpServer, options);
    
    // Start the HTTP server
    const server = app.listen(port, () => {
      logHttp('info', `HTTP server listening on port ${port}`);
      logHttp('info', `Health endpoint: http://localhost:${port}/health`);
      logHttp('info', `MCP endpoint: http://localhost:${port}/mcp`);
    });
    
    return {
      success: true,
      transport: 'http',
      port: port,
      server: server,
      app: app,
      transports: transports,
      timestamp: new Date().toISOString()
    };
    
  } catch (error) {
    logHttp('error', 'Failed to start HTTP transport', {
      error: error.message,
      stack: error.stack
    });
    
    return {
      success: false,
      transport: 'http',
      error: error.message,
      timestamp: new Date().toISOString()
    };
  }
}

/**
 * Get HTTP transport status
 * @param {Object} serverInfo - Server information
 * @returns {Object} Current status information
 */
function getHttpStatus(serverInfo = {}) {
  return {
    transport: 'http',
    available: true,
    description: HTTP_CONFIG.DESCRIPTION,
    port: serverInfo.port || HTTP_CONFIG.DEFAULT_PORT,
    endpoints: {
      health: '/health',
      mcp: '/mcp',
      root: '/'
    },
    requirements: 'HTTP client with JSON-RPC 2.0 support',
    timestamp: new Date().toISOString()
  };
}

/**
 * Cleanup HTTP transport
 * @param {Object} serverInfo - Server information including server instance
 */
async function cleanupHttpTransport(serverInfo = {}) {
  if (serverInfo.server) {
    return new Promise((resolve) => {
      serverInfo.server.close(() => {
        logHttp('info', 'HTTP server closed');
        resolve({ success: true });
      });
    });
  }
  
  logHttp('info', 'HTTP transport cleanup completed');
  return { success: true };
}

module.exports = {
  startHttpTransport,
  getHttpStatus,
  cleanupHttpTransport,
  createExpressApp,
  setupHealthEndpoint,
  setupRootEndpoint,
  setupOAuthEndpoints,
  setupMcpEndpoints,
  HTTP_CONFIG
};
