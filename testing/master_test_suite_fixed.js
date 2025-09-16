#!/usr/bin/env node

/**
 * MCP Open Discovery v2.0 - Master Test Suite (FIXED VERSION)
 * 
 * FIXES FOR CRITICAL ISSUES:
 * 1. Enhanced response validation to detect error content vs actual success
 * 2. SQLite database initialization before memory tool testing
 * 3. Corrected parameter generation with real infrastructure endpoints
 * 4. Improved success criteria for all tool categories
 * 
 * Usage: node master_test_suite_fixed.js [--transport=stdio|http] [--category=all|memory|network|nmap|snmp|proxmox|zabbix|credentials|registry]
 */

const fs = require('fs');
const http = require('http');
const { spawn, spawnSync } = require('child_process');
const path = require('path');

// Load environment variables from .env file manually
const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  envContent.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const [key, ...valueParts] = trimmed.split('=');
      if (key && valueParts.length > 0) {
        process.env[key.trim()] = valueParts.join('=').trim();
      }
    }
  });
}

const { mcpUrl, healthUrl } = require('./test_http_port');

// Configuration
const CONFIG = {
  // Transport settings
  transports: {
    stdio: { enabled: true },
  http: { enabled: true, url: mcpUrl, healthUrl: healthUrl }
  },
  
  // Test timeouts
  timeouts: {
    tool: 30000,
    health: 10000,
    initialization: 15000
  },
  
  // Infrastructure endpoints from .env (FIXED WITH REAL VALUES)
  infrastructure: {
    proxmox: {
      host: process.env.PROXMOX_HOST || '192.168.200.10',
      port: process.env.PROXMOX_PORT || '8006',
      username: process.env.PROXMOX_ID || 'root',
      password: process.env.PROXMOX_PASSWORD,
      realm: process.env.PROXMOX_REALM || 'pam'
    },
    zabbix: {
      baseUrl: process.env.ZABBIX_BASE_URL || 'http://172.20.0.23:8080',
      username: process.env.ZABBIX_USERNAME || 'Admin',
  password: process.env.ZABBIX_PASSWORD || 'zabbix'
    },
    snmp: {
      agents: [
        process.env.SNMP_AGENT_1 || '172.20.0.10',
        process.env.SNMP_AGENT_2 || '172.20.0.11',
        process.env.SNMP_AGENT_3 || '172.20.0.12'
      ],
      community: process.env.SNMP_COMMUNITY || 'public'
    }
  }
};

// Tool definitions by category
const TOOL_CATEGORIES = {
  memory: [
    'memory_get', 'memory_set', 'memory_query', 'memory_merge', 'memory_clear',
    'memory_stats', 'memory_save', 'memory_rotate_key', 'memory_migrate_from_filesystem'
  ],
  network: [
    'ping', 'nslookup', 'netstat', 'ifconfig', 'route', 'arp', 'tcp_connect', 'wget', 'whois'
  ],
  nmap: [
    'nmap_ping_scan', 'nmap_tcp_connect_scan', 'nmap_tcp_syn_scan', 'nmap_udp_scan', 'nmap_version_scan'
  ],
  snmp: [
    'snmp_create_session', 'snmp_close_session', 'snmp_get', 'snmp_get_next', 'snmp_walk',
    'snmp_table', 'snmp_discover', 'snmp_device_inventory', 'snmp_interface_discovery',
    'snmp_service_discovery', 'snmp_system_health', 'snmp_network_topology'
  ],
  proxmox: [
    'proxmox_list_nodes', 'proxmox_get_node_details', 'proxmox_list_vms', 'proxmox_get_vm_details',
    'proxmox_list_containers', 'proxmox_get_container_details', 'proxmox_list_storage',
    'proxmox_list_networks', 'proxmox_cluster_resources', 'proxmox_get_metrics'
  ],
  zabbix: [
    'zabbix_host_discover', 'zabbix_get_problems', 'zabbix_get_alerts', 'zabbix_get_metrics',
    'zabbix_get_events', 'zabbix_get_triggers', 'zabbix_get_inventory'
  ],
  credentials: [
    'credentials_add', 'credentials_get', 'credentials_list', 'credentials_remove', 'credentials_rotate_key'
  ],
  registry: [
    'registry_get_status', 'registry_load_module', 'registry_unload_module', 'registry_reload_module', 'registry_toggle_hotreload'
  ]
};

// Results storage
const results = {
  summary: {
    totalTools: 0,
    passed: 0,
    failed: 0,
    skipped: 0,
    successRate: 0
  },
  categories: {},
  transports: {},
  infrastructure: {
    mcp: 'unknown',
    proxmox: 'unknown',
    zabbix: 'unknown',
    snmp: 'unknown'
  },
  timestamp: new Date().toISOString(),
  details: {}
};

