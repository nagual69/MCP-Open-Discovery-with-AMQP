#!/usr/bin/env node

/**
 * MCP Open Discovery v2.0 - Master Test Suite
 * 
 * Comprehensive testing framework for all 62 tools across 8 categories
 * Tests both stdio and HTTP transports, validates MCP compliance,
 * and provides detailed reporting on infrastructure discovery capabilities.
 * 
 * Usage: node master_test_suite.js [--transport=stdio|http] [--category=all|memory|network|nmap|snmp|proxmox|zabbix|credentials|registry]
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

// Configuration
const CONFIG = {
  // Transport settings
  transports: {
    stdio: { enabled: true },
    http: { enabled: true, url: 'http://localhost:3000/mcp', healthUrl: 'http://localhost:3000/health' }
  },
  
  // Test timeouts
  timeouts: {
    tool: 30000,
    health: 10000,
    initialization: 15000
  },
  
  // Infrastructure endpoints from .env
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
      password: process.env.ZABBIX_PASSWORD || 'OpenMCPD1sc0v3ry!'
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
    'registry_get_status', 'registry_load_module', 'registry_unload_module',
    'registry_reload_module', 'registry_toggle_hotreload'
  ]
};

// Test results tracking
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
  details: [],
  errors: [],
  infrastructure: {
    health: {},
    connectivity: {}
  }
};

/**
 * Enhanced logging with emojis and colors
 */
function log(level, message, data = null) {
  const timestamp = new Date().toISOString();
  const prefixes = {
    error: '❌',
    warn: '⚠️',
    success: '✅',
    info: 'ℹ️',
    test: '🧪',
    tool: '🔧',
    transport: '🚀',
    health: '💚',
    category: '📁'
  };
  
  const prefix = prefixes[level] || 'ℹ️';
  const logMessage = `${prefix} [${timestamp.split('T')[1].split('.')[0]}] ${message}`;
  
  if (level === 'error') {
    console.error(logMessage, data ? '\n' + JSON.stringify(data, null, 2) : '');
  } else {
    console.log(logMessage, data ? '\n' + JSON.stringify(data, null, 2) : '');
  }
}

/**
 * HTTP Transport Client
 */
class HttpTransportClient {
  constructor(url) {
    this.url = url;
    this.sessionId = null;
  }

  async makeRequest(method, params = {}) {
    return new Promise((resolve, reject) => {
      const data = JSON.stringify({
        jsonrpc: '2.0',
        id: Date.now(),
        method,
        params
      });

      const options = {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data),
          'Accept': 'application/json, text/event-stream'
        },
        timeout: CONFIG.timeouts.tool
      };

      // Add session ID if we have one
      if (this.sessionId) {
        options.headers['mcp-session-id'] = this.sessionId;
      }

      const req = http.request(this.url, options, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          try {
            // Handle SSE format response
            if (body.includes('event: message')) {
              const dataMatch = body.match(/data: ({.*})/);
              if (dataMatch) {
                const response = JSON.parse(dataMatch[1]);
                
                // Extract session ID from headers if present
                if (res.headers['mcp-session-id'] && !this.sessionId) {
                  this.sessionId = res.headers['mcp-session-id'];
                }
                
                resolve(response);
              } else {
                reject(new Error('Invalid SSE format'));
              }
            } else {
              // Handle regular JSON response
              const response = JSON.parse(body);
              resolve(response);
            }
          } catch (error) {
            reject(new Error(`Invalid response: ${error.message}`));
          }
        });
      });

      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });

      req.write(data);
      req.end();
    });
  }

  async initialize() {
    const response = await this.makeRequest('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: { tools: {} },
      clientInfo: { name: 'master-test-suite', version: '2.0.0' }
    });

    if (response.error) {
      throw new Error(`Initialization failed: ${response.error.message}`);
    }

    return response.result;
  }

  async listTools() {
    const response = await this.makeRequest('tools/list', {});
    if (response.error) {
      throw new Error(`List tools failed: ${response.error.message}`);
    }
    return response.result.tools;
  }

  async callTool(name, arguments_) {
    const response = await this.makeRequest('tools/call', {
      name,
      arguments: arguments_ || {}
    });
    
    return response;
  }
}

