/**
 * Shared AMQP Transport Base Class
 * 
 * This module provides common functionality for both AMQP client and server transports,
 * reducing code duplication and ensuring consistent behavior across the MCP Open Discovery platform.
 */

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
    
    // Generate unique session ID for MCP routing
    this.sessionId = `${this.getTransportType()}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
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
   * Legacy compatibility method - delegates to detectMessageType
   */
  getMessageType(message) {
    return this.detectMessageType(message);
  }

  /**
   * Determine tool category for routing (matches server-side categories)
   */
  getToolCategory(method) {
    if (method.startsWith('nmap_')) return 'nmap';
    if (method.startsWith('snmp_')) return 'snmp';
    if (method.startsWith('proxmox_')) return 'proxmox';
    if (method.startsWith('zabbix_')) return 'zabbix';
    if (['ping', 'telnet', 'wget', 'netstat', 'ifconfig', 'arp', 'route', 'nslookup', 'tcp_connect', 'whois'].includes(method)) return 'network';
    if (method.startsWith('memory_') || method.startsWith('cmdb_')) return 'memory';
    if (method.startsWith('credentials_')) return 'credentials';
    if (method.startsWith('registry_')) return 'registry';
    return 'general';
  }

  /**
   * Generate correlation ID for message tracking
   */
  generateCorrelationId() {
    return `${this.sessionId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
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
  BaseAMQPTransport
};