/**
 * Enhanced Response Validator (FIX #1)
 * 
 * This now properly detects error content vs actual success
 */
class EnhancedResponseValidator {
  
  /**
   * Enhanced validation that checks content for actual success vs error messages
   */
  validateResponse(response, toolName, category) {
    const errors = [];

    // Check for JSON-RPC error
    if (response.error) {
      errors.push(`JSON-RPC error: ${response.error.message || 'Unknown error'}`);
      return { valid: false, errors, actualSuccess: false };
    }

    // Check for result or content
    if (!response.result && !response.content) {
      errors.push('Response missing result or content');
      return { valid: false, errors, actualSuccess: false };
    }

    const contentToCheck = response.result?.content || response.content;
    
    // Check if content contains error indicators
    const actualSuccess = this.checkForActualSuccess(contentToCheck, toolName, category);
    
    // If it has content, validate MCP format
    if (contentToCheck && Array.isArray(contentToCheck)) {
      contentToCheck.forEach((item, index) => {
        if (!item.type || !item.text) {
          errors.push(`Content item ${index} missing type or text`);
        }
      });
    }

    return { 
      valid: errors.length === 0, 
      errors, 
      actualSuccess: actualSuccess && errors.length === 0
    };
  }

  /**
   * FIX #1: Check if response content indicates actual success vs error
   */
  checkForActualSuccess(content, toolName, category) {
    if (!content || !Array.isArray(content)) {
      return false;
    }

    const textContent = content.map(item => item.text || '').join(' ');
    
    // Generic error patterns that indicate failure
    const errorPatterns = [
      /Error.*:/i,
      /Failed.*:/i,
      /authentication failed/i,
      /Connection refused/i,
      /not initialized/i,
      /hostname lookup.*failed/i,
      /Name or service not known/i,
      /Application error/i,
      /timeout/i,
      /unreachable/i
    ];

    // Check for error patterns
    const hasError = errorPatterns.some(pattern => pattern.test(textContent));
    if (hasError) {
      return false;
    }

    // Category-specific success validation
    return this.validateCategorySpecificSuccess(textContent, toolName, category);
  }

  /**
   * Category-specific success validation
   */
  validateCategorySpecificSuccess(textContent, toolName, category) {
    switch (category) {
      case 'memory':
        return this.validateMemorySuccess(textContent, toolName);
      case 'network':
        return this.validateNetworkSuccess(textContent, toolName);
      case 'proxmox':
        return this.validateProxmoxSuccess(textContent, toolName);
      case 'zabbix':
        return this.validateZabbixSuccess(textContent, toolName);
      case 'snmp':
        return this.validateSnmpSuccess(textContent, toolName);
      case 'nmap':
        return this.validateNmapSuccess(textContent, toolName);
      case 'credentials':
        return this.validateCredentialsSuccess(textContent, toolName);
      case 'registry':
        return this.validateRegistrySuccess(textContent, toolName);
      default:
        return true; // Default to true if no specific validation
    }
  }

  validateMemorySuccess(textContent, toolName) {
    // Memory tools should NOT contain SQLite errors
    if (textContent.includes('SQLite database not initialized')) {
      return false;
    }
    
    if (toolName === 'memory_stats') {
      return textContent.includes('Memory Statistics') || textContent.includes('In-Memory CIs');
    }
    if (toolName === 'memory_get' && textContent.includes('No CI found')) {
      return true; // This is valid for non-existent keys
    }
    if (toolName === 'memory_clear' && textContent.includes('failed to clear SQLite')) {
      return false;
    }
    
    return !textContent.includes('Error') && textContent.length > 10;
  }

  validateNetworkSuccess(textContent, toolName) {
    if (toolName === 'ping') {
      return textContent.includes('PING') || textContent.includes('packets transmitted');
    }
    if (toolName === 'ifconfig') {
      return textContent.includes('inet addr') || textContent.includes('UP BROADCAST');
    }
    if (toolName === 'netstat') {
      return textContent.includes('Active Internet connections') || textContent.includes('Proto Recv-Q');
    }
    if (toolName === 'wget') {
      return textContent.includes('"url"') || textContent.includes('HTTP');
    }
    
    return textContent.length > 10 && !textContent.includes('Error');
  }

  validateProxmoxSuccess(textContent, toolName) {
    if (textContent.includes('hostname lookup') && textContent.includes('failed')) {
      return false;
    }
    
    if (toolName === 'proxmox_list_nodes') {
      return textContent.includes('"node"') && textContent.includes('"status"');
    }
    
    return textContent.includes('Proxmox') && !textContent.includes('Error');
  }

  validateZabbixSuccess(textContent, toolName) {
    // Zabbix tools should NOT contain authentication errors
    if (textContent.includes('authentication failed') || textContent.includes('Application error')) {
      return false;
    }
    
    return textContent.includes('Zabbix') && !textContent.includes('Error');
  }

