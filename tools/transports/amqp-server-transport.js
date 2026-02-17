/**
 * AMQP Server Transport for MCP Open Discovery Server v2.0
 * 
 * This transport enables the revolutionary MCP Open Discovery Server with its
 * 61 enterprise tools to receive requests and send responses through 
 * RabbitMQ/AMQP message queues with enterprise-grade features:
 * 
 * - Tool category-based routing
 * - Registry event broadcasting  
 * - Hot-reload synchronization
 * - Production-grade error handling
 * - Performance monitoring
 */

const { BaseAMQPTransport, debugLog } = require('./base-amqp-transport.js');

/**
 * RabbitMQ server transport implementation for MCP Open Discovery
 */
class RabbitMQServerTransport extends BaseAMQPTransport {
  constructor(options) {
    super(options);
    
    // Validate server-specific required options
    if (!options.queuePrefix) {
      throw new Error('queuePrefix is required');
    }
    if (!options.exchangeName) {
      throw new Error('exchangeName is required');
    }
    
    this.options = {
      reconnectDelay: 5000,
      maxReconnectAttempts: 10,
      prefetchCount: 1,
      messageTTL: 3600000, // 1 hour
      queueTTL: 7200000,   // 2 hours
      ...options
    };
    
    // Server-specific properties (inherits connection, channel, connectionState, sessionId from base)
    this.requestQueue = `${this.options.queuePrefix}.requests`;
    this.channelRecovering = false;
    
    // Routing info storage for response correlation
    this.routingInfoStore = new Map();
    
    debugLog('AMQP', 'MCP Server Transport initialized:', {
      sessionId: this.sessionId,
      requestQueue: this.requestQueue
    });
  }

  /**
   * Get transport type for logging and identification
   */
  getTransportType() {
    return 'Server';
  }

  async start() {
    // CRITICAL MCP SDK COMPLIANCE FIX: Make start() idempotent
    // The SDK may call start() multiple times, so we must check if already started
    if (this.connectionState.connected) {
      debugLog('AMQP', 'Transport already started, skipping (SDK compliance):', {
        sessionId: this.sessionId,
        alreadyConnected: true
      });
      return;
    }
    
    debugLog('AMQP', 'Starting MCP server transport:', {
      hasOnMessage: typeof this.onmessage === 'function',
      hasOnError: typeof this.onerror === 'function',
      hasOnClose: typeof this.onclose === 'function',
      sessionId: this.sessionId
    });
    
    try {
      await this.connect();
      
      // Start routing info TTL cleanup (M5)
      this.startRoutingInfoCleanup();
      
      this.connectionState.connected = true;
      this.connectionState.reconnectAttempts = 0;
      
      debugLog('AMQP', 'MCP server transport started successfully:', {
        hasOnMessage: typeof this.onmessage === 'function',
        connected: this.connectionState.connected,
        sessionId: this.sessionId
      });
    } catch (error) {
      this.connectionState.lastError = error;
      if (this.onerror) {
        this.onerror(error);
      }
      throw error;
    }
  }

  /**
   * Send method required by MCP SDK Transport interface
   * This is the main method that handles all message types: requests, responses, and notifications
   */
  async send(message, options = {}) {
    debugLog('AMQP', 'Transport.send() called:', {
      messageType: this.detectMessageType(message),
      messageId: message.id,
      method: message.method,
      hasResult: !!message.result,
      hasError: !!message.error,
      timestamp: new Date().toISOString()
    });
    
    if (!this.channel) {
      throw new Error('Transport not connected');
    }

    const messageType = this.detectMessageType(message);
    
    switch (messageType) {
      case 'response':
        await this.handleResponseMessage(message, options);
        break;
        
      case 'request':
        await this.handleRequestMessage(message, options);
        break;
        
      case 'notification':
        await this.handleNotificationMessage(message, options);
        break;
        
      default:
        console.warn('[AMQP] Unknown message type, treating as notification:', message);
        await this.handleNotificationMessage(message, options);
    }
  }

