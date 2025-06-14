/**
 * MCP Open Discovery Server - SDK Compatible (Modular Architecture)
 * 
 * This is the main server implementation using the official MCP TypeScript SDK.
 * Replaces the custom server class with proper SDK compliance while maintaining
 * all existing functionality including security features and configuration.
 */

const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { registerAllTools, getToolCounts } = require('./tools/sdk_tool_registry');

// Environment configuration with defaults
const CONFIG = {
  MAX_CONNECTIONS: parseInt(process.env.MAX_CONNECTIONS) || 100,
  REQUEST_TIMEOUT: parseInt(process.env.REQUEST_TIMEOUT) || 30000,
  ENABLE_RATE_LIMITING: process.env.ENABLE_RATE_LIMITING !== 'false',
  LOG_LEVEL: process.env.LOG_LEVEL || 'info',
  SECURITY_MODE: process.env.SECURITY_MODE || 'standard'
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
  }
  
  if (typeof input === 'object' && input !== null) {
    const sanitized = {};
    for (const [key, value] of Object.entries(input)) {
      // Recursively sanitize object properties
      sanitized[sanitizeInput(key)] = sanitizeInput(value);
    }
    return sanitized;
  }
  
  return input;
}

/**
 * Enhanced error handling with security considerations
 */
function handleError(error, context = 'unknown') {
  const errorId = Math.random().toString(36).substring(2, 15);
  
  log('error', `Error in ${context} (ID: ${errorId})`, {
    message: error.message,
    stack: CONFIG.LOG_LEVEL === 'debug' ? error.stack : undefined
  });
  
  // Return sanitized error for client
  return {
    code: -32603,
    message: CONFIG.SECURITY_MODE === 'strict' 
      ? `Internal server error (ID: ${errorId})`
      : error.message
  };
}

/**
 * Initialize in-memory CI store for CMDB functionality
 */
function initializeCiMemory() {
  const ciMemory = new Map();
  
  // Add some initial test data if in development mode
  if (process.env.NODE_ENV !== 'production') {
    ciMemory.set('ci:test:example', {
      type: 'host',
      name: 'example-host',
      ip: '192.168.1.100',
      status: 'active',
      discovered: new Date().toISOString()
    });
    
    log('debug', 'Initialized CI memory with test data');
  }
  
  return ciMemory;
}

/**
 * Main server initialization and startup
 */
async function startServer() {
  try {
    log('info', 'Starting MCP Open Discovery Server (SDK)...');
    
    // Initialize CMDB memory store
    const ciMemory = initializeCiMemory();
    
    // Create MCP server instance
    const server = new McpServer({
      name: 'MCP Open Discovery Server (SDK)',
      version: '2.0.0'
    }, {
      capabilities: {
        tools: {}
      }
    });
    
    // Register all tools with the server
    await registerAllTools(server, { ciMemory });
    
    // Add request/response logging and security middleware
    const originalHandleRequest = server.handleRequest;
    server.handleRequest = async function(request) {
      const startTime = Date.now();
      const requestId = Math.random().toString(36).substring(2, 15);
      
      try {
        log('debug', `Request ${requestId}: ${request.method}`, {
          params: CONFIG.LOG_LEVEL === 'debug' ? request.params : undefined
        });
        
        // Sanitize input for security
        if (request.params) {
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
          error: error.message
        });
        
        throw error;
      }
    };
    
    // Set up transport
    const transport = new StdioServerTransport();
    
    // Handle graceful shutdown
    process.on('SIGINT', async () => {
      log('info', 'Received SIGINT, shutting down gracefully...');
      try {
        await server.close();
        log('info', 'Server shutdown complete');
        process.exit(0);
      } catch (error) {
        log('error', 'Error during shutdown', error);
        process.exit(1);
      }
    });
    
    process.on('SIGTERM', async () => {
      log('info', 'Received SIGTERM, shutting down gracefully...');
      try {
        await server.close();
        log('info', 'Server shutdown complete');
        process.exit(0);
      } catch (error) {
        log('error', 'Error during shutdown', error);
        process.exit(1);
      }
    });
    
    // Start the server
    await server.connect(transport);
    
    // Log successful startup
    const toolCounts = getToolCounts();
    log('info', 'MCP Open Discovery Server (SDK) started successfully', {
      version: '2.0.0',
      transport: 'stdio',
      tools: toolCounts,
      config: {
        maxConnections: CONFIG.MAX_CONNECTIONS,
        requestTimeout: CONFIG.REQUEST_TIMEOUT,
        rateLimiting: CONFIG.ENABLE_RATE_LIMITING,
        securityMode: CONFIG.SECURITY_MODE,
        logLevel: CONFIG.LOG_LEVEL
      }
    });
    
    log('info', 'Server connected and ready');
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

module.exports = { startServer, CONFIG };
