/**
 * AMQP Client Transport for MCP Open Discovery Server
 * 
 * This transport enables MCP clients to connect to the MCP Open Discovery Server
 * through RabbitMQ/AMQP message queues for distributed network discovery operations.
 */

const { BaseAMQPTransport } = require('./base-amqp-transport.js');

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

    console.log('[AMQP Client] Sending message:', {
      messageId: message.id,
      method: message.method,
      messageType: this.getMessageType(message)
    });

    // Create envelope with correlation ID for response routing
    const correlationId = this.generateCorrelationId();
    
    const envelope = {
      message,
      timestamp: Date.now(),
      type: this.getMessageType(message),
      correlationId: correlationId
    };

    // For requests, set up response handling
    if (envelope.type === 'request' && message.id !== undefined) {
      envelope.replyTo = this.responseQueue;
      this.setupRequestTimeout(correlationId, message.id);
      
      console.log('[AMQP Client] Set up request tracking:', {
        messageId: message.id,
        correlationId: correlationId,
        replyTo: this.responseQueue,
        timeoutMs: this.options.responseTimeout
      });
    }

    // Send to the NEW bidirectional routing system instead of legacy direct queue
    const exchangeName = `${this.options.exchangeName}.mcp.routing`;
    const routingKey = this.getMcpRoutingKey(message);
    const messageBuffer = Buffer.from(JSON.stringify(envelope));

    console.log('[AMQP Client] Publishing to MCP bidirectional routing (NEW SYSTEM):', {
      exchange: exchangeName,
      routingKey: routingKey,
      messageId: message.id,
      method: message.method,
      correlationId: correlationId,
      replyTo: envelope.replyTo
    });

    await this.channel.publish(exchangeName, routingKey, messageBuffer, {
      correlationId: correlationId,
      replyTo: envelope.replyTo,
      persistent: false,
      timestamp: envelope.timestamp
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

    // Assert the MCP bidirectional routing exchange (needed for new routing system)
    const mcpExchangeName = `${this.options.exchangeName}.mcp.routing`;
    await this.assertExchange(mcpExchangeName, 'topic');

    // Create exclusive response queue for this client session  
    const responseQueueResult = await this.channel.assertQueue('', {
      exclusive: true,
      autoDelete: true
    });
    this.responseQueue = responseQueueResult.queue;

    console.log('[AMQP Client] Created response queue:', {
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
      const correlationId = msg.properties.correlationId;
      
      console.log('[AMQP Client] Received response:', {
        correlationId,
        hasContent: !!msg.content,
        contentLength: msg.content ? msg.content.length : 0
      });
      
      // Parse the response - should be direct JSON-RPC now, not envelope
      let response;
      try {
        response = JSON.parse(msg.content.toString());
        console.log('[AMQP Client] Parsed response structure:', {
          hasId: response.id !== undefined && response.id !== null,
          hasJsonrpc: !!response.jsonrpc,
          hasResult: !!response.result,
          hasError: !!response.error,
          resultKeys: response.result ? Object.keys(response.result).slice(0, 5) : null,
          responseKeys: Object.keys(response),
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
        console.log('[AMQP Client] ✅ Response received for correlation ID:', correlationId);
      } else {
        console.warn('[AMQP Client] ⚠️ Received response for unknown correlation ID:', correlationId);
      }
      
      // Forward response directly to MCP client (no envelope unwrapping needed)
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
    
    // Bind to MCP notification routing keys
    const mcpExchangeName = `${this.options.exchangeName}.mcp.routing`;
    const routingKeys = [
      'mcp.notification.#',
      'mcp.event.#',
      'discovery.notification.#',
      'discovery.event.#'
    ];
    
    for (const routingKey of routingKeys) {
      await this.channel.bindQueue(
        notificationQueue.queue,
        mcpExchangeName,
        routingKey
      );
    }
    
    // Set up notification consumer
    await this.channel.consume(notificationQueue.queue, (msg) => {
      if (msg) {
        this.handleNotification(msg);
      }
    }, { noAck: true });
  }

  handleNotification(msg) {
    try {
      const envelope = JSON.parse(msg.content.toString());
      
      if (this.onmessage) {
        this.onmessage(envelope.message);
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

  scheduleReconnect() {
    if (this.connectionState.reconnectAttempts >= this.options.maxReconnectAttempts) {
      const error = new Error('Maximum reconnection attempts exceeded');
      if (this.onerror) {
        this.onerror(error);
      }
      return;
    }

    this.connectionState.reconnectAttempts++;
    
    setTimeout(async () => {
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
   * Detect message type following MCP v2025-06-18 specification
   * 
   * JSON-RPC 2.0 message type detection:
  getTargetQueueName(message) {
    // Legacy method - kept for reference but not used in MCP bidirectional routing
    return `${this.options.serverQueuePrefix}.requests`;
  }

  /**
   * Get MCP routing key for bidirectional message routing
   * Implements the MCP session/stream-based routing pattern
   */
  getMcpRoutingKey(message) {
    // For client-to-server requests, we need to route to any available server session
    // Use a general routing pattern that servers can bind to
    if (message.method) {
      // Route based on tool category for load balancing
      const toolCategory = this.getToolCategory(message.method);
      return `mcp.request.${toolCategory}.${message.method}`;
    }
    
    // Fallback for other message types
    return 'mcp.request.general';
  }
}

module.exports = {
  AMQPClientTransport
};