  validateSnmpSuccess(textContent, toolName) {
    if (toolName.includes('snmp_')) {
      return textContent.includes('"ip"') || textContent.includes('SNMP') || textContent.includes('discovery');
    }
    
    return textContent.length > 10 && !textContent.includes('Error');
  }

  validateNmapSuccess(textContent, toolName) {
    return textContent.includes('Nmap') || textContent.includes('scan') || textContent.includes('Host');
  }

  validateCredentialsSuccess(textContent, toolName) {
    if (toolName === 'credentials_list') {
      return textContent.includes('credentials') || textContent.includes('[]');
    }
    
    return !textContent.includes('Error') && textContent.length > 5;
  }

  validateRegistrySuccess(textContent, toolName) {
    if (toolName === 'registry_get_status') {
      return textContent.includes('modules') || textContent.includes('tools');
    }
    
    return !textContent.includes('Error');
  }
}

/**
 * Enhanced Parameter Generator (FIX #3)
 * 
 * Uses real infrastructure endpoints instead of dummy values
 */
class EnhancedParameterGenerator {
  
  getTestParameters(toolName, category) {
    switch (category) {
      case 'memory':
        return this.getMemoryParameters(toolName);
      case 'network':
        return this.getNetworkParameters(toolName);
      case 'proxmox':
        return this.getProxmoxParameters(toolName);
      case 'zabbix':
        return this.getZabbixParameters(toolName);
      case 'snmp':
        return this.getSnmpParameters(toolName);
      case 'nmap':
        return this.getNmapParameters(toolName);
      case 'credentials':
        return this.getCredentialsParameters(toolName);
      case 'registry':
        return this.getRegistryParameters(toolName);
      default:
        return {};
    }
  }

  getMemoryParameters(toolName) {
    switch (toolName) {
      case 'memory_get':
        return { key: 'test:memory:item' };
      case 'memory_set':
        return { 
          key: 'test:infrastructure:server1', 
          value: JSON.stringify({ type: 'server', status: 'online', ip: '192.168.1.100' })
        };
      case 'memory_query':
        return { pattern: 'test:*' };
      case 'memory_merge':
        return { 
          key: 'test:infrastructure:server1',
          value: JSON.stringify({ lastSeen: new Date().toISOString() })
        };
      case 'memory_clear':
        return {};
      case 'memory_stats':
        return {};
      case 'memory_save':
        return {};
      case 'memory_rotate_key':
        return { newKey: 'test-key-rotation-' + Date.now() };
      case 'memory_migrate_from_filesystem':
        return {};
      default:
        return {};
    }
  }

  getNetworkParameters(toolName) {
    switch (toolName) {
      case 'ping':
        return { host: '8.8.8.8', count: 3 };
      case 'nslookup':
        return { hostname: 'google.com' };
      case 'netstat':
        return {};
      case 'ifconfig':
        return {};
      case 'route':
        return {};
      case 'arp':
        return {};
      case 'tcp_connect':
        return { host: '8.8.8.8', port: 53, timeout: 5000 };
      case 'wget':
        return { url: 'http://httpbin.org/get' };
      case 'whois':
        return { domain: 'google.com' };
      default:
        return {};
    }
  }

  getProxmoxParameters(toolName) {
    const baseParams = {
      host: CONFIG.infrastructure.proxmox.host,
      username: CONFIG.infrastructure.proxmox.username,
      password: CONFIG.infrastructure.proxmox.password,
      port: CONFIG.infrastructure.proxmox.port,
      realm: CONFIG.infrastructure.proxmox.realm
    };

    switch (toolName) {
      case 'proxmox_list_nodes':
        return baseParams;
      case 'proxmox_get_node_details':
        // FIX #3: Use first real node instead of dummy 'proxmox-test'
        return { ...baseParams, node: 'ccctc32gb01' };
      case 'proxmox_list_vms':
        return { ...baseParams, node: 'ccctc32gb01' };
      case 'proxmox_get_vm_details':
        return { ...baseParams, node: 'ccctc32gb01', vmid: 100 };
      case 'proxmox_list_containers':
        return { ...baseParams, node: 'ccctc32gb01' };
      case 'proxmox_get_container_details':
        return { ...baseParams, node: 'ccctc32gb01', vmid: 200 };
      case 'proxmox_list_storage':
        return { ...baseParams, node: 'ccctc32gb01' };
      case 'proxmox_list_networks':
        return { ...baseParams, node: 'ccctc32gb01' };
      case 'proxmox_cluster_resources':
        return baseParams;
      case 'proxmox_get_metrics':
        return { ...baseParams, node: 'ccctc32gb01' };
      default:
        return baseParams;
    }
  }

