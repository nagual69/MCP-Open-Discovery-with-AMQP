/**
 * AMQP Server Transport for MCP - Fixed Implementation
 * 
 * This transport follows the same pattern as StreamableHTTPServerTransport,
 * implementing a complete request-response cycle internally rather than
 * expecting the MCP SDK to call transport.send() for responses.
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
 * Fixed AMQP server transport implementation for MCP
 * Follows the HTTP transport pattern with internal request-response handling
 */
class AmqpServerTransport extends Transport {
  constructor(options) {
    super();
    
    // Validate required options
    if (!options.amqpUrl) {
      throw new Error('amqpUrl is required');
    }
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
    
    this.connection = null;
    this.channel = null;
    this.requestQueue = `${this.options.queuePrefix}.requests`;
    this.channelRecovering = false;
    this.connectionState = {
      connected: false,
      reconnectAttempts: 0,
      lastError: null
    };
    
    // Session ID for MCP Transport interface compliance
    this.sessionId = `amqp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    // MCP Bidirectional Message Routing
    this.streamId = `stream-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    this.requestChannelId = `${this.sessionId}.${this.streamId}.requests`;
    this.responseChannelId = `${this.sessionId}.${this.streamId}.responses`;
    
    // Bidirectional pub/sub channels for proper MCP message routing
    this.pubsubChannel = null;
    this.requestSubscription = null;
    
    console.log('[AMQP Fixed] MCP Session/Stream Management initialized:', {
      sessionId: this.sessionId,
      streamId: this.streamId,
      requestChannel: this.requestChannelId,
      responseChannel: this.responseChannelId,
      ownership: 'local'
    });
  }

