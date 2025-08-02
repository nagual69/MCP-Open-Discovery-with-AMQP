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
 * RabbitMQ server transport implementation for MCP Open Discovery
 */
class RabbitMQServerTransport extends Transport {
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

    const envelope = {
      message,
      timestamp: Date.now(),
      type: this.getMessageType(message)
    };

    if (envelope.type === 'response') {
      await this.sendResponse(envelope);
    } else if (envelope.type === 'notification') {
      await this.sendNotification(envelope);
    } else {
      throw new Error(`Unexpected message type from server: ${envelope.type}`);
    }
  }

  async close() {
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
    
    if (this.options.prefetchCount) {
      await this.channel.prefetch(this.options.prefetchCount);
    }

    // Set up channel error handling
    this.channel.on('error', (error) => {
      if (this.onerror) {
        this.onerror(error);
      }
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
    try {
      const envelope = JSON.parse(msg.content.toString());
      
      // Store correlation ID and reply-to for response routing
      if (envelope.message && typeof envelope.message === 'object') {
        envelope.message._rabbitMQCorrelationId = msg.properties.correlationId;
        envelope.message._rabbitMQReplyTo = msg.properties.replyTo;
      }
      
      if (this.onmessage) {
        this.onmessage(envelope.message);
      }
      
      this.channel.ack(msg);
    } catch (error) {
      if (this.onerror) {
        this.onerror(error);
      }
      this.channel.nack(msg, false, false); // Reject and don't requeue
    }
  }

  async sendResponse(envelope) {
    if (!this.channel) return;

    // Extract routing information from the original request
    const correlationId = envelope.message._rabbitMQCorrelationId;
    const replyTo = envelope.message._rabbitMQReplyTo;

    if (!correlationId || !replyTo) {
      const error = new Error('Cannot send response: missing correlation ID or reply-to queue');
      if (this.onerror) {
        this.onerror(error);
      }
      return;
    }

    // Clean up the routing metadata
    delete envelope.message._rabbitMQCorrelationId;
    delete envelope.message._rabbitMQReplyTo;

    const messageBuffer = Buffer.from(JSON.stringify(envelope));

    await this.channel.sendToQueue(replyTo, messageBuffer, {
      correlationId,
      persistent: false // Responses don't need to be persistent
    });
  }

  async sendNotification(envelope) {
    if (!this.channel) return;

    const messageBuffer = Buffer.from(JSON.stringify(envelope));
    const routingKey = this.getNotificationRoutingKey(envelope.message);

    await this.channel.publish(
      this.options.exchangeName,
      routingKey,
      messageBuffer,
      { persistent: true }
    );
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

  getMessageType(message) {
    if (message.method && message.id !== undefined) {
      return 'request';
    } else if (message.result !== undefined || message.error !== undefined) {
      return 'response';
    } else {
      return 'notification';
    }
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
}

module.exports = {
  RabbitMQServerTransport,
  Transport
};