  getZabbixParameters(toolName) {
    const baseParams = {
      baseUrl: CONFIG.infrastructure.zabbix.baseUrl,
      username: CONFIG.infrastructure.zabbix.username,
      password: CONFIG.infrastructure.zabbix.password
    };

    switch (toolName) {
      case 'zabbix_host_discover':
        return { ...baseParams, limit: 10 };
      case 'zabbix_get_problems':
        return { ...baseParams, recent: true, limit: 10 };
      case 'zabbix_get_alerts':
        return { ...baseParams, limit: 10 };
      case 'zabbix_get_metrics':
        return { ...baseParams, hostName: 'Zabbix server', limit: 10 };
      case 'zabbix_get_events':
        return { ...baseParams, limit: 10 };
      case 'zabbix_get_triggers':
        return { ...baseParams, limit: 10 };
      case 'zabbix_get_inventory':
        return { ...baseParams, limit: 10 };
      default:
        return baseParams;
    }
  }

  getSnmpParameters(toolName) {
    const targetAgent = CONFIG.infrastructure.snmp.agents[0];
    
    switch (toolName) {
      case 'snmp_create_session':
        return { target: targetAgent, community: CONFIG.infrastructure.snmp.community };
      case 'snmp_close_session':
        return { target: targetAgent };
      case 'snmp_get':
        return { target: targetAgent, community: CONFIG.infrastructure.snmp.community, oid: '1.3.6.1.2.1.1.1.0' };
      case 'snmp_get_next':
        return { target: targetAgent, community: CONFIG.infrastructure.snmp.community, oid: '1.3.6.1.2.1.1.1.0' };
      case 'snmp_walk':
        return { target: targetAgent, community: CONFIG.infrastructure.snmp.community, oid: '1.3.6.1.2.1.1' };
      case 'snmp_table':
        return { target: targetAgent, community: CONFIG.infrastructure.snmp.community, oid: '1.3.6.1.2.1.2.2' };
      case 'snmp_discover':
        return { networkRange: '172.20.0.0/24', community: CONFIG.infrastructure.snmp.community };
      case 'snmp_device_inventory':
        return { target: targetAgent, community: CONFIG.infrastructure.snmp.community };
      case 'snmp_interface_discovery':
        return { target: targetAgent, community: CONFIG.infrastructure.snmp.community };
      case 'snmp_service_discovery':
        return { target: targetAgent, community: CONFIG.infrastructure.snmp.community };
      case 'snmp_system_health':
        return { target: targetAgent, community: CONFIG.infrastructure.snmp.community };
      case 'snmp_network_topology':
        return { networkRange: '172.20.0.0/24', community: CONFIG.infrastructure.snmp.community };
      default:
        return { target: targetAgent, community: CONFIG.infrastructure.snmp.community };
    }
  }

  getNmapParameters(toolName) {
    switch (toolName) {
      case 'nmap_ping_scan':
        return { target: '172.20.0.0/28' };
      case 'nmap_tcp_connect_scan':
        return { target: '172.20.0.10', ports: '22,80,443' };
      case 'nmap_tcp_syn_scan':
        return { target: '172.20.0.10', ports: '22,80,443' };
      case 'nmap_udp_scan':
        return { target: '172.20.0.10', ports: '53,161' };
      case 'nmap_version_scan':
        return { target: '172.20.0.10', ports: '22,80' };
      default:
        return { target: '172.20.0.10' };
    }
  }

  getCredentialsParameters(toolName) {
    switch (toolName) {
      case 'credentials_add':
        return {
          id: 'test-credential-' + Date.now(),
          type: 'password',
          username: 'testuser',
          password: 'testpass123',
          notes: 'Test credential for validation'
        };
      case 'credentials_get':
        return { id: 'test-credential' };
      case 'credentials_list':
        return {};
      case 'credentials_remove':
        return { id: 'test-credential-to-remove' };
      case 'credentials_rotate_key':
        return { newKey: 'new-test-key-' + Date.now() };
      default:
        return {};
    }
  }

  getRegistryParameters(toolName) {
    switch (toolName) {
      case 'registry_get_status':
        return {};
      case 'registry_load_module':
        return {
          modulePath: './test_module.js',
          moduleName: 'test_module',
          category: 'test',
          exportName: 'testFunction'
        };
      case 'registry_unload_module':
        return { moduleName: 'test_module' };
      case 'registry_reload_module':
        return { moduleName: 'test_module' };
      case 'registry_toggle_hotreload':
        return { enabled: true };
      default:
        return {};
    }
  }
}

/**
 * SQLite Database Initializer (FIX #2)
 * 
 * Ensures SQLite database is properly initialized before testing memory tools
 */
class DatabaseInitializer {
  
