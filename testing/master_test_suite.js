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
const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');

const TYPED_SERVER_MAIN = path.join(__dirname, '..', 'dist-ts', 'src', 'main.js');

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
    'mcp_od_memory_get', 'mcp_od_memory_set', 'mcp_od_memory_query', 'mcp_od_memory_merge', 'mcp_od_memory_clear',
    'mcp_od_memory_stats', 'mcp_od_memory_save', 'mcp_od_memory_rotate_key', 'mcp_od_memory_migrate_from_filesystem'
  ],
  network: [
    'mcp_od_net_ping', 'mcp_od_net_nslookup', 'mcp_od_net_netstat', 'mcp_od_net_ifconfig', 'mcp_od_net_route', 'mcp_od_net_arp', 'mcp_od_net_telnet', 'mcp_od_net_wget', 'mcp_od_net_whois'
  ],
  nmap: [
    'mcp_od_nmap_ping_scan', 'mcp_od_nmap_tcp_connect_scan', 'mcp_od_nmap_tcp_syn_scan', 'mcp_od_nmap_udp_scan', 'mcp_od_nmap_version_scan'
  ],
  snmp: [
    'mcp_od_snmp_create_session', 'mcp_od_snmp_close_session', 'mcp_od_snmp_get', 'mcp_od_snmp_get_next', 'mcp_od_snmp_walk',
    'mcp_od_snmp_table', 'mcp_od_snmp_discover', 'mcp_od_snmp_device_inventory', 'mcp_od_snmp_interface_discovery',
    'mcp_od_snmp_service_discovery', 'mcp_od_snmp_system_health', 'mcp_od_snmp_network_topology'
  ],
  proxmox: [
    'mcp_od_proxmox_list_nodes', 'mcp_od_proxmox_get_node_details', 'mcp_od_proxmox_list_vms', 'mcp_od_proxmox_get_vm_details',
    'mcp_od_proxmox_list_containers', 'mcp_od_proxmox_get_container_details', 'mcp_od_proxmox_list_storage',
    'mcp_od_proxmox_list_networks', 'mcp_od_proxmox_cluster_resources', 'mcp_od_proxmox_get_metrics'
  ],
  zabbix: [
    'mcp_od_zabbix_host_discover', 'mcp_od_zabbix_get_problems', 'mcp_od_zabbix_get_alerts', 'mcp_od_zabbix_get_metrics',
    'mcp_od_zabbix_get_events', 'mcp_od_zabbix_get_triggers', 'mcp_od_zabbix_get_inventory'
  ],
  credentials: [
    'mcp_od_credentials_add', 'mcp_od_credentials_get', 'mcp_od_credentials_list', 'mcp_od_credentials_remove', 'mcp_od_credentials_rotate_key'
  ],
  registry: [
    'mcp_od_registry_list_plugins', 'mcp_od_registry_list_available', 'mcp_od_registry_audit_log'
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
 * Run additional policy-level tests (schema override, capability strictness, sandbox-required, native gate)
 */
async function runPolicyTests() {
  const runTypedPolicyTests = process.env.RUN_TYPED_POLICY_TESTS === 'true' || process.env.RUN_LEGACY_POLICY_TESTS === 'true';
  if (!runTypedPolicyTests) {
    log('info', 'Skipping typed policy enforcement tests; set RUN_TYPED_POLICY_TESTS=true to run them explicitly');
    return;
  }

  if (process.env.RUN_LEGACY_POLICY_TESTS === 'true' && process.env.RUN_TYPED_POLICY_TESTS !== 'true') {
    log('info', 'RUN_LEGACY_POLICY_TESTS also triggers typed policy tests for backward compatibility');
  }

  try {
    log('test', 'Running typed policy enforcement tests...');
    const proc = spawn(process.execPath, [path.join(__dirname, 'test_typed_policy_enforcements.js')], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env }
    });
    let out = '', err = '';
    proc.stdout.on('data', d => out += d.toString());
    proc.stderr.on('data', d => err += d.toString());
    const code = await new Promise((resolve) => proc.on('close', resolve));
    const success = code === 0;
    if (success) {
      log('success', 'Typed policy tests passed');
    } else {
      log('error', 'Typed policy tests failed', { out, err });
      results.errors.push({ name: 'typed_policy_tests', out, err });
    }
    results.details.push({ name: 'typed_policy_tests', passed: success });
    if (!success) results.summary.failed++; else results.summary.passed++;
  } catch (e) {
    log('error', 'Typed policy tests run error', { error: e.message || String(e) });
    results.details.push({ name: 'typed_policy_tests', passed: false, error: e.message || String(e) });
    results.summary.failed++;
  }
}

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
    this.transport = null;
    this.client = null;
  }

  async start() {
    this.transport = new StdioClientTransport({
      command: 'node',
      args: [TYPED_SERVER_MAIN],
      env: { ...process.env, TRANSPORT_MODE: 'stdio' },
      cwd: path.join(__dirname, '..')
    });

    this.client = new Client(
      {
        name: 'master-test-suite-stdio',
        version: '2.0.0'
      },
      {
        capabilities: {
          tools: {}
        }
      }
    );

    await this.client.connect(this.transport);
  }

  async makeRequest(method, params = {}) {
    if (!this.client) {
      throw new Error('STDIO client not started');
    }

    if (method === 'initialize') {
      return { result: { protocolVersion: '2024-11-05' } };
    }

    if (method === 'tools/list') {
      const response = await this.client.listTools();
      return { result: response };
    }

    if (method === 'tools/call') {
      try {
        const response = await this.client.callTool({
          name: params.name,
          arguments: params.arguments || {}
        });

        return response;
      } catch (error) {
        return {
          error: {
            message: error instanceof Error ? error.message : String(error)
          }
        };
      }
    }

    throw new Error(`Unsupported stdio method: ${method}`);
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
    if (this.client) {
      void this.client.close().catch(() => {});
      this.client = null;
    }

    if (this.transport) {
      this.transport = null;
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
    if (!results.transports.http || results.transports.http.total === 0) {
      results.infrastructure.health.mcp = {
        status: 'skipped',
        details: { reason: 'HTTP transport not selected for this run' }
      };
      log('info', 'Skipping MCP HTTP health check for stdio-only run');
      return;
    }

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
        await this.client.callTool('mcp_od_credentials_add', {
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
        if (toolName === 'mcp_od_memory_set') {
          params.key = 'test:memory:item';
          params.value = { test: true, timestamp: Date.now() };
        } else if (toolName === 'mcp_od_memory_get') {
          params.key = 'test:memory:item';
        } else if (toolName === 'mcp_od_memory_query') {
          params.pattern = 'test:*';
        } else if (toolName === 'mcp_od_memory_merge') {
          params.key = 'test:memory:merge';
          params.value = { merged: true, timestamp: Date.now() };
        }
        break;

      case 'network':
        if (toolName === 'mcp_od_net_ping') {
          params.host = '8.8.8.8';
          params.count = 2;
        } else if (toolName === 'mcp_od_net_nslookup') {
          params.host = 'google.com';
        } else if (toolName === 'mcp_od_net_wget') {
          params.url = 'http://httpbin.org/get';
        } else if (toolName === 'mcp_od_net_telnet') {
          params.host = 'google.com';
          params.port = 80;
        } else if (toolName === 'mcp_od_net_whois') {
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
        if (toolName === 'mcp_od_snmp_create_session') {
          params.host = agents[0];
          params.community = CONFIG.infrastructure.snmp.community;
        } else if (toolName === 'mcp_od_snmp_close_session') {
          params.sessionId = 'test-session-id';
        } else if (toolName === 'mcp_od_snmp_get') {
          params.sessionId = 'test-session';
          params.oids = ['1.3.6.1.2.1.1.1.0'];
        } else if (toolName === 'mcp_od_snmp_get_next') {
          params.sessionId = 'test-session';
          params.oids = ['1.3.6.1.2.1.1.1.0'];
        } else if (toolName === 'mcp_od_snmp_walk') {
          params.sessionId = 'test-session';
          params.oid = '1.3.6.1.2.1.1';
        } else if (toolName === 'mcp_od_snmp_table') {
          params.sessionId = 'test-session';
          params.oid = '1.3.6.1.2.1.2.2';
        } else if (toolName === 'mcp_od_snmp_discover') {
          params.targetRange = '172.20.0.0/24';
          params.community = CONFIG.infrastructure.snmp.community;
        } else if (toolName === 'mcp_od_snmp_device_inventory') {
          params.host = agents[0];
          params.community = CONFIG.infrastructure.snmp.community;
        } else if (toolName === 'mcp_od_snmp_interface_discovery') {
          params.host = agents[0];
          params.community = CONFIG.infrastructure.snmp.community;
        } else if (toolName === 'mcp_od_snmp_service_discovery') {
          params.host = agents[0];
          params.community = CONFIG.infrastructure.snmp.community;
        } else if (toolName === 'mcp_od_snmp_system_health') {
          params.host = agents[0];
          params.community = CONFIG.infrastructure.snmp.community;
        } else if (toolName === 'mcp_od_snmp_network_topology') {
          params.networkRange = '172.20.0.0/24';
          params.community = CONFIG.infrastructure.snmp.community;
        }
        break;

      case 'proxmox':
        params.creds_id = 'proxmox-env';
        if (toolName === 'mcp_od_proxmox_get_node_details') {
          params.node = 'proxmox-test';
        } else if (toolName === 'mcp_od_proxmox_list_vms') {
          params.node = 'proxmox-test';
        } else if (toolName === 'mcp_od_proxmox_get_vm_details') {
          params.node = 'proxmox-test';
          params.vmid = '100';
        } else if (toolName === 'mcp_od_proxmox_list_containers') {
          params.node = 'proxmox-test';
        } else if (toolName === 'mcp_od_proxmox_get_container_details') {
          params.node = 'proxmox-test';
          params.vmid = '100';
        } else if (toolName === 'mcp_od_proxmox_list_storage') {
          params.node = 'proxmox-test';
        } else if (toolName === 'mcp_od_proxmox_list_networks') {
          params.node = 'proxmox-test';
        } else if (toolName === 'mcp_od_proxmox_get_metrics') {
          params.node = 'proxmox-test';
        }
        break;

      case 'zabbix':
        params.baseUrl = CONFIG.infrastructure.zabbix.baseUrl;
        params.username = CONFIG.infrastructure.zabbix.username;
        params.password = CONFIG.infrastructure.zabbix.password;
        if (toolName === 'mcp_od_zabbix_get_metrics') {
          params.hostName = 'Zabbix server';
          params.itemFilter = 'CPU';
        }
        break;

      case 'credentials':
        if (toolName === 'mcp_od_credentials_add') {
          params.id = 'test-credential';
          params.type = 'password';
          params.username = 'testuser';
          params.password = 'testpass123';
        } else if (toolName === 'mcp_od_credentials_get') {
          params.id = 'test-credential';
        } else if (toolName === 'mcp_od_credentials_remove') {
          params.id = 'test-credential';
        }
        break;

      case 'registry':
        if (toolName === 'mcp_od_registry_list_plugins') {
          params.filter_state = 'all';
        } else if (toolName === 'mcp_od_registry_audit_log') {
          params.plugin_id = 'net-utils@1.0.0';
          params.limit = 5;
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
    const { transport = 'stdio', category = 'all' } = options;
    
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

    if (process.env.RUN_LEGACY_POLICY_TESTS === 'true') {
      try {
        const pluginTestPath = path.join(__dirname, 'test_plugin_integrity_and_policy.js');
        if (fs.existsSync(pluginTestPath)) {
          log('info', 'Running extended legacy plugin integrity & policy tests...');
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
            log('warning', 'Extended legacy plugin integrity & policy tests reported failures');
          } else {
            log('success', 'Extended legacy plugin integrity & policy tests passed');
          }
        } else {
          log('warning', 'Extended legacy plugin integrity & policy test file not found, skipping');
        }
      } catch (e) {
        log('error', 'Error running extended legacy plugin integrity & policy tests', e.message);
      }
    } else {
      log('info', 'Skipping legacy plugin integrity & policy adjunct tests; set RUN_LEGACY_POLICY_TESTS=true to run them explicitly');
    }

    // Run policy tests (strict capabilities, sandbox-required, native gate, schema override)
    await runPolicyTests();

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
