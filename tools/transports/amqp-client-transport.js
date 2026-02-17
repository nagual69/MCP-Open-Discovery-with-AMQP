/**
 * AMQP Client Transport for MCP Open Discovery Server
 * 
 * This transport enables MCP clients to connect to the MCP Open Discovery Server
 * through RabbitMQ/AMQP message queues for distributed network discovery operations.
 */

const { BaseAMQPTransport, debugLog } = require('./base-amqp-transport.js');

/**
 * AMQP client transport for connecting to MCP Open Discovery Server
 */
class AMQPClientTransport extends BaseAMQPTransport {
  constructor(options) {
    super(options);
    
    // Validate client-specific required options
    if (!options.serverQueuePrefix) {
      throw new Error('serverQueuePrefix is required');
    }
    if (!options.exchangeName) {
      throw new Error('exchangeName is required');
    }
    
    // Client-specific options (inherits connection, channel, connectionState, sessionId from base)
    this.options = {
      responseTimeout: 30000,
      reconnectDelay: 5000,
      maxReconnectAttempts: 10,
      ...options
    };
    
    // Client-specific properties
    this.responseQueue = null;
    this.pendingRequests = new Map();
  }

  /**
   * Get transport type for logging and identification
   */
  getTransportType() {
    return 'Client';
  }

  async start() {
    try {
      await this.connect();
      this.connectionState.connected = true;
      this.connectionState.reconnectAttempts = 0;
    } catch (error) {
      this.connectionState.lastError = error;
      if (this.onerror) {
        this.onerror(error);
      }
      throw error;
    }
  }

  async send(message) {
    if (!this.channel) {
      throw new Error('Transport not connected');
    }

    debugLog('AMQP Client', 'Sending message:', {
      messageId: message.id,
      method: message.method,
      messageType: this.detectMessageType(message)
    });

    // Create correlation ID for response routing
    const correlationId = this.generateCorrelationId();
    const messageType = this.detectMessageType(message);

    // For requests, set up response handling
    if (messageType === 'request' && message.id !== undefined) {
      this.setupRequestTimeout(correlationId, message.id);
      
      debugLog('AMQP Client', 'Set up request tracking:', {
        messageId: message.id,
        correlationId: correlationId,
        replyTo: this.responseQueue,
        timeoutMs: this.options.responseTimeout
      });
    }

    // Send raw JSON-RPC directly (no envelope) (C1, M1)
    const cleanMessage = this.sanitizeJsonRpcMessage(message);
    const exchangeName = this.options.exchangeName;
    const routingKey = this.getRoutingKey(message);  // Use base class method (C7)
    const messageBuffer = Buffer.from(JSON.stringify(cleanMessage));

    debugLog('AMQP Client', 'Publishing raw JSON-RPC:', {
      exchange: exchangeName,
      routingKey: routingKey,
      messageId: message.id,
      method: message.method,
      correlationId: correlationId
    });

    // Transport metadata goes in AMQP properties only, not in message body (M1)
    await this.channel.publish(exchangeName, routingKey, messageBuffer, {
      correlationId: correlationId,
      replyTo: messageType === 'request' ? this.responseQueue : undefined,
      persistent: false,
      timestamp: Date.now(),
      contentType: 'application/json'  // Add contentType (M7)
    });
  }

  /**
   * Override close method to clear pending requests
   */
  async close() {
    // Clear all pending requests
    for (const [correlationId, timeoutId] of this.pendingRequests) {
      clearTimeout(timeoutId);
    }
    this.pendingRequests.clear();
    
    // Call base class close method
    await super.close();
  }

  async connect() {
    // Use base class connection initialization
    await this.initializeConnection(this.options.amqpUrl);

    // Assert the exchange
    await this.assertExchange(this.options.exchangeName, 'topic');

    // Create exclusive response queue for this client session  
    const responseQueueResult = await this.channel.assertQueue('', {
      exclusive: true,
      autoDelete: true
    });
    this.responseQueue = responseQueueResult.queue;

    debugLog('AMQP Client', 'Created response queue:', {
      queue: this.responseQueue,
      sessionId: this.sessionId
    });

    // Set up response queue consumer (no routing key binding needed - direct queue usage)
    await this.channel.consume(this.responseQueue, (msg) => {
      if (msg) {
        this.handleResponse(msg);
      }
    }, { noAck: true });

    // Subscribe to notifications from the discovery server
    await this.subscribeToNotifications();
  }

