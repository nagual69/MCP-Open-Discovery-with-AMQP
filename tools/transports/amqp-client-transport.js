/**
 * AMQP Client Transport for MCP Open Discovery Server
 * 
 * This transport enables MCP clients to connect to the MCP Open Discovery Server
 * through RabbitMQ/AMQP message queues for distributed network discovery operations.
 */

/**
 * Transport interface (compatible with MCP SDK)
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
 * AMQP client transport for connecting to MCP Open Discovery Server
 */
class AMQPClientTransport extends Transport {
  constructor(options) {
    super();
    
    // Validate required options
    if (!options.amqpUrl) {
      throw new Error('amqpUrl is required');
    }
    if (!options.serverQueuePrefix) {
      throw new Error('serverQueuePrefix is required');
    }
    if (!options.exchangeName) {
      throw new Error('exchangeName is required');
    }
    
    this.options = {
      responseTimeout: 30000,
      reconnectDelay: 5000,
      maxReconnectAttempts: 10,
      ...options
    };
    
    // Generate unique session ID for MCP bidirectional routing
    this.sessionId = `client-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    this.connection = null;
    this.channel = null;
    this.responseQueue = null;
    this.pendingRequests = new Map();
    this.connectionState = {
      connected: false,
      reconnectAttempts: 0,
      lastError: null
    };
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

  async close() {
    this.connectionState.connected = false;
    
    // Clear all pending requests
    for (const [correlationId, timeoutId] of this.pendingRequests) {
      clearTimeout(timeoutId);
    }
    this.pendingRequests.clear();
    
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
    }
    
    if (this.onclose) {
      this.onclose();
    }
  }

  async connect() {
    // Dynamic import to handle environments where amqplib might not be available
    let amqp;
    try {
      amqp = require('amqplib');
    } catch (error) {
      throw new Error('amqplib package not found. Please install with: npm install amqplib');
    }
    
    // Create connection
    this.connection = await amqp.connect(this.options.amqpUrl);
    
    // Set up connection error handling
    this.connection.on('error', (error) => {
      this.connectionState.connected = false;
      this.connectionState.lastError = error;
      if (this.onerror) {
        this.onerror(error);
      }
      this.scheduleReconnect();
    });

    this.connection.on('close', () => {
      this.connectionState.connected = false;
      this.scheduleReconnect();
    });

    // Create channel
    this.channel = await this.connection.createChannel();

    // Set up channel error handling
    this.channel.on('error', (error) => {
      console.error('[AMQP Client] Channel error:', error);
      if (this.onerror) {
        this.onerror(error);
      }
    });

    // Assert the MCP bidirectional routing exchange (needed for new routing system)
    const mcpExchangeName = `${this.options.exchangeName}.mcp.routing`;
    await this.channel.assertExchange(mcpExchangeName, 'topic', {
      durable: true
    });

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
   * - Response: Has 'id' and ('result' OR 'error')
   * - Request: Has 'id' and 'method' (but no result/error)
   * - Notification: Has 'method' but no 'id'
   */
  detectMessageType(message) {
    // Priority 1: Check for response (id + result/error)
    if (message.id !== undefined && (message.result !== undefined || message.error !== undefined)) {
      return 'response';
    }
    
    // Priority 2: Check for request (id + method, but no result/error)
    if (message.id !== undefined && message.method !== undefined) {
      return 'request';
    }
    
    // Priority 3: Check for notification (method only, no id)
    if (message.method !== undefined && message.id === undefined) {
      return 'notification';
    }
    
    // Fallback for malformed messages
    console.warn('[AMQP Client] Unknown message type, treating as notification:', message);
    return 'notification';
  }

  // Legacy compatibility method
  getMessageType(message) {
    return this.detectMessageType(message);
  }

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

  /**
   * Determine tool category for routing (matches server-side categories)
   */
  getToolCategory(method) {
    if (method.startsWith('nmap_')) return 'nmap';
    if (method.startsWith('snmp_')) return 'snmp';
    if (method.startsWith('proxmox_')) return 'proxmox';
    if (method.startsWith('zabbix_')) return 'zabbix';
    if (['ping', 'telnet', 'wget', 'netstat', 'ifconfig', 'arp', 'route', 'nslookup'].includes(method)) return 'network';
    if (method.startsWith('memory_') || method.startsWith('cmdb_')) return 'memory';
    if (method.startsWith('credentials_')) return 'credentials';
    if (method.startsWith('registry_')) return 'registry';
    return 'general';
  }

  generateCorrelationId() {
    // Include session ID in correlation ID so server can route responses back
    return `${this.sessionId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}

module.exports = {
  AMQPClientTransport,
  Transport
};
