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
 * RabbitMQ client transport for connecting to MCP Open Discovery Server
 */
class RabbitMQClientTransport extends Transport {
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

    const envelope = {
      message,
      timestamp: Date.now(),
      type: this.getMessageType(message),
      correlationId: this.generateCorrelationId()
    };

    // For requests, set up response handling
    if (envelope.type === 'request' && message.id !== undefined) {
      envelope.replyTo = this.responseQueue;
      this.setupRequestTimeout(envelope.correlationId, message.id);
    }

    const targetQueue = this.getTargetQueueName(message);
    const messageBuffer = Buffer.from(JSON.stringify(envelope));

    await this.channel.sendToQueue(targetQueue, messageBuffer, {
      correlationId: envelope.correlationId,
      replyTo: envelope.replyTo,
      persistent: true,
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
      if (this.onerror) {
        this.onerror(error);
      }
    });

    // Create exclusive response queue for this client
    const responseQueueResult = await this.channel.assertQueue('', {
      exclusive: true,
      autoDelete: true
    });
    this.responseQueue = responseQueueResult.queue;

    // Set up response queue consumer
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
      const envelope = JSON.parse(msg.content.toString());
      const correlationId = msg.properties.correlationId;
      
      // Clear timeout for this request
      if (this.pendingRequests.has(correlationId)) {
        clearTimeout(this.pendingRequests.get(correlationId));
        this.pendingRequests.delete(correlationId);
      }
      
      if (this.onmessage) {
        this.onmessage(envelope.message);
      }
    } catch (error) {
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
    
    // Bind to discovery-related routing keys
    const routingKeys = [
      'discovery.nmap',
      'discovery.snmp', 
      'discovery.proxmox',
      'discovery.zabbix',
      'discovery.network',
      'discovery.memory',
      'discovery.credentials',
      'discovery.general',
      'notifications.#'
    ];
    
    for (const routingKey of routingKeys) {
      await this.channel.bindQueue(
        notificationQueue.queue,
        this.options.exchangeName,
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

  getMessageType(message) {
    if (message.method && message.id !== undefined) {
      return 'request';
    } else if (message.result !== undefined || message.error !== undefined) {
      return 'response';
    } else {
      return 'notification';
    }
  }

  getTargetQueueName(message) {
    // Route all requests to the MCP Open Discovery server queue
    return `${this.options.serverQueuePrefix}.requests`;
  }

  generateCorrelationId() {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}

module.exports = {
  RabbitMQClientTransport,
  Transport
};