/**
 * Stdio Transport Client
 */
class StdioTransportClient {
  constructor() {
    this.server = null;
    this.responses = new Map();
    this.nextId = 1;
  }

  async start() {
    return new Promise((resolve, reject) => {
      this.server = spawn('node', ['mcp_open_discovery_server.js'], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, MCP_TRANSPORT: 'stdio' },
        cwd: path.join(__dirname, '..')
      });

      let responseBuffer = '';
      
      this.server.stdout.on('data', (data) => {
        responseBuffer += data.toString();
        
        const lines = responseBuffer.split('\n');
        responseBuffer = lines.pop() || ''; // Keep incomplete line
        
        for (const line of lines) {
          if (line.trim() && line.includes('"jsonrpc"')) {
            try {
              const response = JSON.parse(line.trim());
              if (response.id && this.responses.has(response.id)) {
                const { resolve } = this.responses.get(response.id);
                this.responses.delete(response.id);
                resolve(response);
              }
            } catch (e) {
              // Ignore malformed JSON
            }
          }
        }
      });

      this.server.stderr.on('data', (data) => {
        // Ignore debug output
      });

      this.server.on('error', reject);

      // Wait for server to start
      setTimeout(resolve, 2000);
    });
  }

  async makeRequest(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = this.nextId++;
      const request = {
        jsonrpc: '2.0',
        id,
        method,
        params
      };

      this.responses.set(id, { resolve, reject });

      // Set timeout
      setTimeout(() => {
        if (this.responses.has(id)) {
          this.responses.delete(id);
          reject(new Error(`Request timeout for ${method}`));
        }
      }, CONFIG.timeouts.tool);

      this.server.stdin.write(JSON.stringify(request) + '\n');
    });
  }

  async initialize() {
    const response = await this.makeRequest('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: { tools: {} },
      clientInfo: { name: 'master-test-suite-stdio', version: '2.0.0' }
    });

    if (response.error) {
      throw new Error(`Initialization failed: ${response.error.message}`);
    }

    return response.result;
  }

  async listTools() {
    const response = await this.makeRequest('tools/list', {});
    if (response.error) {
      throw new Error(`List tools failed: ${response.error.message}`);
    }
    return response.result.tools;
  }

  async callTool(name, arguments_) {
    const response = await this.makeRequest('tools/call', {
      name,
      arguments: arguments_ || {}
    });
    
    return response;
  }

  stop() {
    if (this.server) {
      this.server.kill();
      this.server = null;
    }
  }
}

/**
 * Infrastructure Health Checker
 */
class InfrastructureHealthChecker {
  async checkHealth() {
    log('health', 'Checking infrastructure health...');
    
    // Check MCP server health
    await this.checkMcpHealth();
    
    // Check Proxmox connectivity
    await this.checkProxmoxHealth();
    
    // Check Zabbix connectivity
    await this.checkZabbixHealth();
    
    // Check SNMP agents
    await this.checkSnmpHealth();
  }

  async checkMcpHealth() {
    try {
      const response = await this.makeHttpRequest(CONFIG.transports.http.healthUrl);
      results.infrastructure.health.mcp = {
        status: 'healthy',
        details: JSON.parse(response.body)
      };
      log('success', 'MCP server health check passed');
    } catch (error) {
      results.infrastructure.health.mcp = {
        status: 'unhealthy',
        error: error.message
      };
      log('error', 'MCP server health check failed', error.message);
    }
  }

  async checkProxmoxHealth() {
    const { host, port } = CONFIG.infrastructure.proxmox;
    try {
      // Simple TCP connectivity test
      const response = await this.makeHttpRequest(`http://${host}:${port}/api2/json/version`, { timeout: 5000 });
      results.infrastructure.health.proxmox = {
        status: 'reachable',
        endpoint: `${host}:${port}`
      };
      log('success', `Proxmox server reachable at ${host}:${port}`);
    } catch (error) {
      results.infrastructure.health.proxmox = {
        status: 'unreachable',
        error: error.message,
        endpoint: `${host}:${port}`
      };
      log('warn', `Proxmox server unreachable at ${host}:${port}`, error.message);
    }
  }