  async start() {
    console.log('[AMQP Fixed] Starting MCP transport with bidirectional routing...');
    
    try {
      await this.connect();
      
      // Set up bidirectional pub/sub channels for MCP message routing
      await this.setupBidirectionalChannels();
      
      this.connectionState.connected = true;
      this.connectionState.reconnectAttempts = 0;
      
      console.log('[AMQP Fixed] MCP transport started with bidirectional routing:', {
        connected: this.connectionState.connected,
        requestChannel: this.requestChannelId,
        responseChannel: this.responseChannelId
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
   * Handle AMQP request similar to HTTP transport's handleRequest
   * This is the key method that completes the request-response cycle internally
   */
  async handleAmqpRequest(msg, exchangeName) {
    const routingKey = msg.fields.routingKey;
    const correlationId = msg.properties.correlationId;
    const replyTo = msg.properties.replyTo;
    
    console.log('[AMQP Fixed] Handling AMQP request (internal cycle):', {
      routingKey,
      correlationId,
      replyTo,
      sessionId: this.sessionId,
      streamId: this.streamId
    });
    
    let content;
    try {
      content = JSON.parse(msg.content.toString());
    } catch (error) {
      console.error('[AMQP Fixed] Invalid JSON in request:', error);
      this.pubsubChannel.nack(msg, false, false);
      return;
    }
    
    // Extract JSON-RPC message
    let jsonRpcMessage;
    if (content.message && typeof content.message === 'object') {
      jsonRpcMessage = content.message;
    } else if (content.id !== undefined || content.method !== undefined) {
      jsonRpcMessage = content;
    } else {
      console.error('[AMQP Fixed] Invalid message format in request');
      this.pubsubChannel.nack(msg, false, false);
      return;
    }
    
    console.log('[AMQP Fixed] Processing JSON-RPC request internally:', {
      messageId: jsonRpcMessage.id,
      method: jsonRpcMessage.method
    });
    
    try {
      // CRITICAL FIX: Don't call mcpServer.handleRequest() directly
      // Instead, use the transport's onmessage mechanism like HTTP transport does
      // This allows the MCP SDK to handle the request and call transport.send() for responses
      
      if (!this.onmessage) {
        throw new Error('Transport onmessage handler not set');
      }
      
      // Store correlation and routing info for response sending
      jsonRpcMessage._amqpCorrelationId = correlationId;
      jsonRpcMessage._amqpReplyTo = replyTo;
      jsonRpcMessage._amqpExchangeName = exchangeName;
      
      console.log('[AMQP Fixed] Forwarding to MCP SDK via onmessage handler');
      
      // Forward to MCP SDK - this should trigger the SDK to eventually call transport.send()
      this.onmessage(jsonRpcMessage);
      
      // Acknowledge the message now that we've forwarded it to the SDK
      this.pubsubChannel.ack(msg);
      
      console.log('[AMQP Fixed] Message forwarded to SDK and acknowledged');
      
    } catch (error) {
      console.error('[AMQP Fixed] Error processing request:', error);
      
      // Send error response
      const errorResponse = {
        jsonrpc: '2.0',
        id: jsonRpcMessage.id,
        error: {
          code: -32603,
          message: 'Internal error',
          data: error.message
        }
      };
      
      try {
        await this.sendResponseMessage(errorResponse, correlationId, replyTo, exchangeName);
      } catch (sendError) {
        console.error('[AMQP Fixed] Failed to send error response:', sendError);
      }
      
      // Acknowledge the original request even on error to prevent redelivery
      this.pubsubChannel.ack(msg);
    }
  }

  /**
   * Send response message back to client
   */
  async sendResponseMessage(response, correlationId, replyTo, exchangeName) {
    if (!correlationId || !replyTo) {
      throw new Error('Cannot send response: missing correlation ID or reply-to');
    }

    console.log('[AMQP Fixed] Sending response message:', {
      correlationId,
      replyTo,
      responseId: response.id,
      hasResult: !!response.result,
      hasError: !!response.error
    });

    try {
      const messageBuffer = Buffer.from(JSON.stringify(response));

      // Send response back via the reply-to queue
      await this.pubsubChannel.sendToQueue(replyTo, messageBuffer, {
        correlationId,
        persistent: false
      });

      console.log('[AMQP Fixed] Response sent successfully');
    } catch (error) {
      console.error('[AMQP Fixed] Failed to send response:', error);
      throw error;
    }
  }

  /**
   * Send method required by MCP SDK Transport interface
   * This is called by the MCP SDK to send responses back to clients
   */
  async send(message, options = {}) {
    console.log('[AMQP Fixed] Transport.send() called by MCP SDK:', {
      messageType: this.getMessageType(message),
      messageId: message.id,
      method: message.method,
      hasResult: !!message.result,
      hasError: !!message.error,
      hasAmqpCorrelationId: !!message._amqpCorrelationId,
      hasAmqpReplyTo: !!message._amqpReplyTo
    });

    if (!this.channel) {
      throw new Error('Transport not connected');
    }

    const messageType = this.getMessageType(message);
    
    if (messageType === 'response') {
      // Handle responses - check if this is an AMQP response with routing info
      if (message._amqpCorrelationId && message._amqpReplyTo) {
        console.log('[AMQP Fixed] Sending AMQP response with stored routing info');
        return this.sendAmqpResponse(message, options);
      } else {
        console.log('[AMQP Fixed] Response missing AMQP routing info, using fallback');
        return this.sendNotification(message, options);
      }
    } else if (messageType === 'notification') {
      // Handle outgoing notifications
      return this.sendNotification(message, options);
    } else if (messageType === 'request') {
      // Handle outgoing requests (server-to-client)
      return this.sendRequest(message, options);
    } else {
      console.warn('[AMQP Fixed] Unknown message type:', messageType);
    }
  }

  /**
   * Send AMQP response using stored correlation info
   */
  async sendAmqpResponse(message, options = {}) {
    const correlationId = message._amqpCorrelationId;
    const replyTo = message._amqpReplyTo;
    
    console.log('[AMQP Fixed] Sending AMQP response:', {
      correlationId,
      replyTo,
      responseId: message.id,
      hasResult: !!message.result,
      hasError: !!message.error
    });

    // Clean up the routing metadata before sending
    const cleanMessage = { ...message };
    delete cleanMessage._amqpCorrelationId;
    delete cleanMessage._amqpReplyTo;
    delete cleanMessage._amqpExchangeName;

    try {
      const messageBuffer = Buffer.from(JSON.stringify(cleanMessage));

      // Send response back via the reply-to queue
      await this.pubsubChannel.sendToQueue(replyTo, messageBuffer, {
        correlationId,
        persistent: false
      });

      console.log('[AMQP Fixed] AMQP response sent successfully via SDK send() method');
    } catch (error) {
      console.error('[AMQP Fixed] Failed to send AMQP response:', error);
      throw error;
    }
  }

  async sendNotification(message, options = {}) {
    console.log('[AMQP Fixed] Sending notification:', {
      method: message.method
    });

    const routingKey = this.getNotificationRoutingKey(message);
    
    try {
      const messageBuffer = Buffer.from(JSON.stringify(message));
      
      await this.channel.publish(this.options.exchangeName, routingKey, messageBuffer, {
        persistent: false,
        timestamp: Date.now()
      });

      console.log('[AMQP Fixed] Notification sent successfully');
    } catch (error) {
      console.error('[AMQP Fixed] Failed to send notification:', error);
      throw error;
    }
  }

  async sendRequest(message, options = {}) {
    console.log('[AMQP Fixed] Sending request:', {
      method: message.method,
      messageId: message.id
    });

    const routingKey = 'requests.general';
    
    try {
      const messageBuffer = Buffer.from(JSON.stringify(message));
      
      await this.channel.publish(this.options.exchangeName, routingKey, messageBuffer, {
        persistent: true,
        timestamp: Date.now(),
        correlationId: message.id
      });

      console.log('[AMQP Fixed] Request sent successfully');
    } catch (error) {
      console.error('[AMQP Fixed] Failed to send request:', error);
      throw error;
    }
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
    console.warn('[AMQP Fixed] Unknown message type, treating as notification:', message);
    return 'notification';
  }

  // Legacy compatibility method
  getMessageType(message) {
    return this.detectMessageType(message);
  }

  async close() {
    this.connectionState.connected = false;
    
    try {
      if (this.pubsubChannel) {
        await this.pubsubChannel.close();
        this.pubsubChannel = null;
      }
      
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

    // Create main channel for general operations
    this.channel = await this.connection.createChannel();
    
    if (this.options.prefetchCount) {
      await this.channel.prefetch(this.options.prefetchCount);
    }

    // Set up channel error handling
    this.channel.on('error', (error) => {
      console.warn('[AMQP Fixed] Channel error:', error.message);
      if (this.onerror) {
        this.onerror(error);
      }
    });

    this.channel.on('close', () => {
      console.log('[AMQP Fixed] Channel closed, attempting recovery...');
      this.scheduleChannelRecovery();
    });

    // Create exchange for notifications
    await this.channel.assertExchange(this.options.exchangeName, 'topic', {
      durable: true
    });
  }

  /**
   * Set up bidirectional pub/sub channels for MCP message routing
   */
  async setupBidirectionalChannels() {
    console.log('[AMQP Fixed] Setting up MCP bidirectional pub/sub channels...');
    
    // Create separate channel for pub/sub operations
    this.pubsubChannel = await this.connection.createChannel();
    
    // Create topic exchange for bidirectional message routing
    const exchangeName = `${this.options.exchangeName}.mcp.routing`;
    await this.pubsubChannel.assertExchange(exchangeName, 'topic', {
      durable: true,
      autoDelete: false
    });
    
    // Create request routing queue (for incoming requests to this session)
    const requestQueueName = `${this.options.queuePrefix}.requests.${this.sessionId}`;
    const requestQueue = await this.pubsubChannel.assertQueue(requestQueueName, {
      durable: false,
      exclusive: true,
      autoDelete: true,
      arguments: {
        'x-message-ttl': this.options.messageTTL,
        'x-expires': this.options.queueTTL
      }
    });
    
    // Bind request queue to listen for messages directed to this session
    await this.pubsubChannel.bindQueue(requestQueue.queue, exchangeName, this.requestChannelId);
    await this.pubsubChannel.bindQueue(requestQueue.queue, exchangeName, `${this.sessionId}.*`);
    
    // Also bind to general MCP request patterns for load balancing
    const mcpRequestPatterns = [
      'mcp.request.#',
      'mcp.tools.#',
      'mcp.resources.#',
      'mcp.prompts.#'
    ];
    
    for (const pattern of mcpRequestPatterns) {
      await this.pubsubChannel.bindQueue(requestQueue.queue, exchangeName, pattern);
    }
    
    // Set up request consumption (incoming messages for this session)
    this.requestSubscription = await this.pubsubChannel.consume(requestQueue.queue, async (msg) => {
      if (!msg) return;
      
      try {
        // Use the internal handleAmqpRequest method
        await this.handleAmqpRequest(msg, exchangeName);
      } catch (error) {
        console.error('[AMQP Fixed] Error handling bidirectional request:', error);
        this.pubsubChannel.nack(msg, false, false);
      }
    }, {
      noAck: false
    });
    
    console.log('[AMQP Fixed] MCP bidirectional channels setup complete:', {
      exchange: exchangeName,
      requestQueue: requestQueue.queue,
      requestChannel: this.requestChannelId,
      responseChannel: this.responseChannelId
    });
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
        await this.setupBidirectionalChannels();
        this.connectionState.connected = true;
        this.connectionState.reconnectAttempts = 0;
      } catch (error) {
        this.connectionState.lastError = error;
        this.scheduleReconnect();
      }
    }, this.options.reconnectDelay);
  }

  scheduleChannelRecovery() {
    if (this.channelRecovering) {
      return;
    }

    this.channelRecovering = true;

    setTimeout(async () => {
      try {
        if (this.connection && !this.connection.closing) {
          await this.connect();
          await this.setupBidirectionalChannels();
          console.log('[AMQP Fixed] Channel recovery completed successfully');
        }
      } catch (error) {
        console.error('[AMQP Fixed] Channel recovery failed:', error.message);
        this.scheduleReconnect();
      } finally {
        this.channelRecovering = false;
      }
    }, 1000);
  }

  getNotificationRoutingKey(message) {
    if (message.method) {
      const method = message.method;
      
      // Map MCP Open Discovery tool categories to routing keys
      if (method.startsWith('nmap_')) {
        return 'discovery.nmap';
      } else if (method.startsWith('snmp_')) {
        return 'discovery.snmp';
      } else if (method.startsWith('proxmox_')) {
        return 'discovery.proxmox';
      } else if (method.startsWith('zabbix_')) {
        return 'discovery.zabbix';
      } else if (['ping', 'telnet', 'wget', 'netstat', 'ifconfig', 'arp', 'route'].includes(method)) {
        return 'discovery.network';
      } else if (method.startsWith('memory_') || method.startsWith('cmdb_')) {
        return 'discovery.memory';
      } else if (method.startsWith('creds_')) {
        return 'discovery.credentials';
      } else {
        return 'discovery.general';
      }
    }
    
    return 'notifications.general';
  }
}

module.exports = {
  AmqpServerTransport,
  Transport
};