  /**
   * Handle response messages (most common case for server transport)
   * Fixed to use relatedRequestId for routing info lookup (C2, M4)
   */
  async handleResponseMessage(message, options = {}) {
    debugLog('AMQP', 'Sending response message:', {
      messageId: message.id,
      hasResult: !!message.result,
      hasError: !!message.error,
      relatedRequestId: options.relatedRequestId,
      jsonrpc: message.jsonrpc
    });

    // Get routing information using relatedRequestId first, fall back to message.id (C2, M4)
    const routingKey = options.relatedRequestId || message.id;
    const routingInfo = this.retrieveRoutingInfo(routingKey);
    
    if (!routingInfo) {
      console.error('[AMQP] ❌ No routing information found for response:', {
        messageId: message.id,
        relatedRequestId: options.relatedRequestId,
        lookupKey: routingKey
      });
      throw new Error(`Cannot send response: no routing info for key ${routingKey}`);
    }

    const { correlationId, replyTo } = routingInfo;

    debugLog('AMQP', 'Retrieved routing info for response:', {
      messageId: message.id,
      correlationId,
      replyTo
    });

    // Clean message for sending
    const cleanMessage = this.sanitizeJsonRpcMessage(message);

    debugLog('AMQP', 'About to send response:', {
      messageId: cleanMessage.id,
      hasId: cleanMessage.id !== undefined && cleanMessage.id !== null,
      jsonrpc: cleanMessage.jsonrpc,
      hasResult: !!cleanMessage.result,
      hasError: !!cleanMessage.error
    });

    try {
      if (replyTo) {
        // Direct response to client's reply queue using this.channel (not pubsubChannel)
        debugLog('AMQP', 'Sending direct response to client queue:', replyTo);
        
        const messageBuffer = Buffer.from(JSON.stringify(cleanMessage));
        
        // Use this.channel instead of pubsubChannel (M2, C6)
        await this.channel.sendToQueue(replyTo, messageBuffer, {
          correlationId,
          persistent: false,
          contentType: 'application/json'  // Add contentType (M7)
        });
        
        debugLog('AMQP', '✅ Direct response sent successfully to queue:', replyTo);
      } else {
        console.error('[AMQP] ❌ No replyTo queue in routing info! Cannot send response.');
        throw new Error('No replyTo queue for response routing');
      }

    } catch (error) {
      console.error('[AMQP] ❌ Failed to send response:', error);
      throw error;
    }
  }

  /**
   * Handle outgoing request messages (less common for server transport)
   */
  async handleRequestMessage(message, options = {}) {
    debugLog('AMQP', 'Sending request message:', {
      method: message.method,
      messageId: message.id
    });

    const routingKey = 'mcp.request.general';
    
    try {
      const cleanMessage = this.sanitizeJsonRpcMessage(message);
      const messageBuffer = Buffer.from(JSON.stringify(cleanMessage));
      
      await this.channel.publish(this.options.exchangeName, routingKey, messageBuffer, {
        persistent: true,
        timestamp: Date.now(),
        correlationId: message.id,
        contentType: 'application/json'  // Add contentType (M7)
      });

      debugLog('AMQP', 'Request sent successfully');
    } catch (error) {
      console.error('[AMQP] Failed to send request:', error);
      throw error;
    }
  }

  /**
   * Handle notification messages with fixed routing (C7, M8)
   */
  async handleNotificationMessage(message, options = {}) {
    debugLog('AMQP', 'Sending notification message:', {
      method: message.method
    });

    // Use base class getRoutingKey() instead of application-specific logic (C7, M8)
    const routingKey = this.getRoutingKey(message);
    
    try {
      const cleanMessage = this.sanitizeJsonRpcMessage(message);
      const messageBuffer = Buffer.from(JSON.stringify(cleanMessage));
      
      await this.channel.publish(this.options.exchangeName, routingKey, messageBuffer, {
        persistent: false,
        timestamp: Date.now(),
        contentType: 'application/json'  // Add contentType (M7)
      });

      debugLog('AMQP', 'Notification sent successfully');
    } catch (error) {
      console.error('[AMQP] Failed to send notification:', error);
      throw error;
    }
  }
  