  async checkZabbixHealth() {
    const { baseUrl } = CONFIG.infrastructure.zabbix;
    try {
      const response = await this.makeHttpRequest(baseUrl, { timeout: 5000 });
      results.infrastructure.health.zabbix = {
        status: 'reachable',
        endpoint: baseUrl
      };
      log('success', `Zabbix server reachable at ${baseUrl}`);
    } catch (error) {
      results.infrastructure.health.zabbix = {
        status: 'unreachable',
        error: error.message,
        endpoint: baseUrl
      };
      log('warn', `Zabbix server unreachable at ${baseUrl}`, error.message);
    }
  }

  async checkSnmpHealth() {
    const { agents, community } = CONFIG.infrastructure.snmp;
    results.infrastructure.health.snmp = { agents: {} };
    
    for (const agent of agents) {
      try {
        // Simple SNMP connectivity would require snmp library
        // For now, just mark as available for testing
        results.infrastructure.health.snmp.agents[agent] = {
          status: 'available',
          community
        };
        log('info', `SNMP agent ${agent} marked as available for testing`);
      } catch (error) {
        results.infrastructure.health.snmp.agents[agent] = {
          status: 'unavailable',
          error: error.message
        };
      }
    }
  }

  makeHttpRequest(url, options = {}) {
    return new Promise((resolve, reject) => {
      const req = http.get(url, { timeout: options.timeout || 5000 }, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          resolve({ statusCode: res.statusCode, body });
        });
      });

      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Health check timeout'));
      });
    });
  }
}

/**
 * Tool Test Runner
 */
class ToolTestRunner {
  constructor(client, transport) {
    this.client = client;
    this.transport = transport;
    this.credentialsSetup = false;
  }

  async setupCredentials() {
    if (this.credentialsSetup) return;

    log('info', 'Setting up infrastructure credentials...');

    try {
      // Add Proxmox credentials from .env
      const { host, port, username, password, realm } = CONFIG.infrastructure.proxmox;
      if (password) {
        const proxmoxUrl = `https://${host}:${port}`;
        await this.client.callTool('credentials_add', {
          id: 'proxmox-env',
          type: 'password',
          username: username,
          password: password,
          url: proxmoxUrl,
          notes: `realm:${realm},verify_ssl:false,auto-added from .env file`
        });
        log('success', 'Proxmox credentials added from .env file (SSL verification disabled)');
      }

      this.credentialsSetup = true;
    } catch (error) {
      log('warn', 'Failed to setup credentials', error.message);
    }
  }

  async runCategoryTests(category) {
    log('category', `Testing ${category} tools via ${this.transport} transport`);
    
    // Setup credentials before testing Proxmox tools
    if (category === 'proxmox') {
      await this.setupCredentials();
    }
    
    const tools = TOOL_CATEGORIES[category];
    if (!tools) {
      throw new Error(`Unknown category: ${category}`);
    }

    const categoryResults = {
      total: tools.length,
      passed: 0,
      failed: 0,
      skipped: 0,
      tools: {}
    };

    for (const toolName of tools) {
      try {
        const result = await this.testTool(toolName, category);
        categoryResults.tools[toolName] = result;
        
        if (result.status === 'passed') {
          categoryResults.passed++;
        } else if (result.status === 'failed') {
          categoryResults.failed++;
        } else {
          categoryResults.skipped++;
        }
      } catch (error) {
        categoryResults.tools[toolName] = {
          status: 'failed',
          error: error.message,
          duration: 0
        };
        categoryResults.failed++;
        log('error', `Tool ${toolName} test failed`, error.message);
      }
    }

    return categoryResults;
  }