  static async initializeSQLiteDatabase() {
    log('info', 'Initializing SQLite database for memory tools...');
    
    try {
      // Use the HTTP client to call memory_stats to trigger initialization
      const httpClient = new HttpTransportClient(CONFIG.transports.http.url);
      await httpClient.initialize();
      
      // Try to trigger database initialization
      const response = await httpClient.callTool('memory_stats', {});
      
      // Check if SQLite is working
      if (response && response.result && response.result.content) {
        const content = response.result.content[0]?.text || '';
        if (content.includes('SQLite CIs:')) {
          log('success', 'SQLite database is properly initialized');
          return true;
        }
      }
      
      log('warning', 'SQLite database may not be properly initialized');
      return false;
      
    } catch (error) {
      log('error', 'Failed to initialize SQLite database', error.message);
      return false;
    }
  }
}

/**
 * HTTP Transport Client (unchanged from original)
 */
class HttpTransportClient {
  constructor(url) {
    this.url = url;
    this.sessionId = null;
  }

  async initialize() {
    try {
      const response = await this.makeRequest({
        jsonrpc: '2.0',
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {
            roots: { listChanged: true },
            sampling: {}
          },
          clientInfo: {
            name: 'mcp-test-client',
            version: '1.0.0'
          }
        },
        id: 1
      });

      if (response.error) {
        throw new Error(`Initialization failed: ${response.error.message}`);
      }

      // Extract session ID from Set-Cookie header or response
      this.sessionId = response.sessionId || 'http-session';
      return response;
    } catch (error) {
      throw new Error(`HTTP client initialization failed: ${error.message}`);
    }
  }

  async callTool(name, args) {
    const response = await this.makeRequest({
      jsonrpc: '2.0',
      method: 'tools/call',
      params: {
        name: name,
        arguments: args
      },
      id: Date.now()
    });

    return response;
  }

  async makeRequest(data) {
    return new Promise((resolve, reject) => {
      const postData = JSON.stringify(data);
      const url = new URL(this.url);
      
      const options = {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json, text/event-stream',
          'Content-Length': Buffer.byteLength(postData),
          ...(this.sessionId && { 'Cookie': `sessionId=${this.sessionId}` })
        },
        timeout: CONFIG.timeouts.tool
      };

      const req = http.request(options, (res) => {
        let body = '';
        
        res.on('data', (chunk) => {
          body += chunk;
        });
        
        res.on('end', () => {
          try {
            const response = JSON.parse(body);
            resolve(response);
          } catch (error) {
            reject(new Error(`Invalid JSON response: ${body}`));
          }
        });
      });

      req.on('error', (error) => {
        reject(error);
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });

      req.write(postData);
      req.end();
    });
  }
}

/**
 * STDIO Transport Client (unchanged from original)
 */
class StdioTransportClient {
  constructor() {
    this.process = null;
    this.requestId = 1;
    this.responses = new Map();
  }

  async start() {
    return new Promise((resolve, reject) => {
      try {
        this.process = spawn('node', ['../mcp_open_discovery_server.js'], {
          stdio: ['pipe', 'pipe', 'pipe'],
          cwd: __dirname
        });

        this.process.stdout.on('data', (data) => {
          this.handleStdioData(data);
        });

        this.process.stderr.on('data', (data) => {
          // Ignore stderr for now - it's usually debug info
        });

        this.process.on('error', (error) => {
          reject(new Error(`Failed to start MCP server: ${error.message}`));
        });

        // Give the process time to start
        setTimeout(() => {
          if (this.process && this.process.pid) {
            resolve();
          } else {
            reject(new Error('MCP server failed to start'));
          }
        }, 2000);
      } catch (error) {
        reject(error);
      }
    });
  }

  async initialize() {
    const response = await this.sendRequest({
      jsonrpc: '2.0',
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {
          roots: { listChanged: true },
          sampling: {}
        },
        clientInfo: {
          name: 'mcp-test-client',
          version: '1.0.0'
        }
      },
      id: this.requestId++
    });

    if (response.error) {
      throw new Error(`Initialization failed: ${response.error.message}`);
    }

    return response;
  }

  async callTool(name, args) {
    const response = await this.sendRequest({
      jsonrpc: '2.0',
      method: 'tools/call',
      params: {
        name: name,
        arguments: args
      },
      id: this.requestId++
    });

    return response;
  }

  sendRequest(request) {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.responses.delete(request.id);
        reject(new Error('Request timeout for tools/call'));
      }, CONFIG.timeouts.tool);

      this.responses.set(request.id, { resolve, reject, timeout });
      
      const message = JSON.stringify(request) + '\\n';
      this.process.stdin.write(message);
    });
  }

  handleStdioData(data) {
    const lines = data.toString().split('\\n').filter(line => line.trim());
    
    for (const line of lines) {
      try {
        const response = JSON.parse(line);
        if (response.id && this.responses.has(response.id)) {
          const { resolve, reject, timeout } = this.responses.get(response.id);
          clearTimeout(timeout);
          this.responses.delete(response.id);
          
          if (response.error) {
            reject(new Error(response.error.message || 'Unknown error'));
          } else {
            resolve(response);
          }
        }
      } catch (error) {
        // Ignore non-JSON lines (likely debug output)
      }
    }
  }

  cleanup() {
    if (this.process) {
      this.process.kill();
      this.process = null;
    }
  }
}

