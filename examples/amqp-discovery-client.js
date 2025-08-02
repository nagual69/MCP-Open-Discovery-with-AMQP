/**
 * Example: MCP Open Discovery Client using AMQP Transport
 * 
 * This example demonstrates how to connect to the MCP Open Discovery Server
 * via AMQP/RabbitMQ and perform network discovery operations.
 */

const { RabbitMQClientTransport } = require('../amqp-client-transport.js');

/**
 * Enhanced logging
 */
function log(level, message, data = null) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] [${level.toUpperCase()}] ${message}`;
  
  if (level === 'error') {
    console.error(logMessage, data ? JSON.stringify(data, null, 2) : '');
  } else {
    console.log(logMessage, data ? JSON.stringify(data, null, 2) : '');
  }
}

/**
 * Simple MCP client implementation
 */
class SimpleMCPClient {
  constructor(transport) {
    this.transport = transport;
    this.requestId = 1;
    this.pendingRequests = new Map();
    
    this.transport.onmessage = (message) => {
      this.handleMessage(message);
    };
    
    this.transport.onerror = (error) => {
      log('error', 'Transport error', { error: error.message });
    };
    
    this.transport.onclose = () => {
      log('info', 'Transport closed');
    };
  }
  
  async connect() {
    await this.transport.start();
    log('info', 'Connected to MCP Open Discovery Server via AMQP');
  }
  
  async close() {
    await this.transport.close();
  }
  
  handleMessage(message) {
    if (message.id && this.pendingRequests.has(message.id)) {
      const { resolve, reject } = this.pendingRequests.get(message.id);
      this.pendingRequests.delete(message.id);
      
      if (message.error) {
        reject(new Error(`MCP Error: ${message.error.message}`));
      } else {
        resolve(message.result);
      }
    } else if (!message.id) {
      // Handle notifications
      log('info', 'Received notification', {
        method: message.method,
        params: message.params
      });
    }
  }
  
  async sendRequest(method, params = {}) {
    const id = this.requestId++;
    
    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject });
      
      const request = {
        jsonrpc: '2.0',
        id,
        method,
        params
      };
      
      this.transport.send(request).catch(reject);
      
      // Timeout handling
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error(`Request timeout: ${method}`));
        }
      }, 30000);
    });
  }
  
  async initialize() {
    return this.sendRequest('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: { tools: {} },
      clientInfo: {
        name: 'amqp-discovery-client',
        version: '1.0.0'
      }
    });
  }
  
  async listTools() {
    return this.sendRequest('tools/list');
  }
  
  async callTool(name, args) {
    return this.sendRequest('tools/call', {
      name,
      arguments: args
    });
  }
  
  async memorySet(key, value) {
    return this.sendRequest('memory/set', { key, value });
  }
  
  async memoryGet(key) {
    return this.sendRequest('memory/get', { key });
  }
  
  async memoryQuery(query) {
    return this.sendRequest('memory/query', { query });
  }
}

/**
 * Demonstrate network discovery via AMQP
 */
async function demonstrateNetworkDiscovery() {
  log('info', 'Starting MCP Open Discovery AMQP demonstration...');
  
  // Create AMQP transport
  const transport = new RabbitMQClientTransport({
    amqpUrl: process.env.AMQP_URL || 'amqp://mcp:discovery@localhost:5672',
    serverQueuePrefix: 'mcp.discovery',
    exchangeName: 'mcp.notifications',
    responseTimeout: 30000
  });
  
  const client = new SimpleMCPClient(transport);
  
  try {
    // Connect to server
    await client.connect();
    
    // Initialize MCP connection
    log('info', 'Initializing MCP connection...');
    const initResult = await client.initialize();
    log('info', 'MCP initialized', {
      protocolVersion: initResult.protocolVersion,
      serverName: initResult.serverInfo?.name
    });
    
    // List available discovery tools
    log('info', 'Listing available discovery tools...');
    const toolsResult = await client.listTools();
    const tools = toolsResult.tools;
    
    log('info', `Found ${tools.length} discovery tools`);
    
    // Group tools by category
    const toolsByCategory = {
      network: [],
      nmap: [],
      snmp: [],
      proxmox: [],
      zabbix: [],
      memory: [],
      credentials: [],
      other: []
    };
    
    tools.forEach(tool => {
      if (tool.name.startsWith('nmap_')) {
        toolsByCategory.nmap.push(tool.name);
      } else if (tool.name.startsWith('snmp_')) {
        toolsByCategory.snmp.push(tool.name);
      } else if (tool.name.startsWith('proxmox_')) {
        toolsByCategory.proxmox.push(tool.name);
      } else if (tool.name.startsWith('zabbix_')) {
        toolsByCategory.zabbix.push(tool.name);
      } else if (tool.name.startsWith('memory_') || tool.name.startsWith('cmdb_')) {
        toolsByCategory.memory.push(tool.name);
      } else if (tool.name.startsWith('creds_')) {
        toolsByCategory.credentials.push(tool.name);
      } else if (['ping', 'telnet', 'wget', 'netstat', 'ifconfig', 'arp', 'route', 'nslookup'].includes(tool.name)) {
        toolsByCategory.network.push(tool.name);
      } else {
        toolsByCategory.other.push(tool.name);
      }
    });
    
    log('info', 'Tools by category', toolsByCategory);
    
    // Demonstrate basic network connectivity test
    log('info', 'Testing basic network connectivity...');
    const pingResult = await client.callTool('ping', {
      host: '8.8.8.8',
      count: 3,
      timeout: 5
    });
    
    log('info', 'Ping test completed', {
      output: pingResult.content?.[0]?.text?.substring(0, 200) + '...'
    });
    
    // Demonstrate NMAP discovery
    if (toolsByCategory.nmap.length > 0) {
      log('info', 'Running NMAP ping scan for local network discovery...');
      
      try {
        const nmapResult = await client.callTool('nmap_ping_scan', {
          target: '127.0.0.0/30', // Small local range
          timing_template: 4
        });
        
        log('info', 'NMAP scan completed', {
          output: nmapResult.content?.[0]?.text?.substring(0, 300) + '...'
        });
      } catch (error) {
        log('warn', 'NMAP scan failed (expected in some environments)', {
          error: error.message
        });
      }
    }
    
    // Demonstrate memory/CMDB operations
    log('info', 'Testing memory/CMDB operations...');
    
    // Store discovery results
    const discoveryData = {
      timestamp: new Date().toISOString(),
      transport: 'amqp',
      discoveredHosts: ['8.8.8.8', '127.0.0.1'],
      toolsAvailable: tools.length,
      categories: Object.keys(toolsByCategory).filter(cat => toolsByCategory[cat].length > 0)
    };
    
    await client.memorySet('discovery.amqp.session', discoveryData);
    log('info', 'Discovery data stored in CMDB');
    
    // Retrieve stored data
    const storedData = await client.memoryGet('discovery.amqp.session');
    log('info', 'Retrieved discovery data', storedData);
    
    // Query for all discovery-related entries
    const queryResult = await client.memoryQuery('discovery.*');
    log('info', 'Discovery query results', {
      matchCount: queryResult.results?.length || 0
    });
    
    // Demonstrate SNMP discovery (if tools available)
    if (toolsByCategory.snmp.length > 0) {
      log('info', 'Testing SNMP discovery against test agents...');
      
      try {
        const snmpResult = await client.callTool('snmp_discover', {
          targetRange: '172.20.0.0/24', // Docker network range
          community: 'public',
          version: '2c',
          timeout: 3000
        });
        
        log('info', 'SNMP discovery completed', {
          output: snmpResult.content?.[0]?.text?.substring(0, 300) + '...'
        });
      } catch (error) {
        log('warn', 'SNMP discovery failed (test agents may not be running)', {
          error: error.message
        });
      }
    }
    
    log('info', '🎉 MCP Open Discovery AMQP demonstration completed successfully!');
    
  } catch (error) {
    log('error', 'Demonstration failed', {
      error: error.message,
      stack: error.stack
    });
  } finally {
    // Clean up
    await client.close();
  }
}

/**
 * Real-time discovery monitoring example
 */
async function monitorDiscoveryEvents() {
  log('info', 'Starting real-time discovery monitoring...');
  
  const transport = new RabbitMQClientTransport({
    amqpUrl: process.env.AMQP_URL || 'amqp://mcp:discovery@localhost:5672',
    serverQueuePrefix: 'mcp.discovery',
    exchangeName: 'mcp.notifications'
  });
  
  // Set up notification monitoring
  transport.onmessage = (message) => {
    if (!message.id && message.method) {
      log('info', '📡 Discovery notification received', {
        method: message.method,
        timestamp: new Date().toISOString(),
        data: message.params
      });
    }
  };
  
  transport.onerror = (error) => {
    log('error', 'Monitoring transport error', { error: error.message });
  };
  
  await transport.start();
  log('info', 'Monitoring started. Listening for discovery events...');
  log('info', 'Press Ctrl+C to stop monitoring');
  
  // Keep monitoring running
  await new Promise(() => {}); // Run forever
}

// Main execution
async function main() {
  const mode = process.argv[2] || 'demo';
  
  if (mode === 'monitor') {
    await monitorDiscoveryEvents();
  } else {
    await demonstrateNetworkDiscovery();
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  log('info', 'Received SIGINT, shutting down...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  log('info', 'Received SIGTERM, shutting down...');
  process.exit(0);
});

// Run if executed directly
if (require.main === module) {
  main().catch((error) => {
    log('error', 'Main execution failed', { error: error.message });
    process.exit(1);
  });
}

module.exports = {
  SimpleMCPClient,
  demonstrateNetworkDiscovery,
  monitorDiscoveryEvents
};
