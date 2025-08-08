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

const { BaseAMQPTransport } = require('./base-amqp-transport.js');

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
    
    // Private property to hold the actual onmessage handler
    this._onmessage = null;
    
    // Track pending requests for debugging
    this.pendingRequests = new Map();
    
    // MCP Bidirectional Message Routing (as per MCP docs)
    this.streamId = `stream-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    this.requestChannelId = `${this.sessionId}.${this.streamId}.requests`;
    this.responseChannelId = `${this.sessionId}.${this.streamId}.responses`;
    
    // Session ownership registry (for distributed message routing)
    this.sessionOwnership = new Set([this.sessionId]); // This node owns this session
    
    // Routing info storage for response correlation
    this.routingInfoStore = new Map();
    
    // Bidirectional pub/sub channels for proper MCP message routing
    this.pubsubChannel = null;
    this.requestSubscription = null;
    this.responseSubscription = null;
    
    console.log('[AMQP] MCP Session/Stream Management initialized:', {
      sessionId: this.sessionId,
      streamId: this.streamId,
      requestChannel: this.requestChannelId,
      responseChannel: this.responseChannelId,
      ownership: 'local'
    });
  }

  /**
   * Get transport type for logging and identification
   */
  getTransportType() {
    return 'Server';
  }
  
  // Getter and setter for onmessage to add debugging wrapper
  get onmessage() {
    return this._onmessage;
  }
  
  set onmessage(handler) {
    console.log('[AMQP] onmessage handler being set:', {
      hasHandler: typeof handler === 'function',
      handlerName: handler ? handler.name || 'anonymous' : 'null'
    });
    
    if (typeof handler === 'function') {
      this._onmessage = (message) => {
        console.log('[AMQP] onmessage wrapper called, delegating to SDK handler:', {
          messageId: message.id,
          method: message.method,
          timestamp: new Date().toISOString()
        });
        
        // Track this request for timing analysis AND store routing information
        if (message.id) {
          this.pendingRequests.set(message.id, {
            startTime: Date.now(),
            method: message.method,
            correlationId: message._rabbitMQCorrelationId,
            replyTo: message._rabbitMQReplyTo,
            deliveryTag: message._rabbitMQDeliveryTag,
            acknowledged: message._rabbitMQAcknowledged || false
          });
          
          // Set a timer to log if no response is sent within 10 seconds
          setTimeout(() => {
            if (this.pendingRequests.has(message.id)) {
              const req = this.pendingRequests.get(message.id);
              console.warn('[AMQP] No response sent for request within 10 seconds:', {
                messageId: message.id,
                method: req.method,
                elapsedMs: Date.now() - req.startTime,
                correlationId: req.correlationId
              });
            }
          }, 10000);
        }
        
        try {
          const result = handler(message);
          console.log('[AMQP] SDK handler completed successfully');
          return result;
        } catch (error) {
          console.error('[AMQP] SDK handler threw error:', error);
          throw error;
        }
      };
    } else {
      this._onmessage = handler;
    }
  }

  async start() {
    console.log('[AMQP] Starting MCP transport with bidirectional pub/sub routing:', {
      hasOnMessage: typeof this.onmessage === 'function',
      hasOnError: typeof this.onerror === 'function',
      hasOnClose: typeof this.onclose === 'function',
      sessionId: this.sessionId,
      streamId: this.streamId
    });
    
    try {
      await this.connect();
      
      // Set up bidirectional pub/sub channels for MCP message routing
      await this.setupBidirectionalChannels();
      
      this.connectionState.connected = true;
      this.connectionState.reconnectAttempts = 0;
      
      console.log('[AMQP] MCP transport started with bidirectional routing:', {
        hasOnMessage: typeof this.onmessage === 'function',
        connected: this.connectionState.connected,
        requestChannel: this.requestChannelId,
        responseChannel: this.responseChannelId,
        sessionOwnership: Array.from(this.sessionOwnership)
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
    console.log('[AMQP] Transport.send() called:', {
      messageType: this.detectMessageType(message),
      messageId: message.id,
      method: message.method,
      hasResult: !!message.result,
      hasError: !!message.error,
      timestamp: new Date().toISOString()
    });
    
    // Track response timing if this is a response to a tracked request
    if (message.id && this.pendingRequests.has(message.id)) {
      const req = this.pendingRequests.get(message.id);
      console.log('[AMQP] Sending response for tracked request:', {
        messageId: message.id,
        method: req.method,
        responseTimeMs: Date.now() - req.startTime
      });
      this.pendingRequests.delete(message.id);
    }
    
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
   */
  async handleResponseMessage(message, options = {}) {
    console.log('[AMQP] Sending response message:', {
      messageId: message.id,
      hasResult: !!message.result,
      hasError: !!message.error,
      jsonrpc: message.jsonrpc
    });

    // Get routing information from stored routing info (bidirectional flow)
    const routingInfo = this.retrieveRoutingInfo(message.id);
    
    if (!routingInfo) {
      console.error('[AMQP] ❌ No routing information found for response:', message.id);
      throw new Error(`Cannot send response: no routing info for message ID ${message.id}`);
    }

    const { correlationId, replyTo, exchangeName, routingKey, deliveryTag } = routingInfo;

    console.log('[AMQP] Retrieved routing info for response:', {
      messageId: message.id,
      correlationId,
      replyTo,
      exchangeName,
      routingKey
    });

    // Clean message for sending
    const cleanMessage = { ...message };

    console.log('[AMQP] About to send response (first 200 chars):', {
      messageId: cleanMessage.id,
      hasId: cleanMessage.id !== undefined && cleanMessage.id !== null,
      jsonrpc: cleanMessage.jsonrpc,
      hasResult: !!cleanMessage.result,
      hasError: !!cleanMessage.error,
      messagePreview: JSON.stringify(cleanMessage).substring(0, 200) + '...'
    });

    try {
      if (replyTo) {
        // Direct response to client's reply queue using pubsubChannel for bidirectional responses
        console.log('[AMQP] Sending direct response to client queue:', replyTo);
        
        const messageBuffer = Buffer.from(JSON.stringify(cleanMessage));
        
        // Use pubsubChannel for bidirectional message flow
        await this.pubsubChannel.sendToQueue(replyTo, messageBuffer, {
          correlationId,
          persistent: false
        });
        
        console.log('[AMQP] ✅ Direct response sent successfully to queue:', replyTo);
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
   * Find client reply queue based on correlation ID
   * This is a fallback when direct replyTo is not available
   */
  findClientReplyQueue(correlationId) {
    // Extract session ID from correlation ID (format: sessionId-timestamp-random)
    console.log('[AMQP] Attempting to find client reply queue for correlation ID:', correlationId);
    
    if (correlationId && correlationId.includes('-')) {
      const parts = correlationId.split('-');
      if (parts.length >= 3 && parts[0].startsWith('client-')) {
        // Reconstruct session ID from first 3 parts (client-timestamp-random)
        const sessionId = parts.slice(0, 3).join('-');
        console.log('[AMQP] Extracted session ID from correlation ID:', sessionId);
        
        // We don't have direct access to client queues, so return null to use routing key fallback
        return null;
      }
    }
    
    return null; // Will trigger routing key fallback
  }

  /**
   * Handle outgoing request messages (less common for server transport)
   */
  async handleRequestMessage(message, options = {}) {
    console.log('[AMQP] Sending request message:', {
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

      console.log('[AMQP] Request sent successfully');
    } catch (error) {
      console.error('[AMQP] Failed to send request:', error);
      throw error;
    }
  }

  /**
   * Handle notification messages
   */
  async handleNotificationMessage(message, options = {}) {
    console.log('[AMQP] Sending notification message:', {
      method: message.method
    });

    const routingKey = this.getNotificationRoutingKey(message);
    
    try {
      const messageBuffer = Buffer.from(JSON.stringify(message));
      
      await this.channel.publish(this.options.exchangeName, routingKey, messageBuffer, {
        persistent: false,
        timestamp: Date.now()
      });

      console.log('[AMQP] Notification sent successfully');
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
      
      // If the error is related to acknowledgment, attempt channel recovery
      if (error.message.includes('PRECONDITION_FAILED') || error.message.includes('delivery tag')) {
        console.log('[AMQP] Attempting channel recovery due to acknowledgment error...');
        this.scheduleChannelRecovery();
      }
    });

    this.channel.on('close', () => {
      console.log('[AMQP] Channel closed, attempting recovery...');
      this.scheduleChannelRecovery();
    });

    // Create exchange for notifications
    await this.channel.assertExchange(this.options.exchangeName, 'topic', {
      durable: true
    });

    // Create request queue
    await this.channel.assertQueue(this.requestQueue, {
      durable: true,
      arguments: this.getQueueArguments()
    });

    // Set up request queue consumer
    await this.channel.consume(this.requestQueue, (msg) => {
      if (msg) {
        this.handleRequest(msg);
      }
    }, { noAck: false });
  }

  handleRequest(msg) {
    let acknowledged = false;
    
    try {
      const content = JSON.parse(msg.content.toString());
      
      console.log('[AMQP] Processing message content:', {
        correlationId: msg.properties.correlationId,
        replyTo: msg.properties.replyTo,
        contentKeys: Object.keys(content),
        hasEnvelopeMessage: !!content.message,
        directMessageId: content.id,
        directMessageMethod: content.method
      });
      
      // Determine if this is a wrapped envelope or direct JSON-RPC message
      let jsonRpcMessage;
      if (content.message && typeof content.message === 'object') {
        // This is an envelope wrapper - extract the JSON-RPC message
        jsonRpcMessage = content.message;
        console.log('[AMQP] Detected envelope wrapper, extracting message');
      } else if (content.id !== undefined || content.method !== undefined) {
        // This is a direct JSON-RPC message
        jsonRpcMessage = content;
        console.log('[AMQP] Detected direct JSON-RPC message');
      } else {
        throw new Error('Invalid message format: neither envelope nor JSON-RPC');
      }
      
      // Store correlation ID and reply-to for response routing
      if (jsonRpcMessage && typeof jsonRpcMessage === 'object') {
        jsonRpcMessage._rabbitMQCorrelationId = msg.properties.correlationId;
        jsonRpcMessage._rabbitMQReplyTo = msg.properties.replyTo;
        
        // Store only essential data for deferred acknowledgment to avoid circular references
        jsonRpcMessage._rabbitMQDeliveryTag = msg.fields.deliveryTag;
        jsonRpcMessage._rabbitMQAcknowledged = false;
      }
      
      if (this.onmessage) {
        console.log('[AMQP] Calling onmessage handler with JSON-RPC message:', {
          messageId: jsonRpcMessage.id,
          method: jsonRpcMessage.method
        });
        this.onmessage(jsonRpcMessage);
      } else {
        console.warn('[AMQP] No onmessage handler set!');
        // Acknowledge immediately if no handler
        this.safeAck(msg);
        acknowledged = true;
      }
      
    } catch (error) {
      console.error('[AMQP] Error handling request:', error);
      if (this.onerror) {
        this.onerror(error);
      }
      
      // Safe negative acknowledgment for errors
      this.safeNack(msg);
      acknowledged = true;
    }
  }

  safeAck(msg) {
    if (this.channel && !this.channel.closing) {
      try {
        this.channel.ack(msg);
      } catch (ackError) {
        console.warn('[AMQP] Failed to acknowledge message:', ackError.message);
      }
    }
  }

  safeAckByTag(deliveryTag) {
    if (this.channel && !this.channel.closing) {
      try {
        this.channel.ack({ fields: { deliveryTag } });
      } catch (ackError) {
        console.warn('[AMQP] Failed to acknowledge message by tag:', ackError.message);
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

  scheduleChannelRecovery() {
    // Prevent multiple recovery attempts
    if (this.channelRecovering) {
      return;
    }

    this.channelRecovering = true;

    setTimeout(async () => {
      try {
        if (this.connection && !this.connection.closing) {
          // Recreate channel
          this.channel = await this.connection.createChannel();
          
          if (this.options.prefetchCount) {
            await this.channel.prefetch(this.options.prefetchCount);
          }

          // Re-setup channel error handling
          this.channel.on('error', (error) => {
            console.warn('[AMQP] Channel error:', error.message);
            if (this.onerror) {
              this.onerror(error);
            }
            if (error.message.includes('PRECONDITION_FAILED') || error.message.includes('delivery tag')) {
              console.log('[AMQP] Attempting channel recovery due to acknowledgment error...');
              this.scheduleChannelRecovery();
            }
          });

          this.channel.on('close', () => {
            console.log('[AMQP] Channel closed, attempting recovery...');
            this.scheduleChannelRecovery();
          });

          // Re-create exchange and queues
          await this.channel.assertExchange(this.options.exchangeName, 'topic', {
            durable: true
          });

          await this.channel.assertQueue(this.requestQueue, {
            durable: true,
            arguments: this.getQueueArguments()
          });

          // Re-setup consumer
          await this.channel.consume(this.requestQueue, (msg) => {
            if (msg) {
              this.handleRequest(msg);
            }
          }, { noAck: false });

          console.log('[AMQP] Channel recovery completed successfully');
        }
      } catch (error) {
        console.error('[AMQP] Channel recovery failed:', error.message);
        // Fall back to full reconnection
        this.scheduleReconnect();
      } finally {
        this.channelRecovering = false;
      }
    }, 1000); // 1 second delay
  }
  /**
   * Store routing information for response correlation
   */
  storeRoutingInfo(messageId, routingInfo) {
    this.routingInfoStore.set(messageId, routingInfo);
    console.log('[AMQP] Stored routing info for message ID:', messageId, routingInfo);
  }

  /**
   * Retrieve and remove routing information for response correlation
   */
  retrieveRoutingInfo(messageId) {
    const info = this.routingInfoStore.get(messageId);
    if (info) {
      this.routingInfoStore.delete(messageId);
      console.log('[AMQP] Retrieved routing info for message ID:', messageId, info);
    }
    return info;
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

  getNotificationRoutingKey(message) {
    // Extract method name for routing key
    if (message.method) {
      // Convert method name to routing key format for discovery tools
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

  /**
   * Set up bidirectional pub/sub channels for MCP message routing
   * Implements the pattern from MCP docs for distributed message routing
   */
  async setupBidirectionalChannels() {
    console.log('[AMQP] Setting up MCP bidirectional pub/sub channels...');
    
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
    
    // Create response routing queue (for outgoing responses from this session)
    const responseQueueName = `${this.options.queuePrefix}.responses.${this.sessionId}`;
    const responseQueue = await this.pubsubChannel.assertQueue(responseQueueName, {
      durable: false,
      exclusive: true,
      autoDelete: true,
      arguments: {
        'x-message-ttl': this.options.messageTTL,
        'x-expires': this.options.queueTTL
      }
    });
    
    // Set up request consumption (incoming messages for this session)
    this.requestSubscription = await this.pubsubChannel.consume(requestQueue.queue, async (msg) => {
      if (!msg) return;
      
      try {
        await this.handleBidirectionalRequest(msg, exchangeName);
      } catch (error) {
        console.error('[AMQP] Error handling bidirectional request:', error);
        this.pubsubChannel.nack(msg, false, false); // Don't requeue on error
      }
    }, {
      noAck: false
    });
    
    // Register this session ownership in the distributed registry
    await this.registerSessionOwnership(exchangeName);
    
    console.log('[AMQP] MCP bidirectional channels setup complete:', {
      exchange: exchangeName,
      requestQueue: requestQueue.queue,
      responseQueue: responseQueue.queue,
      requestChannel: this.requestChannelId,
      responseChannel: this.responseChannelId,
      sessionOwnership: Array.from(this.sessionOwnership)
    });
  }

  /**
   * Handle incoming requests via bidirectional routing
   */
  async handleBidirectionalRequest(msg, exchangeName) {
    const routingKey = msg.fields.routingKey;
    const correlationId = msg.properties.correlationId;
    const replyTo = msg.properties.replyTo;
    
    console.log('[AMQP] Handling bidirectional request:', {
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
      console.error('[AMQP] Invalid JSON in bidirectional request:', error);
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
      console.error('[AMQP] Invalid message format in bidirectional request');
      this.pubsubChannel.nack(msg, false, false);
      return;
    }

    // Ensure proper JSON-RPC format for MCP SDK
    if (!jsonRpcMessage.jsonrpc) {
      jsonRpcMessage.jsonrpc = "2.0";
    }
    
    // Store routing information for response correlation (CRITICAL for send() method)
    this.storeRoutingInfo(jsonRpcMessage.id, {
      correlationId,
      replyTo,
      exchangeName,
      routingKey,
      deliveryTag: msg.fields.deliveryTag
    });
    
    // Delegate to MCP SDK handler - SDK will call transport.send() for responses
    if (this.onmessage) {
      console.log('[AMQP] Forwarding to MCP SDK via onmessage handler:', {
        messageId: jsonRpcMessage.id,
        method: jsonRpcMessage.method,
        jsonrpc: jsonRpcMessage.jsonrpc,
        hasParams: !!jsonRpcMessage.params,
        sessionId: this.sessionId,
        streamId: this.streamId,
        fullMessage: JSON.stringify(jsonRpcMessage)
      });
      
      // Forward to SDK with extra context - SDK will process and call transport.send() with response
      this.onmessage(jsonRpcMessage, {
        correlationId: correlationId,
        replyTo: replyTo,
        routingKey: routingKey,
        sessionId: this.sessionId,
        streamId: this.streamId
      });
      
      // Acknowledge receipt - response will be sent via transport.send()
      this.pubsubChannel.ack(msg);
    } else {
      console.warn('[AMQP] No onmessage handler for bidirectional request!');
      this.pubsubChannel.ack(msg);
    }
  }

  /**
   * Register session ownership for distributed message routing
   */
  async registerSessionOwnership(exchangeName) {
    const ownershipMessage = {
      type: 'session_ownership',
      sessionId: this.sessionId,
      streamId: this.streamId,
      nodeId: process.env.NODE_ID || 'default',
      timestamp: Date.now(),
      ownership: 'local'
    };
    
    const ownershipRoutingKey = `mcp.session.ownership.${this.sessionId}`;
    
    await this.pubsubChannel.publish(
      exchangeName,
      ownershipRoutingKey,
      Buffer.from(JSON.stringify(ownershipMessage)),
      {
        persistent: false,
        timestamp: Date.now()
      }
    );
    
    console.log('[AMQP] Session ownership registered:', {
      sessionId: this.sessionId,
      routingKey: ownershipRoutingKey,
      exchange: exchangeName
    });
  }
}

module.exports = {
  RabbitMQServerTransport
};