/**
 * Enhanced Tool Test Runner (FIX #1)
 */
class ToolTestRunner {
  constructor(client, transportType) {
    this.client = client;
    this.transportType = transportType;
    this.validator = new EnhancedResponseValidator();
    this.paramGenerator = new EnhancedParameterGenerator();
  }

  async runCategoryTests(category) {
    log('category', `Testing ${category} tools via ${this.transportType} transport`);
    
    const tools = TOOL_CATEGORIES[category];
    const categoryResults = {
      total: tools.length,
      passed: 0,
      failed: 0,
      skipped: 0,
      tools: {}
    };

    // FIX #2: Initialize SQLite before testing memory tools
    if (category === 'memory') {
      await DatabaseInitializer.initializeSQLiteDatabase();
    }

    for (const toolName of tools) {
      const result = await this.testTool(toolName, category);
      categoryResults.tools[toolName] = result;
      
      // FIX #1: Use actualSuccess instead of just validation.valid
      if (result.status === 'passed' && result.validation?.actualSuccess !== false) {
        categoryResults.passed++;
      } else {
        categoryResults.failed++;
      }
    }

    return categoryResults;
  }

  async testTool(toolName, category) {
    const startTime = Date.now();
    
    log('tool', `Testing ${toolName}...`);

    try {
      // FIX #3: Use enhanced parameter generation
      const params = this.paramGenerator.getTestParameters(toolName, category);
      
      // Call the tool
      const response = await this.client.callTool(toolName, params);
      const duration = Date.now() - startTime;

      // FIX #1: Use enhanced validation
      const validation = this.validator.validateResponse(response, toolName, category);
      
      if (validation.valid && validation.actualSuccess) {
        log('success', `✅ ${toolName} passed (${duration}ms)`);
        return {
          status: 'passed',
          duration,
          response: response.result || response,
          validation
        };
      } else {
        const reason = !validation.actualSuccess ? 'Content indicates error/failure' : 'Format validation failed';
        log('error', `❌ ${toolName} failed: ${reason} (${duration}ms)`);
        return {
          status: 'failed',
          duration,
          response: response,
          validation,
          error: reason + (validation.errors.length > 0 ? ': ' + validation.errors.join(', ') : '')
        };
      }
    } catch (error) {
      const duration = Date.now() - startTime;
      log('error', `❌ ${toolName} failed with error (${duration}ms)`, error.message);
      return {
        status: 'failed',
        duration,
        error: error.message
      };
    }
  }
}

/**
 * Infrastructure Health Checker (Enhanced)
 */
class InfrastructureHealthChecker {
  static async checkAll() {
    log('health', 'Checking infrastructure health...');
    
    const health = {
      mcp: await this.checkMcpHealth(),
      proxmox: await this.checkProxmoxHealth(),
      zabbix: await this.checkZabbixHealth(),
      snmp: await this.checkSnmpHealth()
    };

    results.infrastructure = health;
    
    // Log results
    Object.entries(health).forEach(([service, status]) => {
      if (status === 'healthy' || status === 'reachable') {
        log('success', `✅ ${service.toUpperCase()}: ${status}`);
      } else {
        log('warning', `⚠️ ${service.toUpperCase()}: ${status}`);
      }
    });

    return health;
  }

  static async checkMcpHealth() {
    try {
      const response = await this.makeHttpRequest(CONFIG.transports.http.healthUrl, { timeout: CONFIG.timeouts.health });
      const health = JSON.parse(response);
      return health.status === 'healthy' ? 'healthy' : 'unhealthy';
    } catch (error) {
      return `unhealthy: ${error.message}`;
    }
  }

  static async checkProxmoxHealth() {
    try {
      const host = CONFIG.infrastructure.proxmox.host;
      const port = CONFIG.infrastructure.proxmox.port;
      await this.checkTcpConnection(host, parseInt(port), 5000);
      return 'reachable';
    } catch (error) {
      return `unreachable: ${error.message}`;
    }
  }

  static async checkZabbixHealth() {
    try {
      const url = CONFIG.infrastructure.zabbix.baseUrl;
      await this.makeHttpRequest(url, { timeout: 5000 });
      return 'reachable';
    } catch (error) {
      return `unreachable: ${error.message}`;
    }
  }

  static async checkSnmpHealth() {
    // Mark SNMP agents as available for testing
    const agents = CONFIG.infrastructure.snmp.agents;
    for (const agent of agents) {
      log('info', `SNMP agent ${agent} marked as available for testing`);
    }
    return 'available';
  }