  async connect() {
    // Use base class connection initialization
    await this.initializeConnection(this.options.amqpUrl);
    
    // Set prefetch count if specified
    if (this.options.prefetchCount) {
      await this.channel.prefetch(this.options.prefetchCount);
    }

    // Set up channel error handling
    this.channel.on('error', (error) => {
      // Log the error but attempt to continue operation
      console.warn('[AMQP] Channel error:', error.message);
      
      if (this.onerror) {
        this.onerror(error);
      }
    });

    this.channel.on('close', () => {
      debugLog('AMQP', 'Channel closed');
    });

    // Create exchange for notifications
    await this.channel.assertExchange(this.options.exchangeName, 'topic', {
      durable: true
    });

    // Create session-specific request queue for this server instance
    const sessionQueue = `${this.options.queuePrefix}.${this.sessionId}`;
    await this.channel.assertQueue(sessionQueue, {
      durable: false,
      exclusive: true,
      autoDelete: true,
      arguments: this.getQueueArguments()
    });

    // Bind to mcp.request.# and mcp.notification.# patterns
    await this.channel.bindQueue(sessionQueue, this.options.exchangeName, 'mcp.request.#');
    await this.channel.bindQueue(sessionQueue, this.options.exchangeName, 'mcp.notification.#');

    // Set up single consumer for all incoming messages (M2)
    await this.channel.consume(sessionQueue, (msg) => {
      if (msg) {
        this.handleIncomingMessage(msg);
      }
    }, { noAck: false });

    debugLog('AMQP', 'Connected with single consumption path:', {
      sessionQueue,
      exchangeName: this.options.exchangeName
    });
  }

  /**
   * Unified message handler - replaces old handleRequest and handleBidirectionalRequest (C1, C3, S1, M2)
   */
  handleIncomingMessage(msg) {
    let acknowledged = false;
    
    try {
      // Check message size (S1)
      const sizeCheck = this.validateMessageSize(msg.content);
      if (!sizeCheck.valid) {
        console.error('[AMQP] Message too large:', {
          size: sizeCheck.size,
          limit: sizeCheck.limit
        });
        this.safeNack(msg);
        return;
      }
      
      // Parse JSON (C3)
      const parseResult = this.parseMessage(msg.content);
      if (!parseResult.success) {
        console.error('[AMQP] Failed to parse message JSON:', parseResult.error);
        this.safeNack(msg);
        return;
      }
      
      const jsonRpcMessage = parseResult.message;
      
      // Validate JSON-RPC format (C3)
      const validation = this.validateJsonRpc(jsonRpcMessage);
      if (!validation.valid) {
        console.error('[AMQP] Invalid JSON-RPC message:', validation.reason);
        this.safeNack(msg);
        return;
      }
      
      // Store routing info from AMQP properties
      const correlationId = msg.properties.correlationId;
      const replyTo = msg.properties.replyTo;
      const deliveryTag = msg.fields.deliveryTag;
      
      debugLog('AMQP', 'Processing message:', {
        messageId: jsonRpcMessage.id,
        method: jsonRpcMessage.method,
        correlationId,
        replyTo
      });
      
      // Store routing information for response correlation
      if (jsonRpcMessage.id !== undefined && jsonRpcMessage.id !== null) {
        this.storeRoutingInfo(jsonRpcMessage.id, {
          correlationId,
          replyTo,
          exchangeName: this.options.exchangeName,
          routingKey: msg.fields.routingKey,
          deliveryTag
        });
      }
      
      // Forward to SDK via onmessage (no extra context arguments) (C6)
      if (this.onmessage) {
        debugLog('AMQP', 'Calling onmessage handler:', {
          messageId: jsonRpcMessage.id,
          method: jsonRpcMessage.method
        });
        this.onmessage(jsonRpcMessage);
        this.safeAck(msg);
        acknowledged = true;
      } else {
        console.warn('[AMQP] No onmessage handler set');
        this.safeAck(msg);
        acknowledged = true;
      }
    } catch (error) {
      console.error('[AMQP] Error handling incoming message:', error);
      if (this.onerror) {
        this.onerror(error);
      }
      if (!acknowledged) {
        this.safeNack(msg);
      }
    }
  }