  handleResponse(msg) {
    try {
      // Check message size (S1)
      const sizeCheck = this.validateMessageSize(msg.content);
      if (!sizeCheck.valid) {
        console.error('[AMQP Client] Response too large:', {
          size: sizeCheck.size,
          limit: sizeCheck.limit
        });
        return;
      }
      
      const correlationId = msg.properties.correlationId;
      
      debugLog('AMQP Client', 'Received response:', {
        correlationId,
        hasContent: !!msg.content,
        contentLength: msg.content ? msg.content.length : 0
      });
      
      // Parse raw JSON-RPC response directly (C1)
      let response;
      try {
        response = JSON.parse(msg.content.toString());
        debugLog('AMQP Client', 'Parsed response structure:', {
          hasId: response.id !== undefined && response.id !== null,
          hasJsonrpc: !!response.jsonrpc,
          hasResult: !!response.result,
          hasError: !!response.error,
          actualId: response.id
        });
      } catch (parseError) {
        console.error('[AMQP Client] Failed to parse response JSON:', parseError);
        return;
      }
      
      // Clear timeout for this request
      if (this.pendingRequests.has(correlationId)) {
        clearTimeout(this.pendingRequests.get(correlationId));
        this.pendingRequests.delete(correlationId);
        debugLog('AMQP Client', '✅ Response received for correlation ID:', correlationId);
      } else {
        console.warn('[AMQP Client] ⚠️ Received response for unknown correlation ID:', correlationId);
      }
      
      // Forward response directly to MCP client (already raw JSON-RPC)
      if (this.onmessage) {
        this.onmessage(response);
      }
    } catch (error) {
      console.error('[AMQP Client] Error handling response:', error);
      if (this.onerror) {
        this.onerror(error);
      }
    }
  }

  async subscribeToNotifications() {
    if (!this.channel) return;
    
    // Create temporary queue for notifications
    const notificationQueue = await this.channel.assertQueue('', {
      exclusive: true,
      autoDelete: true
    });
    
    // Bind to mcp.notification.# only (M8)
    const exchangeName = this.options.exchangeName;
    await this.channel.bindQueue(
      notificationQueue.queue,
      exchangeName,
      'mcp.notification.#'
    );
    
    debugLog('AMQP Client', 'Subscribed to notifications:', {
      queue: notificationQueue.queue,
      exchange: exchangeName,
      pattern: 'mcp.notification.#'
    });
    
    // Set up notification consumer
    await this.channel.consume(notificationQueue.queue, (msg) => {
      if (msg) {
        this.handleNotification(msg);
      }
    }, { noAck: true });
  }

  handleNotification(msg) {
    try {
      // Check message size (S1)
      const sizeCheck = this.validateMessageSize(msg.content);
      if (!sizeCheck.valid) {
        console.error('[AMQP Client] Notification too large:', {
          size: sizeCheck.size,
          limit: sizeCheck.limit
        });
        return;
      }
      
      // Parse raw JSON-RPC directly (C1)
      const parseResult = this.parseMessage(msg.content);
      if (!parseResult.success) {
        console.error('[AMQP Client] Failed to parse notification:', parseResult.error);
        return;
      }
      
      // Validate JSON-RPC format (C3)
      const validation = this.validateJsonRpc(parseResult.message);
      if (!validation.valid) {
        console.warn('[AMQP Client] Invalid JSON-RPC notification:', validation.reason);
        return;
      }
      
      if (this.onmessage) {
        this.onmessage(parseResult.message);
      }
    } catch (error) {
      if (this.onerror) {
        this.onerror(error);
      }
    }
  }

  setupRequestTimeout(correlationId, requestId) {
    const timeoutId = setTimeout(() => {
      this.pendingRequests.delete(correlationId);
      
      // Send timeout error to message handler
      if (this.onmessage) {
        this.onmessage({
          jsonrpc: '2.0',
          id: requestId,
          error: {
            code: -32000,
            message: 'Request timeout',
            data: { timeout: this.options.responseTimeout }
          }
        });
      }
    }, this.options.responseTimeout);
    
    this.pendingRequests.set(correlationId, timeoutId);
  }

  /**
   * Schedule reconnection with proper _closing flag handling (C4, C5)
   */
  scheduleReconnect() {
    // Don't reconnect if closing (C4)
    if (this._closing) {
      debugLog('AMQP Client', 'Not reconnecting - transport is closing');
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
}

module.exports = {
  AMQPClientTransport
};