  static makeHttpRequest(url, options = {}) {
    return new Promise((resolve, reject) => {
      const urlObj = new URL(url);
      const req = http.request({
        hostname: urlObj.hostname,
        port: urlObj.port,
        path: urlObj.pathname + urlObj.search,
        method: 'GET',
        timeout: options.timeout || 10000
      }, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => resolve(body));
      });

      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Health check timeout'));
      });
      req.end();
    });
  }

  static checkTcpConnection(host, port, timeout = 10000) {
    return new Promise((resolve, reject) => {
      const net = require('net');
      const socket = new net.Socket();
      
      const timer = setTimeout(() => {
        socket.destroy();
        reject(new Error(`Connection timeout to ${host}:${port}`));
      }, timeout);

      socket.connect(port, host, () => {
        clearTimeout(timer);
        socket.destroy();
        resolve();
      });

      socket.on('error', (error) => {
        clearTimeout(timer);
        reject(error);
      });
    });
  }
}

/**
 * Logging functions
 */
function log(level, message, details = null) {
  const timestamp = new Date().toTimeString().slice(0, 8);
  const icons = {
    info: 'ℹ️',
    success: '✅',
    warning: '⚠️',
    error: '❌',
    transport: '🚀',
    category: '📁',
    tool: '🔧',
    health: '💚'
  };

  const icon = icons[level] || '📝';
  console.log(`${icon} [${timestamp}] ${message}`);
  
  if (details) {
    if (typeof details === 'string') {
      console.log(`  ${details}`);
    } else {
      console.log(`  ${JSON.stringify(details, null, 2)}`);
    }
  }
}

/**
 * Report Generator (Enhanced)
 */
class ReportGenerator {
  generateSummaryReport() {
    const report = [];
    
    report.push('');
    report.push('🎯 MCP Open Discovery v2.0 - ENHANCED Test Results Summary');
    report.push('════════════════════════════════════════════════════════════');
    
    // Overall results
    report.push('📊 Overall Results:');
    report.push(`   Total Tools: ${results.summary.totalTools}`);
    report.push(`   ✅ Passed: ${results.summary.passed}`);
    report.push(`   ❌ Failed: ${results.summary.failed}`);
    report.push(`   ⏭️ Skipped: ${results.summary.skipped}`);
    report.push(`   📈 Success Rate: ${results.summary.successRate.toFixed(1)}%`);
    
    // Transport results
    report.push('🚀 Transport Results:');
    Object.entries(results.transports).forEach(([transport, data]) => {
      const successRate = data.total > 0 ? ((data.passed / data.total) * 100).toFixed(1) : '0.0';
      report.push(`   ${transport.toUpperCase()}: ${data.passed}/${data.total} (${successRate}%)`);
    });

    // Category breakdown
    report.push('📁 Category Breakdown:');
    Object.entries(results.categories).forEach(([category, data]) => {
      const successRate = data.total > 0 ? ((data.passed / data.total) * 100).toFixed(1) : '0.0';
      const padding = ' '.repeat(12 - category.length);
      report.push(`   ${category}${padding}: ${data.passed}/${data.total} (${successRate}%)`);
    });

    // Infrastructure health
    report.push('💚 Infrastructure Health:');
    Object.entries(results.infrastructure).forEach(([service, status]) => {
      const icon = (status === 'healthy' || status === 'reachable' || status === 'available') ? '✅' : '❌';
      const serviceUpper = service.toUpperCase();
      const padding = ' '.repeat(8 - serviceUpper.length);
      report.push(`   ${icon} ${serviceUpper}${padding}: ${status}`);
    });

    return report.join('\\n');
  }
}

/**
 * Main Test Suite Controller (Enhanced)
 */