  /**
   * Safely acknowledge a message (bug fix - was called but not defined)
   */
  safeAck(msg) {
    if (this.channel && !this.channel.closing) {
      try {
        this.channel.ack(msg);
      } catch (ackError) {
        console.warn('[AMQP] Failed to ack message:', ackError.message);
      }
    }
  }

  safeNack(msg) {
    if (this.channel && !this.channel.closing) {
      try {
        this.channel.nack(msg, false, false); // Reject and don't requeue
      } catch (nackError) {
        console.warn('[AMQP] Failed to nack message:', nackError.message);
      }
    }
  }

  /**
   * Schedule reconnection with exponential backoff (C4, C5)
   */
  scheduleReconnect() {
    // Don't reconnect if closing (C4)
    if (this._closing) {
      debugLog('AMQP', 'Not reconnecting - transport is closing');
      return;
    }
    
    if (this.connectionState.reconnectAttempts >= this.options.maxReconnectAttempts) {
      const error = new Error('Maximum reconnection attempts exceeded');
      if (this.onerror) {
        this.onerror(error);
      }
      // Call onclose after max attempts (C5)
      if (this.onclose) {
        this.onclose();
      }
      return;
    }

    this.connectionState.reconnectAttempts++;
    
    setTimeout(async () => {
      if (this._closing) return; // Check again before attempting
      
      try {
        await this.connect();
        this.connectionState.connected = true;
        this.connectionState.reconnectAttempts = 0;
      } catch (error) {
        this.connectionState.lastError = error;
        this.scheduleReconnect();
      }
    }, this.options.reconnectDelay);
  }

  /**
   * Store routing information for response correlation with timestamp (M5)
   */
  storeRoutingInfo(messageId, routingInfo) {
    this.routingInfoStore.set(messageId, {
      ...routingInfo,
      storedAt: Date.now()  // Add timestamp for TTL cleanup (M5)
    });
    debugLog('AMQP', 'Stored routing info for message ID:', messageId);
  }

  /**
   * Retrieve and remove routing information for response correlation
   */
  retrieveRoutingInfo(messageId) {
    const info = this.routingInfoStore.get(messageId);
    if (info) {
      this.routingInfoStore.delete(messageId);
      debugLog('AMQP', 'Retrieved routing info for message ID:', messageId);
    }
    return info;
  }

  /**
   * Start periodic cleanup of old routing info entries (M5)
   */
  startRoutingInfoCleanup() {
    // Clean up entries older than messageTTL every 60 seconds
    this._routingCleanupTimer = setInterval(() => {
      const now = Date.now();
      let cleaned = 0;
      
      for (const [messageId, info] of this.routingInfoStore.entries()) {
        if (info.storedAt && (now - info.storedAt) > this.options.messageTTL) {
          this.routingInfoStore.delete(messageId);
          cleaned++;
        }
      }
      
      if (cleaned > 0) {
        debugLog('AMQP', `Cleaned up ${cleaned} expired routing info entries`);
      }
    }, 60000);
    
    // unref() to allow process to exit (M5)
    this._routingCleanupTimer.unref();
    
    debugLog('AMQP', 'Started routing info TTL cleanup');
  }

  /**
   * Override close to stop cleanup timer
   */
  async close() {
    // Clear routing info cleanup timer (M5)
    if (this._routingCleanupTimer) {
      clearInterval(this._routingCleanupTimer);
      this._routingCleanupTimer = null;
    }
    
    // Call parent close
    await super.close();
  }

  getQueueArguments() {
    const args = {};
    
    if (this.options.queueTTL) {
      args['x-message-ttl'] = this.options.queueTTL;
    }
    
    if (this.options.messageTTL) {
      args['x-expires'] = this.options.messageTTL;
    }
    
    return args;
  }
}

module.exports = {
  RabbitMQServerTransport
};
