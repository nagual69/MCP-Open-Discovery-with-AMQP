/**
 * AMQP Transport Integration - Fixed Version
 * 
 * This module integrates the fixed AMQP transport that handles request-response cycles
 * internally like the HTTP transport, rather than expecting the SDK to call transport.send()
 */

const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { AmqpServerTransport } = require('./amqp-server-transport-fixed.js');

/**
 * Configuration
 */
const AMQP_CONFIG = {
  AMQP_URL: process.env.AMQP_URL || 'amqp://mcp:discovery@localhost:5672',
  AMQP_QUEUE_PREFIX: process.env.AMQP_QUEUE_PREFIX || 'mcp.discovery',
  AMQP_EXCHANGE: process.env.AMQP_EXCHANGE || 'mcp.notifications',
  AMQP_RECONNECT_DELAY: parseInt(process.env.AMQP_RECONNECT_DELAY) || 5000,
  AMQP_MAX_RECONNECT_ATTEMPTS: parseInt(process.env.AMQP_MAX_RECONNECT_ATTEMPTS) || 10,
  AMQP_PREFETCH_COUNT: parseInt(process.env.AMQP_PREFETCH_COUNT) || 1,
  AMQP_MESSAGE_TTL: parseInt(process.env.AMQP_MESSAGE_TTL) || 3600000, // 1 hour
  AMQP_QUEUE_TTL: parseInt(process.env.AMQP_QUEUE_TTL) || 7200000, // 2 hours
  
  // Enterprise discovery server specific settings
  REGISTRY_BROADCAST_ENABLED: process.env.REGISTRY_BROADCAST_ENABLED !== 'false',
  TOOL_CATEGORY_ROUTING: process.env.TOOL_CATEGORY_ROUTING !== 'false',
  HOT_RELOAD_AMQP_SYNC: process.env.HOT_RELOAD_AMQP_SYNC !== 'false'
};

/**
 * Start the server with fixed AMQP transport
 */
async function startAmqpServerFixed(createServerFn, log) {
  log('info', 'Starting AMQP transport (fixed version)...');
  
  try {
    // Create the MCP server instance
    const mcpServer = await createServerFn();
    
    // Create fixed AMQP transport
    const transport = new AmqpServerTransport({
      amqpUrl: AMQP_CONFIG.AMQP_URL,
      queuePrefix: AMQP_CONFIG.AMQP_QUEUE_PREFIX,
      exchangeName: AMQP_CONFIG.AMQP_EXCHANGE,
      reconnectDelay: AMQP_CONFIG.AMQP_RECONNECT_DELAY,
      maxReconnectAttempts: AMQP_CONFIG.AMQP_MAX_RECONNECT_ATTEMPTS,
      prefetchCount: AMQP_CONFIG.AMQP_PREFETCH_COUNT,
      messageTTL: AMQP_CONFIG.AMQP_MESSAGE_TTL,
      queueTTL: AMQP_CONFIG.AMQP_QUEUE_TTL
    });
    
    // CRITICAL: The transport will use the standard MCP SDK onmessage mechanism
    // rather than direct server calls like HTTP transport
    
    // Set up transport event handlers
    transport.onerror = (error) => {
      log('error', 'AMQP transport error', {
        error: error.message,
        stack: error.stack
      });
    };
    
    transport.onclose = () => {
      log('info', 'AMQP transport closed');
    };
    
    // Connect server to transport
    log('info', 'Connecting MCP server to fixed AMQP transport...');
    
    // Connect the server - SDK will call transport.start() internally
    await mcpServer.connect(transport);
    log('info', 'MCP server connected to fixed AMQP transport successfully');
    
    // Verify the connection
    log('info', 'Fixed AMQP transport verification:', {
      hasTransport: !!mcpServer.server.transport,
      transportType: mcpServer.server.transport ? mcpServer.server.transport.constructor.name : 'none',
      sessionId: mcpServer.server.transport ? mcpServer.server.transport.sessionId : 'none',
      isConnected: !!mcpServer.server.transport,
      hasSendMethod: mcpServer.server.transport ? typeof mcpServer.server.transport.send === 'function' : false,
      hasOnMessageHandler: mcpServer.server.transport ? typeof mcpServer.server.transport.onmessage === 'function' : false
    });
    
    // Store transport globally for health checks
    global.amqpTransportFixed = transport;
    
    log('info', 'Fixed AMQP transport started successfully', {
      amqpUrl: AMQP_CONFIG.AMQP_URL,
      queuePrefix: AMQP_CONFIG.AMQP_QUEUE_PREFIX,
      exchangeName: AMQP_CONFIG.AMQP_EXCHANGE,
      sessionId: transport.sessionId,
      streamId: transport.streamId
    });
    
    return { transport, mcpServer };
    
  } catch (error) {
    log('error', 'Failed to start fixed AMQP transport', {
      error: error.message,
      stack: error.stack
    });
    throw error;
  }
}

/**
 * Test AMQP connection health
 */
async function testAmqpConnectionFixed() {
  try {
    if (!global.amqpTransportFixed) {
      return {
        healthy: false,
        reason: 'Transport not initialized',
        timestamp: new Date().toISOString()
      };
    }
    
    const transport = global.amqpTransportFixed;
    
    if (!transport.connectionState.connected) {
      return {
        healthy: false,
        reason: 'Transport not connected',
        timestamp: new Date().toISOString()
      };
    }
    
    return {
      healthy: true,
      sessionId: transport.sessionId,
      streamId: transport.streamId,
      timestamp: new Date().toISOString()
    };
    
  } catch (error) {
    return {
      healthy: false,
      reason: error.message,
      timestamp: new Date().toISOString()
    };
  }
}

/**
 * Get AMQP status for health checks
 */
function getAmqpStatusFixed() {
  try {
    if (!global.amqpTransportFixed) {
      return {
        status: 'not_initialized',
        message: 'Fixed AMQP transport not initialized'
      };
    }
    
    const transport = global.amqpTransportFixed;
    
    return {
      status: transport.connectionState.connected ? 'connected' : 'disconnected',
      sessionId: transport.sessionId,
      streamId: transport.streamId,
      connected: transport.connectionState.connected,
      reconnectAttempts: transport.connectionState.reconnectAttempts,
      lastError: transport.connectionState.lastError?.message || null
    };
    
  } catch (error) {
    return {
      status: 'error',
      message: error.message
    };
  }
}

/**
 * Initialize AMQP integration (placeholder for compatibility)
 */
function initializeAmqpIntegrationFixed(log) {
  log('info', 'Fixed AMQP integration initialized');
}

module.exports = {
  startAmqpServerFixed,
  testAmqpConnectionFixed,
  getAmqpStatusFixed,
  initializeAmqpIntegrationFixed,
  AMQP_CONFIG
};