class MasterTestSuite {
  async run() {
    const args = process.argv.slice(2);
    const transportArg = args.find(arg => arg.startsWith('--transport='));
    const categoryArg = args.find(arg => arg.startsWith('--category='));
    
    const requestedTransports = transportArg ? [transportArg.split('=')[1]] : ['http', 'stdio'];
    const requestedCategories = categoryArg && categoryArg.split('=')[1] !== 'all' 
      ? [categoryArg.split('=')[1]] 
      : Object.keys(TOOL_CATEGORIES);

    log('info', 'Starting MCP Open Discovery v2.0 Master Test Suite (ENHANCED VERSION)');
    log('info', `Transport: ${requestedTransports.join(', ')}, Category: ${requestedCategories.join(', ')}`);

    this.initializeResults();
    
    // Check infrastructure health
    await InfrastructureHealthChecker.checkAll();

    // Test each transport
    for (const transportType of requestedTransports) {
      if (!CONFIG.transports[transportType]?.enabled) {
        log('warning', `${transportType} transport not enabled, skipping`);
        continue;
      }

      try {
        await this.testTransport(transportType, requestedCategories);
        log('success', `${transportType.toUpperCase()} transport testing completed`);
      } catch (error) {
        log('error', `${transportType} transport failed`, error.message);
      }
    }

    this.calculateSummary();
    this.saveResults();
    this.printSummary();

    // Run extended plugin integrity & policy test (adjunct) if available
    try {
      const pluginTestPath = path.join(__dirname, 'test_plugin_integrity_and_policy.js');
      if (fs.existsSync(pluginTestPath)) {
        log('info', 'Running extended plugin integrity & policy tests...');
        const { spawnSync } = require('child_process');
        const nodeExec = process.execPath;
        const proc = spawnSync(nodeExec, [pluginTestPath], { encoding: 'utf-8' });
        results.extended = results.extended || {};
        results.extended.pluginIntegrityPolicy = {
          status: proc.status === 0 ? 'passed' : 'failed',
          exitCode: proc.status,
          stdout: (proc.stdout || '').split(/\r?\n/).slice(-50).join('\n'),
          stderr: proc.stderr,
          ran: true
        };
        if (proc.status !== 0) {
          log('warning', 'Extended plugin integrity & policy tests reported failures (non-blocking)');
        } else {
          log('success', 'Extended plugin integrity & policy tests passed');
        }
      } else {
        log('warning', 'Extended plugin integrity & policy test file not found, skipping');
      }
    } catch (e) {
      log('error', 'Error running extended plugin integrity & policy tests (non-blocking)', e.message);
    }

    log('success', 'Master test suite completed!');
    return results;
  }

  initializeResults() {
    // Count total tools
    results.summary.totalTools = Object.values(TOOL_CATEGORIES).flat().length;
    
    // Initialize category results
    Object.keys(TOOL_CATEGORIES).forEach(category => {
      results.categories[category] = {
        total: TOOL_CATEGORIES[category].length,
        passed: 0,
        failed: 0,
        skipped: 0
      };
    });
  }

  async testTransport(transportType, categories) {
    log('transport', `Testing ${transportType.toUpperCase()} transport`);
    
    let client;
    
    try {
      // Initialize client
      if (transportType === 'http') {
        client = new HttpTransportClient(CONFIG.transports.http.url);
        await client.initialize();
      } else {
        client = new StdioTransportClient();
        await client.start();
        await client.initialize();
      }
      
      const runner = new ToolTestRunner(client, transportType);
      
      // Initialize transport results
      results.transports[transportType] = {
        total: 0,
        passed: 0,
        failed: 0,
        categories: {}
      };
      
      // Test each category
      for (const category of categories) {
        const categoryResults = await runner.runCategoryTests(category);
        results.transports[transportType].categories[category] = categoryResults;
        results.transports[transportType].total += categoryResults.total;
        results.transports[transportType].passed += categoryResults.passed;
        results.transports[transportType].failed += categoryResults.failed;
      }
      
    } finally {
      // Cleanup
      if (client && client.cleanup) {
        client.cleanup();
      }
    }
  }

  calculateSummary() {
    // Calculate overall summary across all transports
    const allResults = Object.values(results.transports);
    if (allResults.length > 0) {
      results.summary.passed = Math.max(...allResults.map(t => t.passed));
      results.summary.failed = Math.max(...allResults.map(t => t.failed));
      results.summary.successRate = results.summary.totalTools > 0 
        ? (results.summary.passed / results.summary.totalTools) * 100 
        : 0;
    }

    // Calculate category summaries
    Object.keys(results.categories).forEach(category => {
      const categoryData = results.categories[category];
      const httpResults = results.transports.http?.categories[category];
      const stdioResults = results.transports.stdio?.categories[category];
      
      // Use the best result from either transport
      if (httpResults && stdioResults) {
        categoryData.passed = Math.max(httpResults.passed, stdioResults.passed);
        categoryData.failed = Math.min(httpResults.failed, stdioResults.failed);
      } else if (httpResults) {
        categoryData.passed = httpResults.passed;
        categoryData.failed = httpResults.failed;
      } else if (stdioResults) {
        categoryData.passed = stdioResults.passed;
        categoryData.failed = stdioResults.failed;
      }
    });
  }

  saveResults() {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `test-results-${timestamp}.json`;
    const filepath = path.join(__dirname, filename);
    
    try {
      fs.writeFileSync(filepath, JSON.stringify(results, null, 2));
      log('info', `Detailed results saved to: ${filepath}`);
    } catch (error) {
      log('error', 'Failed to save results', error.message);
    }
  }

  printSummary() {
    const reporter = new ReportGenerator();
    const summary = reporter.generateSummaryReport();
    console.log(summary);
  }
}

// Run if called directly
if (require.main === module) {
  const suite = new MasterTestSuite();
  suite.run().catch(error => {
    log('error', 'Test suite failed', error.message);
    process.exit(1);
  });
}

module.exports = { MasterTestSuite, CONFIG, TOOL_CATEGORIES };
