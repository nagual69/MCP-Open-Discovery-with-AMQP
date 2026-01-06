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
  DESCRIPTION: 'HTTP transport with SSE for web clients',
  // Session management (MCP 2025-11-25 compliance)
  SESSION_TTL_MS: parseInt(process.env.MCP_SESSION_TTL_MS) || 600000, // 10 minutes default
  SESSION_CLEANUP_INTERVAL_MS: 60000, // 1 minute
  SSE_RETRY_MS: parseInt(process.env.MCP_SSE_RETRY_MS) || 3000, // 3 seconds default
  // Security (MCP 2025-11-25 requirement)
  VALIDATE_ORIGIN: process.env.MCP_VALIDATE_ORIGIN !== 'false', // true by default
  ALLOWED_ORIGINS: process.env.MCP_ALLOWED_ORIGINS ? process.env.MCP_ALLOWED_ORIGINS.split(',') : ['http://localhost', 'http://127.0.0.1']
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
  
  // CORS and Origin validation middleware (MCP 2025-11-25 security requirement)
  app.use((req, res, next) => {
    // Origin validation for security (prevents DNS rebinding attacks)
    if (HTTP_CONFIG.VALIDATE_ORIGIN && req.headers.origin) {
      const origin = req.headers.origin;
      const isAllowed = HTTP_CONFIG.ALLOWED_ORIGINS.some(allowed => 
        origin.startsWith(allowed) || allowed === '*'
      );
      
      if (!isAllowed) {
        logHttp('warn', 'Invalid Origin header detected - responding with 403 Forbidden', { 
          origin, 
          ip: req.ip,
          path: req.path
        });
        // MCP spec: MUST respond with 403 Forbidden for invalid Origin
        res.status(403).json({
          jsonrpc: '2.0',
          error: {
            code: -32000,
            message: 'Forbidden: Invalid Origin header'
          },
          id: null
        });
        return;
      }
    }
    
    res.header('Access-Control-Allow-Origin', options.corsOrigins || HTTP_CONFIG.CORS_ORIGINS);
    res.header('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, mcp-session-id, last-event-id, mcp-protocol-version, Authorization');
    res.header('Access-Control-Expose-Headers', 'mcp-session-id');
    
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
  // Session storage with TTL tracking
  const transports = {}; // Map to store transports by session ID
  const sessionMetadata = {}; // Track last activity, creation time, etc.
  
  // Session cleanup with TTL (MCP 2025-11-25 compliance)
  const cleanupExpiredSessions = () => {
    const now = Date.now();
    const expiredSessions = [];
    
    for (const [sessionId, metadata] of Object.entries(sessionMetadata)) {
      if (now - metadata.lastActivity > HTTP_CONFIG.SESSION_TTL_MS) {
        expiredSessions.push(sessionId);
      }
    }
    
    for (const sessionId of expiredSessions) {
      logHttp('info', 'Session expired due to TTL', { 
        sessionId,
        lastActivity: sessionMetadata[sessionId]?.lastActivity,
        ttlMs: HTTP_CONFIG.SESSION_TTL_MS
      });
      
      // Close transport gracefully
      if (transports[sessionId] && typeof transports[sessionId].close === 'function') {
        try {
          transports[sessionId].close();
        } catch (err) {
          logHttp('error', 'Error closing expired session transport', { sessionId, error: err.message });
        }
      }
      
      delete transports[sessionId];
      delete sessionMetadata[sessionId];
    }
    
    if (expiredSessions.length > 0) {
      logHttp('debug', `Cleaned up ${expiredSessions.length} expired session(s)`);
    }
  };
  
  // Start periodic cleanup
  const cleanupInterval = setInterval(cleanupExpiredSessions, HTTP_CONFIG.SESSION_CLEANUP_INTERVAL_MS);
  
  // Helper to update session activity
  const touchSession = (sessionId) => {
    if (sessionMetadata[sessionId]) {
      sessionMetadata[sessionId].lastActivity = Date.now();
      logHttp('debug', 'Session activity updated', { sessionId });
    }
  };
  
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
      const protocolVersion = req.headers['mcp-protocol-version'] || '2025-03-26'; // Default per spec
      let transport;

      // Check for expired session (MCP spec: respond with 404)
      if (sessionId && !transports[sessionId]) {
        logHttp('warn', 'Session not found or expired - client should re-initialize', { 
          sessionId,
          method: req.body?.method,
          protocolVersion
        });
        res.status(404).json({
          jsonrpc: '2.0',
          error: {
            code: -32000,
            message: 'Session not found or expired. Please send a new initialize request without session ID.'
          },
          id: req.body?.id || null
        });
        return;
      }

      if (sessionId && transports[sessionId]) {
        // Reuse existing transport and update activity
        transport = transports[sessionId];
        touchSession(sessionId);
        logHttp('debug', 'Reusing existing transport', { sessionId, method: req.body?.method });
      } else if (!sessionId && req.body?.method === 'initialize') {
        // New initialization request
        logHttp('info', 'Creating new HTTP transport session');
        
        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          onsessioninitialized: (newSessionId) => {
            logHttp('info', `HTTP session initialized`, { 
              sessionId: newSessionId,
              ttlMs: HTTP_CONFIG.SESSION_TTL_MS,
              protocolVersion
            });
            transports[newSessionId] = transport;
            sessionMetadata[newSessionId] = {
              createdAt: Date.now(),
              lastActivity: Date.now(),
              protocolVersion,
              clientIp
            };
          }
        });

        // Set up onclose handler with enhanced diagnostics (no immediate deletion)
        transport.onclose = () => {
          const sid = transport.sessionId;
          if (sid) {
            logHttp('info', `HTTP transport SSE stream closed (session kept alive for TTL)`, { 
              sessionId: sid,
              ttlMs: HTTP_CONFIG.SESSION_TTL_MS,
              reason: 'SSE stream ended or client disconnected'
            });
            // Don't delete session immediately - let TTL cleanup handle it
            // This allows reconnection with Last-Event-ID per MCP 2025-11-25
          }
        };

        // Connect the shared MCP server to this transport
        await mcpServer.connect(transport);
        await transport.handleRequest(req, res, req.body);
        return; // Already handled
      } else if (!sessionId && req.body?.jsonrpc === '2.0') {
        // Stateless request (e.g. from ServiceNow or simple clients)
        // Create a temporary transport just for this request
        logHttp('info', 'Handling stateless MCP request', { 
          method: req.body.method,
          clientIp,
          protocolVersion,
          note: 'One-off request without session management'
        });
        
        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          onsessioninitialized: (sid) => {
            logHttp('debug', `Stateless session initialized (temporary)`, { 
              sessionId: sid,
              method: req.body.method
            });
          }
        });

        // Connect server and handle request
        await mcpServer.connect(transport);
        await transport.handleRequest(req, res, req.body);
        
        logHttp('debug', 'Stateless request completed', { method: req.body.method });
        // Note: We don't store this transport in the map as it's one-off
        return;
      } else {
        // Invalid request - no session ID or not initialization request
        logHttp('warn', 'Bad request: missing session or not initialize', {
          hasSessionId: !!sessionId,
          method: req.body?.method,
          clientIp
        });
        res.status(400).json({
          jsonrpc: '2.0',
          error: {
            code: -32000,
            message: 'Bad Request: No valid session ID provided. Send an initialize request without session ID to create a new session, or include a valid MCP-Session-Id header.',
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

  // Handle GET requests for SSE streams (with resumability support)
  app.get('/mcp', async (req, res) => {
    const sessionId = req.headers['mcp-session-id'];
    const lastEventId = req.headers['last-event-id'];
    
    // Check for missing/expired session (MCP spec: 404 for expired, 400 for missing)
    if (!sessionId) {
      logHttp('warn', 'GET /mcp: Missing session ID header', { lastEventId });
      res.status(400).send('Missing MCP-Session-Id header');
      return;
    }
    
    if (!transports[sessionId]) {
      logHttp('warn', 'GET /mcp: Session not found or expired', { 
        sessionId,
        lastEventId,
        note: 'Client should re-initialize'
      });
      // MCP spec: 404 when session expired
      res.status(404).send('Session not found or expired. Please send a new initialize request.');
      return;
    }

    // Update session activity
    touchSession(sessionId);

    if (lastEventId) {
      logHttp('info', `Client reconnecting SSE stream with Last-Event-ID`, { 
        sessionId, 
        lastEventId,
        note: 'Attempting to resume stream per MCP 2025-11-25'
      });
    } else {
      logHttp('info', `Establishing new SSE stream`, { sessionId });
    }

    const transport = transports[sessionId];
    
    // Send retry field per MCP spec for SSE polling support
    res.setHeader('X-SSE-Retry-MS', HTTP_CONFIG.SSE_RETRY_MS);
    
    await transport.handleRequest(req, res);
  });

  // Handle DELETE requests for explicit session termination
  app.delete('/mcp', async (req, res) => {
    const sessionId = req.headers['mcp-session-id'];
    if (!sessionId) {
      res.status(400).send('Missing MCP-Session-Id header');
      return;
    }
    
    if (!transports[sessionId]) {
      logHttp('warn', 'DELETE /mcp: Session already terminated or expired', { sessionId });
      res.status(404).send('Session not found');
      return;
    }

    logHttp('info', `Explicit session termination requested`, { 
      sessionId,
      age: Date.now() - (sessionMetadata[sessionId]?.createdAt || 0)
    });
    
    try {
      const transport = transports[sessionId];
      await transport.handleRequest(req, res);
      
      // Clean up session immediately on explicit DELETE
      delete transports[sessionId];
      delete sessionMetadata[sessionId];
      
      logHttp('info', 'Session terminated and cleaned up', { sessionId });
    } catch (error) {
      logHttp('error', 'Error handling session termination', {
        error: error.message,
        stack: error.stack,
        sessionId
      });
      if (!res.headersSent) {
        res.status(500).send('Error processing session termination');
      }
    }
  });
  
  return { 
    transports, 
    sessionMetadata,
    cleanupInterval,
    touchSession,
    cleanupExpiredSessions
  };
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
    const { transports, sessionMetadata, cleanupInterval, touchSession, cleanupExpiredSessions } = setupMcpEndpoints(app, mcpServer, options);
    
    // Start the HTTP server
    const server = app.listen(port, () => {
      logHttp('info', `HTTP server listening on port ${port}`);
      logHttp('info', `Health endpoint: http://localhost:${port}/health`);
      logHttp('info', `MCP endpoint: http://localhost:${port}/mcp`);
      logHttp('info', `Session TTL: ${HTTP_CONFIG.SESSION_TTL_MS}ms`);
      logHttp('info', `SSE retry interval: ${HTTP_CONFIG.SSE_RETRY_MS}ms`);
      logHttp('info', `Origin validation: ${HTTP_CONFIG.VALIDATE_ORIGIN ? 'enabled' : 'disabled'}`);
    });
    
    return {
      success: true,
      transport: 'http',
      port: port,
      server: server,
      app: app,
      transports: transports,
      sessionMetadata: sessionMetadata,
      cleanupInterval: cleanupInterval,
      touchSession: touchSession,
      cleanupExpiredSessions: cleanupExpiredSessions,
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
  // Clear session cleanup interval
  if (serverInfo.cleanupInterval) {
    clearInterval(serverInfo.cleanupInterval);
    logHttp('info', 'Session cleanup interval cleared');
  }
  
  // Close all active transports
  if (serverInfo.transports) {
    const sessionIds = Object.keys(serverInfo.transports);
    for (const sessionId of sessionIds) {
      try {
        if (typeof serverInfo.transports[sessionId].close === 'function') {
          serverInfo.transports[sessionId].close();
        }
      } catch (err) {
        logHttp('error', 'Error closing transport during cleanup', { sessionId, error: err.message });
      }
    }
    logHttp('info', `Closed ${sessionIds.length} active session(s)`);
  }
  
  // Close HTTP server
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
