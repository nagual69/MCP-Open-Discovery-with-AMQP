// SPDX-License-Identifier: MPL-2.0
/**
 * Shared AMQP Transport Base Class
 * 
 * This module provides common functionality for both AMQP client and server transports,
 * reducing code duplication and ensuring consistent behavior across the MCP Open Discovery platform.
 */

const { randomUUID } = require('node:crypto');

/**
 * Debug logging utility - conditional on DEBUG_AMQP environment variable
 */
const DEBUG_AMQP = process.env.DEBUG_AMQP === 'true';
function debugLog(prefix, message, data) {
  if (DEBUG_AMQP) {
    if (data) {
      console.log(`[${prefix}]`, message, data);
    } else {
      console.log(`[${prefix}]`, message);
    }
  }
}

/**
 * Base Transport interface (compatible with MCP SDK)
 */
class Transport {
  constructor() {
    this.onclose = null;
    this.onerror = null;
    this.onmessage = null;
  }
  
  async start() {
    throw new Error('start() must be implemented');
  }
  
  async send(message) {
    throw new Error('send() must be implemented');
  }
  
  async close() {
    throw new Error('close() must be implemented');
  }
}

/**
 * Base AMQP Transport class with shared functionality
 */
class BaseAMQPTransport extends Transport {
  constructor(options) {
    super();
    
    // Validate common required options
    if (!options.amqpUrl) {
      throw new Error('amqpUrl is required');
    }
    
    // Common connection state management
    this.connection = null;
    this.channel = null;
    this.connectionState = {
      connected: false,
      reconnectAttempts: 0,
      lastError: null
    };
    
    // Closing flag to prevent reconnect loops (C4)
    this._closing = false;
    
    // Message size validation (S1)
    this.maxMessageSize = options.maxMessageSize || 1048576; // 1 MB default
    
    // Routing key strategy (C7, M8)
    this.routingKeyStrategy = options.routingKeyStrategy || null;
    
    // Generate unique session ID for MCP routing using crypto.randomUUID (M6, T1)
    this.sessionId = randomUUID();
  }

  /**
   * Get transport type - to be overridden by subclasses
   */
  getTransportType() {
    return 'amqp';
  }

  /**
   * Initialize AMQP connection with error handling
   */
  async initializeConnection(amqpUrl) {
    // Validate AMQP URL scheme (S4)
    try {
      const parsedUrl = new URL(amqpUrl);
      if (parsedUrl.protocol !== 'amqp:' && parsedUrl.protocol !== 'amqps:') {
        throw new Error(`Invalid AMQP URL scheme: ${parsedUrl.protocol}. Must be amqp: or amqps:`);
      }
    } catch (error) {
      if (error.message.includes('Invalid URL')) {
        throw new Error(`Invalid AMQP URL format: ${amqpUrl}`);
      }
      throw error;
    }
    
    // Dynamic import to handle environments where amqplib might not be available
    let amqp;
    try {
      amqp = require('amqplib');
    } catch (error) {
      throw new Error('amqplib package not found. Please install with: npm install amqplib');
    }
    
    // Create connection
    this.connection = await amqp.connect(amqpUrl);
    
    // Set up connection error handling
    this.connection.on('error', (error) => {
      this.connectionState.connected = false;
      this.connectionState.lastError = error;
      if (this.onerror) {
        this.onerror(error);
      }
      // Don't reconnect if closing (C4)
      if (this._closing) return;
      this.scheduleReconnect();
    });

    this.connection.on('close', () => {
      this.connectionState.connected = false;
      // Don't reconnect if closing (C4)
      if (this._closing) return;
      this.scheduleReconnect();
    });

    // Create channel
    this.channel = await this.connection.createChannel();

    // Set up channel error handling
    this.channel.on('error', (error) => {
      console.error(`[AMQP ${this.getTransportType()}] Channel error:`, error);
      if (this.onerror) {
        this.onerror(error);
      }
    });

    this.connectionState.connected = true;
    this.connectionState.reconnectAttempts = 0;
  }

  /**
   * Detect message type following MCP v2025-06-18 specification
   * 
   * JSON-RPC 2.0 message type detection:
   * - Response: Has 'id' and ('result' OR 'error')
   * - Request: Has 'id' and 'method' (but no result/error)
   * - Notification: Has 'method' but no 'id'
   */
  detectMessageType(message) {
    // Priority 1: Check for response (id + result/error)
    if (message.id !== undefined && message.id !== null && (message.result !== undefined || message.error !== undefined)) {
      return 'response';
    }
    
    // Priority 2: Check for request (id + method, but no result/error)
    if (message.id !== undefined && message.id !== null && message.method !== undefined) {
      return 'request';
    }
    
    // Priority 3: Check for notification (method only, no id)
    if (message.method !== undefined && (message.id === undefined || message.id === null)) {
      return 'notification';
    }
    
    // Fallback for malformed messages
    console.warn(`[AMQP ${this.getTransportType()}] Unknown message type, treating as notification:`, message);
    return 'notification';
  }