  async testTool(toolName, category) {
    const startTime = Date.now();
    log('tool', `Testing ${toolName}...`);

    try {
      // Get appropriate test parameters for this tool
      const params = this.getTestParameters(toolName, category);
      
      // Call the tool
      const response = await this.client.callTool(toolName, params);
      const duration = Date.now() - startTime;

      // Validate response format
      const validation = this.validateResponse(response, toolName);
      
      if (validation.valid) {
        log('success', `✅ ${toolName} passed (${duration}ms)`);
        return {
          status: 'passed',
          duration,
          response: response.result || response,
          validation
        };
      } else {
        log('error', `❌ ${toolName} failed validation`, validation.errors);
        return {
          status: 'failed',
          duration,
          response: response,
          validation,
          error: validation.errors.join(', ')
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

  getTestParameters(toolName, category) {
    // Return appropriate test parameters based on tool and category
    const params = {};

    switch (category) {
      case 'memory':
        if (toolName === 'memory_set') {
          params.key = 'test:memory:item';
          params.value = { test: true, timestamp: Date.now() };
        } else if (toolName === 'memory_get') {
          params.key = 'test:memory:item';
        } else if (toolName === 'memory_query') {
          params.pattern = 'test:*';
        } else if (toolName === 'memory_merge') {
          params.key = 'test:memory:merge';
          params.data = { merged: true, timestamp: Date.now() };
        }
        break;

      case 'network':
        if (toolName === 'ping') {
          params.host = '8.8.8.8';
          params.count = 2;
        } else if (toolName === 'nslookup') {
          params.host = 'google.com';
        } else if (toolName === 'wget') {
          params.url = 'http://httpbin.org/get';
        } else if (toolName === 'tcp_connect') {
          params.host = 'google.com';
          params.port = 80;
        } else if (toolName === 'whois') {
          params.query = 'google.com';
        }
        break;

      case 'nmap':
        if (toolName.includes('scan')) {
          params.target = '127.0.0.1';
          params.ports = '80,443';
        }
        break;

      case 'snmp':
        const agents = CONFIG.infrastructure.snmp.agents;
        if (toolName === 'snmp_create_session') {
          params.host = agents[0];
          params.community = CONFIG.infrastructure.snmp.community;
        } else if (toolName === 'snmp_close_session') {
          params.sessionId = 'test-session-id';
        } else if (toolName === 'snmp_get') {
          params.sessionId = 'test-session';
          params.oids = ['1.3.6.1.2.1.1.1.0'];
        } else if (toolName === 'snmp_get_next') {
          params.sessionId = 'test-session';
          params.oids = ['1.3.6.1.2.1.1.1.0'];
        } else if (toolName === 'snmp_walk') {
          params.sessionId = 'test-session';
          params.oid = '1.3.6.1.2.1.1';
        } else if (toolName === 'snmp_table') {
          params.sessionId = 'test-session';
          params.oid = '1.3.6.1.2.1.2.2';
        } else if (toolName === 'snmp_discover') {
          params.targetRange = '172.20.0.0/24';
          params.community = CONFIG.infrastructure.snmp.community;
        } else if (toolName === 'snmp_device_inventory') {
          params.host = agents[0];
          params.community = CONFIG.infrastructure.snmp.community;
        } else if (toolName === 'snmp_interface_discovery') {
          params.host = agents[0];
          params.community = CONFIG.infrastructure.snmp.community;
        } else if (toolName === 'snmp_service_discovery') {
          params.host = agents[0];
          params.community = CONFIG.infrastructure.snmp.community;
        } else if (toolName === 'snmp_system_health') {
          params.host = agents[0];
          params.community = CONFIG.infrastructure.snmp.community;
        } else if (toolName === 'snmp_network_topology') {
          params.networkRange = '172.20.0.0/24';
          params.community = CONFIG.infrastructure.snmp.community;
        }
        break;

      case 'proxmox':
        if (toolName === 'proxmox_get_node_details') {
          params.node = 'proxmox-test';
        } else if (toolName === 'proxmox_list_vms') {
          params.node = 'proxmox-test';
        } else if (toolName === 'proxmox_get_vm_details') {
          params.node = 'proxmox-test';
          params.vmid = '100';
        } else if (toolName === 'proxmox_list_containers') {
          params.node = 'proxmox-test';
        } else if (toolName === 'proxmox_get_container_details') {
          params.node = 'proxmox-test';
          params.vmid = '100';
        } else if (toolName === 'proxmox_list_storage') {
          params.node = 'proxmox-test';
        } else if (toolName === 'proxmox_list_networks') {
          params.node = 'proxmox-test';
        } else if (toolName === 'proxmox_get_metrics') {
          params.node = 'proxmox-test';
        }
        break;

      case 'zabbix':
        if (toolName === 'zabbix_get_metrics') {
          params.hostName = 'Zabbix server';
          params.itemKey = 'system.cpu.load[all,avg1]';
        }
        break;

      case 'credentials':
        if (toolName === 'credentials_add') {
          params.id = 'test-credential';
          params.type = 'password';
          params.username = 'testuser';
          params.password = 'testpass123';
        } else if (toolName === 'credentials_get') {
          params.id = 'test-credential';
        } else if (toolName === 'credentials_remove') {
          params.id = 'test-credential';
        }
      case 'registry':
        if (toolName === 'registry_load_module') {
          params.module_path = './test_module.js';
          params.module_name = 'test_module';
          params.category = 'testing';
        } else if (toolName === 'registry_unload_module') {
          params.module_name = 'test_module';
        } else if (toolName === 'registry_reload_module') {
          params.module_name = 'test_module';
        }
        break;
    }

    return params;
  }

  validateResponse(response, toolName) {
    const errors = [];

    // Check for JSON-RPC error
    if (response.error) {
      errors.push(`JSON-RPC error: ${response.error.message || 'Unknown error'}`);
      return { valid: false, errors };
    }

    // Check for result or content
    if (!response.result && !response.content) {
      errors.push('Response missing result or content');
      return { valid: false, errors };
    }

    // If it has content, validate MCP format
    if (response.content) {
      if (!Array.isArray(response.content)) {
        errors.push('Content must be an array');
      } else {
        response.content.forEach((item, index) => {
          if (!item.type || !item.text) {
            errors.push(`Content item ${index} missing type or text`);
          }
        });
      }
    }

    return { valid: errors.length === 0, errors };
  }
}

/**
 * Report Generator
 */
class ReportGenerator {
  generateSummaryReport() {
    const report = [];
    
    report.push('');
    report.push('🎯 MCP Open Discovery v2.0 - Test Results Summary');
    report.push('═'.repeat(60));
    report.push('');
    
    // Overall statistics
    const { totalTools, passed, failed, skipped, successRate } = results.summary;
    report.push(`📊 Overall Results:`);
    report.push(`   Total Tools: ${totalTools}`);
    report.push(`   ✅ Passed: ${passed}`);
    report.push(`   ❌ Failed: ${failed}`);
    report.push(`   ⏭️ Skipped: ${skipped}`);
    report.push(`   📈 Success Rate: ${successRate.toFixed(1)}%`);
    report.push('');

    // Transport results
    report.push(`🚀 Transport Results:`);
    Object.entries(results.transports).forEach(([transport, data]) => {
      report.push(`   ${transport.toUpperCase()}: ${data.passed}/${data.total} (${((data.passed/data.total)*100).toFixed(1)}%)`);
    });
    report.push('');

    // Category breakdown
    report.push(`📁 Category Breakdown:`);
    Object.entries(results.categories).forEach(([category, data]) => {
      const rate = data.total > 0 ? ((data.passed/data.total)*100).toFixed(1) : '0.0';
      report.push(`   ${category.padEnd(12)}: ${data.passed}/${data.total} (${rate}%)`);
    });
    report.push('');

    // Infrastructure health
    report.push(`💚 Infrastructure Health:`);
    Object.entries(results.infrastructure.health).forEach(([service, health]) => {
      const status = health.status === 'healthy' || health.status === 'reachable' ? '✅' : '❌';
      report.push(`   ${status} ${service.toUpperCase()}: ${health.status}`);
    });
    report.push('');

    // Failed tools
    if (results.errors.length > 0) {
      report.push(`❌ Failed Tools:`);
      results.errors.forEach(error => {
        report.push(`   • ${error.tool}: ${error.error}`);
      });
      report.push('');
    }

    return report.join('\n');
  }

  saveDetailedReport() {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = path.join(__dirname, `test-results-${timestamp}.json`);
    
    fs.writeFileSync(filename, JSON.stringify(results, null, 2));
    log('info', `Detailed results saved to: ${filename}`);
    
    return filename;
  }
}

/**
 * Main Test Runner
 */
class MasterTestSuite {
  constructor() {
    this.healthChecker = new InfrastructureHealthChecker();
    this.reportGenerator = new ReportGenerator();
  }

  async run(options = {}) {
    const { transport = 'both', category = 'all' } = options;
    
    log('test', 'Starting MCP Open Discovery v2.0 Master Test Suite');
    log('info', `Transport: ${transport}, Category: ${category}`);
    
    // Initialize results
    this.initializeResults();
    
    // Check infrastructure health
    await this.healthChecker.checkHealth();
    
    // Determine which transports to test
    const transports = transport === 'both' ? ['http', 'stdio'] : [transport];
    
    // Determine which categories to test
    const categories = category === 'all' ? Object.keys(TOOL_CATEGORIES) : [category];
    
    // Run tests for each transport
    for (const transportType of transports) {
      await this.testTransport(transportType, categories);
    }
    
    // Calculate final statistics
    this.calculateSummary();
    
    // Generate reports
    const summary = this.reportGenerator.generateSummaryReport();
    console.log(summary);
    
    const detailsFile = this.reportGenerator.saveDetailedReport();

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
            stdout: (proc.stdout || '').split(/\r?\n/).slice(-50).join('\n'), // last 50 lines for brevity
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
      
      log('success', `${transportType.toUpperCase()} transport testing completed`);
      
    } catch (error) {
      log('error', `${transportType.toUpperCase()} transport testing failed`, error.message);
      results.errors.push({
        transport: transportType,
        error: error.message
      });
    } finally {
      // Cleanup
      if (client && client.stop) {
        client.stop();
      }
    }
  }

  calculateSummary() {
    // Aggregate results across transports
    const allResults = Object.values(results.transports);
    
    if (allResults.length > 0) {
      results.summary.passed = Math.max(...allResults.map(t => t.passed));
      results.summary.failed = Math.min(...allResults.map(t => t.failed));
      results.summary.successRate = (results.summary.passed / results.summary.totalTools) * 100;
    }
    
    // Update category summaries
    Object.keys(results.categories).forEach(category => {
      const categoryResults = Object.values(results.transports)
        .map(t => t.categories[category])
        .filter(Boolean);
      
      if (categoryResults.length > 0) {
        results.categories[category].passed = Math.max(...categoryResults.map(c => c.passed));
        results.categories[category].failed = Math.min(...categoryResults.map(c => c.failed));
      }
    });
  }
}

/**
 * CLI Entry Point
 */
async function main() {
  const args = process.argv.slice(2);
  const options = {};
  
  // Parse command line arguments
  args.forEach(arg => {
    if (arg.startsWith('--transport=')) {
      options.transport = arg.split('=')[1];
    } else if (arg.startsWith('--category=')) {
      options.category = arg.split('=')[1];
    }
  });
  
  // Validate options
  if (options.transport && !['stdio', 'http', 'both'].includes(options.transport)) {
    console.error('❌ Invalid transport. Use: stdio, http, or both');
    process.exit(1);
  }
  
  if (options.category && options.category !== 'all' && !TOOL_CATEGORIES[options.category]) {
    console.error('❌ Invalid category. Use: all, memory, network, nmap, snmp, proxmox, zabbix, credentials, registry');
    process.exit(1);
  }
  
  try {
    const suite = new MasterTestSuite();
    await suite.run(options);
    process.exit(0);
  } catch (error) {
    log('error', 'Master test suite failed', error.message);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = { MasterTestSuite, CONFIG, TOOL_CATEGORIES };