  /**
   * Validate JSON-RPC message format (C3)
   * @param {any} message - The message to validate
   * @returns {Object} { valid: boolean, reason?: string }
   */
  validateJsonRpc(message) {
    if (!message || typeof message !== 'object') {
      return { valid: false, reason: 'Message must be an object' };
    }
    
    if (message.jsonrpc !== '2.0') {
      return { valid: false, reason: 'Missing or invalid jsonrpc field (must be "2.0")' };
    }
    
    // Must have either method (request/notification) or result/error (response)
    const hasMethod = message.method !== undefined;
    const hasResult = message.result !== undefined;
    const hasError = message.error !== undefined;
    
    if (!hasMethod && !hasResult && !hasError) {
      return { valid: false, reason: 'Message must have method, result, or error field' };
    }
    
    return { valid: true };
  }

  /**
   * Validate message size (S1)
   * @param {string|Buffer} content - The message content
   * @returns {Object} { valid: boolean, size: number, limit: number }
   */
  validateMessageSize(content) {
    const size = Buffer.byteLength(content);
    const valid = size <= this.maxMessageSize;
    return { valid, size, limit: this.maxMessageSize };
  }

  /**
   * Ensure outgoing messages conform to JSON-RPC 2.0 and strip transport-internal fields
   * - Warns if jsonrpc field is missing (SDK should provide it) (S2)
   * - Removes internal _rabbitMQ* properties that should not leak over the wire
   * - Shallow clones to avoid mutating caller objects
   * @param {any} message
   * @returns {any} sanitizedMessage
   */
  sanitizeJsonRpcMessage(message) {
    const clean = { ...(message || {}) };
    
    // Warn if SDK didn't provide jsonrpc field (S2)
    if (!clean.jsonrpc) {
      console.warn('[AMQP] SDK message missing jsonrpc field, adding "2.0"');
      clean.jsonrpc = '2.0';
    }
    
    // Remove any internal transport props
    Object.keys(clean)
      .filter((k) => k.startsWith('_rabbitMQ'))
      .forEach((k) => delete clean[k]);
    return clean;
  }

  /**
   * Get routing key for message with optional strategy (C7, M8)
   * @param {Object} message - The JSON-RPC message
   * @returns {string} The routing key
   */
  getRoutingKey(message) {
    // Use custom strategy if provided
    if (this.routingKeyStrategy && typeof this.routingKeyStrategy === 'function') {
      return this.routingKeyStrategy(message);
    }
    
    // Default routing key format: mcp.{messageType}.{method}
    const messageType = this.detectMessageType(message);
    const method = message.method || 'unknown';
    return `mcp.${messageType}.${method}`;
  }

  /**
   * Generate correlation ID for message tracking using crypto.randomUUID (M6, T1)
   */
  generateCorrelationId() {
    return randomUUID();
  }

  /**
   * Assert exchange with proper configuration
   */
  async assertExchange(exchangeName, exchangeType = 'topic') {
    if (!this.channel) {
      throw new Error('Channel not initialized');
    }
    
    await this.channel.assertExchange(exchangeName, exchangeType, {
      durable: true
    });
  }

  /**
   * Close connection with proper cleanup
   */
  async close() {
    // Set closing flag first (C4)
    this._closing = true;
    this.connectionState.connected = false;
    
    try {
      if (this.channel) {
        await this.channel.close();
        this.channel = null;
      }
      
      if (this.connection) {
        await this.connection.close();
        this.connection = null;
      }
    } catch (error) {
      // Ignore errors during cleanup
      console.warn(`[AMQP ${this.getTransportType()}] Error during cleanup:`, error.message);
    }
    
    if (this.onclose) {
      this.onclose();
    }
  }

  /**
   * Schedule reconnection with exponential backoff
   * To be implemented by subclasses if needed
   */
  scheduleReconnect() {
    // Default implementation - subclasses can override
    console.warn(`[AMQP ${this.getTransportType()}] Connection lost, reconnection not implemented in base class`);
  }

  /**
   * Validate and parse JSON message with error handling
   */
  parseMessage(content) {
    try {
      const message = JSON.parse(content.toString());
      return {
        success: true,
        message,
        error: null
      };
    } catch (parseError) {
      console.error(`[AMQP ${this.getTransportType()}] Failed to parse message JSON:`, parseError);
      return {
        success: false,
        message: null,
        error: parseError
      };
    }
  }

  /**
   * Create structured log entry for debugging
   */
  createLogEntry(operation, data) {
    return {
      timestamp: new Date().toISOString(),
      transport: this.getTransportType(),
      sessionId: this.sessionId,
      operation,
      ...data
    };
  }
}

module.exports = {
  Transport,
  BaseAMQPTransport,
  debugLog
};
