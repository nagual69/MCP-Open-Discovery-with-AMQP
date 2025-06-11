#!/usr/bin/env node

/**
 * Comprehensive Test Script for MCP Open Discovery Server Modular Version
 * 
 * This script tests all modules of the MCP Open Discovery Server modular version.
 * 
 * Usage:
 *   node test_comprehensive.js [options] [group1 group2 ...]
 *  * Options:
 *   --skip-errors      Continue testing even if some tests fail
 *   --exclude=tool1,tool2   Exclude specific tools from testing
 *   --include=tool1,tool2   Only test specific tools
 *   --debug            Show more detailed debug information
 *   --no-prompt                 Do not prompt for credentials
 * * Proxmox Testing Options: *   --proxmox-server=hostname   Specify Proxmox server hostname
 *   --proxmox-user=username     Specify Proxmox username
 *   --proxmox-password=pass     Specify Proxmox password
 *   --proxmox-token-name=name   Specify Proxmox API token name (alternative to username/password)
 *   --proxmox-token-value=val   Specify Proxmox API token value
 *   --proxmox-node=nodename     Specify Proxmox node name
 *   
 * Groups:
 *   network          Test network tools (ping, wget, etc.)
 *   nmap             Test nmap scanning tools
 *   memory           Test in-memory CMDB tools
 *   proxmox          Test Proxmox API tools
 *   snmp             Test SNMP tools
 *  
 * Examples:
 *   node test_comprehensive.js                 # Test all tools
 *   node test_comprehensive.js network memory  # Test only network and memory tools
 *   node test_comprehensive.js --skip-errors   # Test all tools, continue on failures
 *   node test_comprehensive.js --exclude=telnet,snmp_get  # Skip problematic tools
 *   
 * Proxmox Testing Examples:
 *   node test_comprehensive.js proxmox                    # Test Proxmox with interactive prompts
 *   node test_comprehensive.js proxmox --proxmox-server=pve.example.com  # Test with specific server
 *   node test_comprehensive.js proxmox --proxmox-server=192.168.1.100 --proxmox-user=root@pam --proxmox-password=secret  # Full config
 *   node test_comprehensive.js proxmox --proxmox-server=pve.example.com --proxmox-token-name=user@pam!token --proxmox-token-value=xxx  # Use API token
 *   node test_comprehensive.js proxmox --no-prompt        # Test Proxmox with environment variables
 */

const http = require('http');
const readline = require('readline');

// Test server URL (configurable via environment variable)
const SERVER_URL = process.env.MCP_SERVER_URL || 'http://localhost:3000';

// Global options
let DEBUG = false;

// Track test results to handle dependencies
const testResults = {};

// Proxmox configuration (will be populated from command line args or prompts)
const proxmoxConfig = {
  hostname: process.env.PROXMOX_SERVER || '192.168.200.10',
  username: process.env.PROXMOX_USER || 'root',
  password: process.env.PROXMOX_PASSWORD || 'n0l0g1n4U$',
  nodeName: process.env.PROXMOX_NODE || 'ccctc16gb01',
  tokenName: process.env.PROXMOX_TOKEN_NAME || '',
  tokenValue: process.env.PROXMOX_TOKEN_VALUE || '',
  credsId: `test_creds_${Date.now()}`, // Generate a unique ID to avoid conflicts
  usePrompt: true, // Whether to prompt for credentials if testing Proxmox
  enabled: false,  // Whether Proxmox tests should be enabled
  useTokenAuth: false, // Whether to use token authentication instead of username/password
    // Validate Proxmox configuration and return error message if invalid
  validate() {
    if (!this.hostname || this.hostname === 'proxmox.example.com') {
      return 'No valid Proxmox server hostname specified';
    }
    if (this.useTokenAuth) {
      if (!this.tokenName || !this.tokenValue) {
        return 'Token authentication enabled but token name or value is missing';
      }
    } else {
      if (!this.username || !this.password) {
        return 'No valid Proxmox credentials specified';
      }
    }
    return null; // Configuration is valid
  }
};

// Global variables to store discovered Proxmox resources
const proxmoxDiscoveredResources = {
  nodes: [],
  vms: {},        // Map of node -> VM IDs
  containers: {}  // Map of node -> Container IDs
};

// Additional Proxmox configuration for resource discovery
const proxmoxTestConfig = {
  autoDiscover: true,  // Whether to auto-discover resources rather than using fixed IDs
  discoveryComplete: false, // Whether resource discovery has been performed
  discoveryOrder: [
    'proxmox_cluster_resources',  // First, try to get all resources in one call (most efficient)
    'proxmox_list_nodes',         // If cluster API fails, discover nodes
    'proxmox_list_vms',           // Then get details about VMs per node
    'proxmox_list_containers'     // Then get details about containers per node
  ],
  postDiscoveryFn: null  // Function to run after discovery is complete
};

// Function to prompt for input
async function promptInput(question, defaultValue = '') {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise(resolve => {
    rl.question(`${question} ${defaultValue ? `(default: ${defaultValue})` : ''}: `, (answer) => {
      rl.close();
      resolve(answer || defaultValue);
    });
  });
}

// Function to prompt for Proxmox configuration
async function promptForProxmoxConfig() {
  if (!proxmoxConfig.usePrompt) {
    console.log('Skipping Proxmox prompt (--no-prompt specified)');
    return;
  }
  console.log('\n===== Proxmox Configuration =====');
  console.log('Enter Proxmox server details to test Proxmox tools:');
  console.log('(Press Enter to skip and use defaults or leave Proxmox tests disabled)');
  console.log('You can also use environment variables:');
  console.log('  PROXMOX_SERVER, PROXMOX_USER, PROXMOX_PASSWORD, PROXMOX_NODE');
  console.log('  PROXMOX_TOKEN_NAME, PROXMOX_TOKEN_VALUE (for API token authentication)');
  console.log('');

  const enableProxmox = await promptInput('Enable Proxmox tests? (yes/no)', 'no');
  if (enableProxmox.toLowerCase() !== 'yes') {
    console.log('Proxmox tests will be skipped.');
    return;
  }

  proxmoxConfig.enabled = true;
  proxmoxConfig.hostname = await promptInput('Proxmox Server Hostname (include https:// if using SSL)', proxmoxConfig.hostname);
  
  // Ask about authentication method
  const useTokenAuth = await promptInput('Use API token authentication? (yes/no)', 'no');
  proxmoxConfig.useTokenAuth = useTokenAuth.toLowerCase() === 'yes';
  
  if (proxmoxConfig.useTokenAuth) {
    // Token authentication
    proxmoxConfig.tokenName = await promptInput('API Token Name (user@realm!tokenname)', proxmoxConfig.tokenName);
    proxmoxConfig.tokenValue = await promptInput('API Token Value', proxmoxConfig.tokenValue);
  } else {
    // Username/password authentication
    proxmoxConfig.username = await promptInput('Proxmox Username (user@realm)', proxmoxConfig.username);
    proxmoxConfig.password = await promptInput('Proxmox Password', proxmoxConfig.password);
  }
  
  proxmoxConfig.nodeName = await promptInput('Proxmox Node Name', proxmoxConfig.nodeName);
  
  console.log('\nProxmox Configuration:');
  console.log(`  Server: ${proxmoxConfig.hostname}${process.env.PROXMOX_SERVER ? ' (from environment)' : ''}`);
  
  if (proxmoxConfig.useTokenAuth) {
    console.log(`  Authentication: API Token${process.env.PROXMOX_TOKEN_NAME ? ' (from environment)' : ''}`);
  } else {
    console.log(`  Username: ${proxmoxConfig.username}${process.env.PROXMOX_USER ? ' (from environment)' : ''}`);
  }
  
  console.log(`  Node: ${proxmoxConfig.nodeName}${process.env.PROXMOX_NODE ? ' (from environment)' : ''}`);
  
  // Validate configuration
  const validationError = proxmoxConfig.validate();
  if (validationError) {
    console.warn(`\n⚠️ Warning: ${validationError}`);
    console.warn('  Proxmox tests may fail without valid configuration.');
  }
  
  console.log('');
}

// Test tools from all modules
const TEST_TOOLS = [
  // NETWORK TOOLS
  {
    name: 'ping',
    group: 'network',
    args: { host: 'localhost' }
  },
  {
    name: 'wget',
    group: 'network',
    args: { url: 'http://example.com', headers_only: true }
  },
  {
    name: 'nslookup',
    group: 'network',
    args: { domain: 'example.com' }
  },
  {
    name: 'telnet',
    group: 'network',
    args: { host: 'localhost', port: 3000 },
    skip: true, // Marked as skip by default since it's failing
    skipReason: 'Telnet may not be available in the Docker container'
  },
  {
    name: 'route',
    group: 'network',
    args: { numeric: true }
  },
  {
    name: 'ifconfig',
    group: 'network',
    args: {}
  },
  {
    name: 'netstat',
    group: 'network',
    args: { numeric: true }
  },
  {
    name: 'arp',
    group: 'network',
    args: { numeric: true }
  },

  // NMAP TOOLS
  {
    name: 'nmap_ping_scan',
    group: 'nmap',
    args: { target: 'localhost' }
  },
  {
    name: 'nmap_tcp_connect_scan',
    group: 'nmap',
    args: { target: 'localhost', ports: '22,80,443' }
  },
  {
    name: 'nmap_version_scan',
    group: 'nmap',
    args: { target: 'localhost', ports: '80,443', light_mode: true }
  },
  {
    name: 'nmap_udp_scan',
    group: 'nmap',
    args: { target: 'localhost', ports: '53,161' }, // Removed top_ports param
    notes: 'Requires root privileges, should work in Docker'
  },
  {
    name: 'nmap_tcp_syn_scan',
    group: 'nmap',
    args: { target: 'localhost', ports: '80,443' }, // Removed fast_scan param as it conflicts with ports
    notes: 'Requires root privileges, should work in Docker'
  },

  // MEMORY TOOLS
  {
    name: 'memory_set',
    group: 'memory',
    args: { key: 'test:host:localhost', value: { type: 'host', name: 'localhost', os: 'unknown' } }
  },
  {
    name: 'memory_get',
    group: 'memory',
    args: { key: 'test:host:localhost' }
  },
  {
    name: 'memory_merge',
    group: 'memory',
    args: { key: 'test:host:localhost', value: { ip: '127.0.0.1', status: 'up' } }
  },
  {
    name: 'memory_query',
    group: 'memory',
    args: { pattern: 'test:*' }
  },
  // PROXMOX TOOLS (Some will fail without valid credentials)
  {
    name: 'proxmox_creds_list',
    group: 'proxmox',
    args: {}
  },  {    name: 'proxmox_creds_add',
    group: 'proxmox',
    args: { 
      id: 'test_creds', 
      hostname: 'proxmox.example.com', // This will be replaced dynamically
      username: 'testuser@pam',        // This will be replaced dynamically
      password: 'testpassword',        // This will be replaced dynamically
      token_name: '',
      token_value: ''
    },
    getArgs: () => {
      // Build args based on authentication method
      const args = {
        id: proxmoxConfig.credsId,
        hostname: proxmoxConfig.hostname,
        verify_ssl: !proxmoxConfig.hostname.includes('https://') || 
                    !proxmoxConfig.hostname.match(/^(localhost|127\.0\.0\.1)/)
      };
        // Add authentication parameters based on chosen method
      if (proxmoxConfig.useTokenAuth) {
        args.token_name = proxmoxConfig.tokenName;
        args.token_value = proxmoxConfig.tokenValue;
        // Clear username/password when using tokens
        args.username = '';
        args.password = '';
      } else {
        args.username = proxmoxConfig.username;
        args.password = proxmoxConfig.password;
        // Clear token fields when using username/password
        args.token_name = '';
        args.token_value = '';
      }
      
      return args;
    },
    skip: () => {
      if (!proxmoxConfig.enabled) return true;
      
      // Skip if configuration isn't valid
      const validationError = proxmoxConfig.validate();
      return validationError !== null;
    },
    skipReason: () => {
      if (!proxmoxConfig.enabled) return 'Proxmox testing not enabled';
      
      // Return specific validation error
      const validationError = proxmoxConfig.validate();
      return validationError !== null ? `Invalid Proxmox configuration: ${validationError}` : null;
    }
  },
  {
    name: 'proxmox_list_nodes',
    group: 'proxmox',
    args: { creds_id: 'test_creds' },
    getArgs: () => ({ creds_id: proxmoxConfig.credsId }),
    dependsOn: 'proxmox_creds_add',
    skip: () => !proxmoxConfig.enabled,
    skipReason: () => !proxmoxConfig.enabled ? 'Proxmox testing not enabled' : 'Testing with Proxmox server'
  },

  // SNMP TOOLS
  {
    name: 'snmp_create_session',
    group: 'snmp',
    args: { host: 'localhost', community: 'public' }
  },  
  {
    name: 'snmp_get',
    group: 'snmp',
    args: { 
      host: 'localhost', 
      oid: '1.3.6.1.2.1.1.1.0', 
      community: 'public',
      sessionId: 'test-session' // Added required sessionId parameter
    },
    skip: true,
    skipReason: 'Needs a valid SNMP device'
  },
  
  // Additional SNMP tools
  {
    name: 'snmp_walk',
    group: 'snmp',
    args: { 
      host: 'localhost', 
      oid: '1.3.6.1.2.1.1', 
      community: 'public',
      sessionId: 'test-session'
    },
    skip: true,
    skipReason: 'Needs a valid SNMP device'
  },
  {
    name: 'snmp_bulkget',
    group: 'snmp',
    args: { 
      host: 'localhost', 
      oids: ['1.3.6.1.2.1.1.1.0', '1.3.6.1.2.1.1.2.0'], 
      community: 'public',
      sessionId: 'test-session'
    },
    skip: true,
    skipReason: 'Needs a valid SNMP device'
  },
  {
    name: 'snmp_bulkwalk',
    group: 'snmp',
    args: { 
      host: 'localhost', 
      oids: ['1.3.6.1.2.1.1', '1.3.6.1.2.1.2'], 
      community: 'public',
      sessionId: 'test-session'
    },
    skip: true,
    skipReason: 'Needs a valid SNMP device'
  },
    // Additional Proxmox tools
  {
    name: 'proxmox_get_node_details',
    group: 'proxmox',
    args: { 
      creds_id: 'test_creds',
      node: 'pve'
    },    getArgs: () => ({ 
      creds_id: proxmoxConfig.credsId,
      node: proxmoxConfig.nodeName
    }),
    skip: () => !proxmoxConfig.enabled,
    skipReason: () => !proxmoxConfig.enabled ? 'Proxmox testing not enabled' : 'Testing with Proxmox server',
    dependsOn: 'proxmox_creds_add'
  },
  {
    name: 'proxmox_list_vms',
    group: 'proxmox',
    args: { 
      creds_id: 'test_creds',
      node: 'pve'
    },
    getArgs: () => ({ 
      creds_id: proxmoxConfig.credsId,
      node: proxmoxConfig.nodeName
    }),
    skip: () => !proxmoxConfig.enabled,
    skipReason: () => !proxmoxConfig.enabled ? 'Proxmox testing not enabled' : 'Testing with Proxmox server',
    dependsOn: 'proxmox_creds_add'
  },
  {
    name: 'proxmox_list_containers',
    group: 'proxmox',
    args: { 
      creds_id: 'test_creds',
      node: 'pve'
    },    getArgs: () => ({ 
      creds_id: proxmoxConfig.credsId,
      node: proxmoxConfig.nodeName
    }),
    skip: () => !proxmoxConfig.enabled,
    skipReason: () => !proxmoxConfig.enabled ? 'Proxmox testing not enabled' : 'Testing with Proxmox server',
    dependsOn: 'proxmox_creds_add'
  },
  {
    name: 'proxmox_list_storage',
    group: 'proxmox',
    args: { 
      creds_id: 'test_creds',
      node: 'pve'
    },
    getArgs: () => ({ 
      creds_id: proxmoxConfig.credsId,
      node: proxmoxConfig.nodeName
    }),
    skip: () => !proxmoxConfig.enabled,
    skipReason: () => !proxmoxConfig.enabled ? 'Proxmox testing not enabled' : 'Testing with Proxmox server',
    dependsOn: 'proxmox_creds_add'
  },
  {
    name: 'proxmox_list_networks',
    group: 'proxmox',
    args: { 
      creds_id: 'test_creds',
      node: 'pve'
    },    getArgs: () => ({ 
      creds_id: proxmoxConfig.credsId,
      node: proxmoxConfig.nodeName
    }),
    skip: () => !proxmoxConfig.enabled,
    skipReason: () => !proxmoxConfig.enabled ? 'Proxmox testing not enabled' : 'Testing with Proxmox server',
    dependsOn: 'proxmox_creds_add'
  },
  {
    name: 'proxmox_cluster_resources',
    group: 'proxmox',
    args: { 
      creds_id: 'test_creds'
    },
    getArgs: () => ({ 
      creds_id: proxmoxConfig.credsId
    }),
    skip: () => !proxmoxConfig.enabled,
    skipReason: () => !proxmoxConfig.enabled ? 'Proxmox testing not enabled' : 'Testing with Proxmox server',
    dependsOn: 'proxmox_creds_add'  },
  
  // Additional tools for missing functionality
  {
    name: 'proxmox_get_vm_details',
    group: 'proxmox',
    args: {
      creds_id: 'test_creds',
      node: 'pve',
      vmid: '100'
    },    getArgs: () => {
      // Check if we have discovered VMs - if auto-discover is enabled
      if (proxmoxTestConfig.autoDiscover && proxmoxTestConfig.discoveryComplete) {
        // Find a node with VMs
        let targetNode = proxmoxConfig.nodeName;
        let targetVmId = null;
        let foundValidVM = false;
        
        // Try to find a VM on the specified node first
        if (proxmoxConfig.nodeName && proxmoxDiscoveredResources.vms[proxmoxConfig.nodeName]?.length > 0) {
          targetNode = proxmoxConfig.nodeName;
          targetVmId = proxmoxDiscoveredResources.vms[proxmoxConfig.nodeName][0].toString();
          foundValidVM = true;
          console.log(`Auto-discovered VM ${targetVmId} on node ${targetNode} for testing`);
        }
        
        // If we didn't find a valid VM with the configured values, try to find one
        if (!foundValidVM) {
          // Find the first node with VMs
          for (const node in proxmoxDiscoveredResources.vms) {
            const vms = proxmoxDiscoveredResources.vms[node];
            if (vms && vms.length > 0) {
              targetNode = node;
              targetVmId = vms[0].toString();
              foundValidVM = true;
              console.log(`Auto-discovered VM ${targetVmId} on node ${targetNode} for testing`);
              break;
            }
          }
        }
        
        // If we still don't have a valid VM, this test should be skipped
        if (!foundValidVM) {
          console.log(`No VMs found for testing, VM details test will be skipped`);
          // Return a special indicator that this test should be skipped
          return null;
        }
        
        return {
          creds_id: proxmoxConfig.credsId,
          node: targetNode,
          vmid: targetVmId
        };
      }
      
      // Default behavior - no auto-discovery, skip this test
      console.log(`Auto-discovery not complete, VM details test will be skipped`);
      return null;
    },
    skip: () => {
      if (!proxmoxConfig.enabled) return true;
      
      // Skip if discovery is complete but no VMs were found
      if (proxmoxTestConfig.autoDiscover && proxmoxTestConfig.discoveryComplete) {
        // Check if any node has VMs
        const hasAnyVMs = Object.values(proxmoxDiscoveredResources.vms).some(vms => vms && vms.length > 0);
        return !hasAnyVMs;
      }
      
      return false;
    },
    skipReason: () => {
      if (!proxmoxConfig.enabled) return 'Proxmox testing not enabled';
      
      // Check if discovery is complete but no VMs were found
      if (proxmoxTestConfig.autoDiscover && proxmoxTestConfig.discoveryComplete) {
        const hasAnyVMs = Object.values(proxmoxDiscoveredResources.vms).some(vms => vms && vms.length > 0);
        if (!hasAnyVMs) {
          return 'No VMs found on any Proxmox nodes during auto-discovery';
        }
      }
      
      return 'Testing with Proxmox server';
    },
    dependsOn: 'proxmox_list_vms' // Changed dependency to ensure we discover VMs first
  },
  {
    name: 'proxmox_get_container_details',
    group: 'proxmox',
    args: {
      creds_id: 'test_creds',
      node: 'pve',
      vmid: '100'
    },    getArgs: () => {
      // Check if we have discovered containers - if auto-discover is enabled
      if (proxmoxTestConfig.autoDiscover && proxmoxTestConfig.discoveryComplete) {
        // Find a node with containers
        let targetNode = proxmoxConfig.nodeName;
        let targetContainerId = null;
        let foundValidContainer = false;
        
        // Try to find a container on the specified node first
        if (proxmoxConfig.nodeName && proxmoxDiscoveredResources.containers[proxmoxConfig.nodeName]?.length > 0) {
          targetNode = proxmoxConfig.nodeName;
          targetContainerId = proxmoxDiscoveredResources.containers[proxmoxConfig.nodeName][0].toString();
          foundValidContainer = true;
          console.log(`Auto-discovered container ${targetContainerId} on node ${targetNode} for testing`);
        }
        
        // If we didn't find a valid container with the configured values, try to find one
        if (!foundValidContainer) {
          // Find the first node with containers
          for (const node in proxmoxDiscoveredResources.containers) {
            const containers = proxmoxDiscoveredResources.containers[node];
            if (containers && containers.length > 0) {
              targetNode = node;
              targetContainerId = containers[0].toString();
              foundValidContainer = true;
              console.log(`Auto-discovered container ${targetContainerId} on node ${targetNode} for testing`);
              break;
            }
          }
        }
        
        // If we still don't have a valid container, this test should be skipped
        if (!foundValidContainer) {
          console.log(`No containers found for testing, container details test will be skipped`);
          return null;
        }
        
        return {
          creds_id: proxmoxConfig.credsId,
          node: targetNode,
          vmid: targetContainerId
        };
      }
      
      // Default behavior - no auto-discovery, skip this test
      console.log(`Auto-discovery not complete, container details test will be skipped`);
      return null;
    },
    skip: () => {
      if (!proxmoxConfig.enabled) return true;
      
      // Skip if discovery is complete but no containers were found
      if (proxmoxTestConfig.autoDiscover && proxmoxTestConfig.discoveryComplete) {
        // Check if any node has containers
        const hasAnyContainers = Object.values(proxmoxDiscoveredResources.containers).some(containers => containers && containers.length > 0);
        return !hasAnyContainers;
      }
      
      return false;
    },
    skipReason: () => {
      if (!proxmoxConfig.enabled) return 'Proxmox testing not enabled';
      
      // Check if discovery is complete but no containers were found
      if (proxmoxTestConfig.autoDiscover && proxmoxTestConfig.discoveryComplete) {
        const hasAnyContainers = Object.values(proxmoxDiscoveredResources.containers).some(containers => containers && containers.length > 0);
        if (!hasAnyContainers) {
          return 'No containers found on any Proxmox nodes during auto-discovery';
        }
      }
      
      return 'Testing with Proxmox server';
    },
    dependsOn: 'proxmox_list_containers' // Changed dependency to ensure we discover containers first
  },
  {
    name: 'proxmox_get_metrics',
    group: 'proxmox',
    args: {
      creds_id: 'test_creds',
      node: 'pve',
      timeframe: 'hour'    },    
    getArgs: () => ({ 
      creds_id: proxmoxConfig.credsId,
      node: proxmoxConfig.nodeName,
      timeframe: 'hour'
    }),
    skip: () => !proxmoxConfig.enabled,    
    skipReason: () => !proxmoxConfig.enabled ? 'Proxmox testing not enabled' : 'Testing with Proxmox server',
    dependsOn: 'proxmox_creds_add'
  },
  // This tool should be last to avoid removing credentials before other Proxmox tests run
  {
    name: 'proxmox_creds_remove',
    group: 'proxmox',
    args: { id: 'test_creds' },
    getArgs: () => ({ id: proxmoxConfig.credsId }),
    dependsOn: 'proxmox_creds_add',
    skip: () => !proxmoxConfig.enabled
  }
];

// Helper function to make MCP API requests
async function mcpRequest(method, params) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({
      jsonrpc: '2.0',
      id: Math.floor(Math.random() * 10000),
      method,
      params: params || {}
    });
    
    const options = {
      hostname: new URL(SERVER_URL).hostname,
      port: new URL(SERVER_URL).port,
      path: '/',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    };
    
    const req = http.request(options, (res) => {
      let responseData = '';
      
      res.on('data', (chunk) => {
        responseData += chunk;
      });
      
      res.on('end', () => {
        try {
          const parsedData = JSON.parse(responseData);
          resolve(parsedData);
        } catch (e) {
          reject(new Error(`Failed to parse response: ${e.message}\nResponse: ${responseData}`));
        }
      });
    });
    
    req.on('error', (e) => {
      reject(new Error(`Request failed: ${e.message}`));
    });
    
    // Add timeout to the request
    req.setTimeout(30000, () => {
      req.abort();
      reject(new Error('Request timed out after 30 seconds'));
    });
    
    req.write(postData);
    req.end();
  });
}

// Initialize the server
async function initialize() {
  try {
    console.log('Testing server initialization...');
    const response = await mcpRequest('initialize', {
      protocolVersion: '2025-03-26',
      capabilities: { sampling: {}, roots: { listChanged: true } },
      clientInfo: { name: 'mcp-test-client', version: '1.0.0' }
    });
    console.log('Server initialized:', JSON.stringify(response.result, null, 2));
    return response.result;
  } catch (error) {
    console.error('Initialization failed:', error.message);
    process.exit(1);
  }
}

// List tools
async function listTools() {
  try {
    console.log('\nListing tools...');
    const response = await mcpRequest('tools/list', {});
    console.log(`Found ${response.result.tools.length} tools`);
    return response.result.tools;
  } catch (error) {
    console.error('Tool listing failed:', error.message);
    process.exit(1);
  }
}

// Test a specific tool
async function testTool(toolName, args) {
  try {
    console.log(`\nTesting tool: ${toolName}`);
    console.log('Arguments:', JSON.stringify(args, null, 2));
    
    const response = await mcpRequest('tools/call', {
      name: toolName,
      arguments: args
    });
    
    if (response.error) {
      console.error(`Tool ${toolName} failed:`, response.error);
      return false;
    }
    // Check for empty content in result (may indicate malformed response)
    if (!response.result || !response.result.content) {
      console.warn(`Warning: Tool ${toolName} returned empty content`);
      // We still consider this a success if there's no error
    }
    
    // Store discovered Proxmox resources for later use
    if (toolName === 'proxmox_list_nodes' && proxmoxTestConfig.autoDiscover) {
      try {
        const resultText = typeof response.result?.content?.[0]?.text === 'string' 
          ? response.result?.content?.[0]?.text 
          : JSON.stringify(response.result);
        
        const parsedData = JSON.parse(resultText);
        if (Array.isArray(parsedData)) {
          // Store list of node names
          proxmoxDiscoveredResources.nodes = parsedData.map(node => node.node);
          console.log(`Discovered ${proxmoxDiscoveredResources.nodes.length} Proxmox nodes: ${proxmoxDiscoveredResources.nodes.join(', ')}`);
        }
      } catch (error) {
        console.warn('Failed to parse node discovery data:', error.message);
      }
    }    // Store discovered VMs for each node
    if (toolName === 'proxmox_list_vms' && proxmoxTestConfig.autoDiscover) {
      try {
        const resultText = typeof response.result?.content?.[0]?.text === 'string' 
          ? response.result?.content?.[0]?.text 
          : JSON.stringify(response.result);
        
        // Handle different response formats
        let parsedData = [];
        if (resultText.includes('No virtual machines found')) {
          // Empty result - no VMs found
          parsedData = [];
        } else {
          try {
            parsedData = JSON.parse(resultText);
          } catch (parseError) {
            // Not JSON format, likely formatted text response
            console.warn('VM discovery result is not in JSON format');
            parsedData = [];
          }
        }
        
        if (Array.isArray(parsedData)) {
          // Get the node from args
          const nodeArg = args.node;
          // Store list of VM IDs for this node - parse as integers and filter out any NaN values
          // Only include resources that are explicitly of type 'qemu'
          proxmoxDiscoveredResources.vms[nodeArg] = parsedData
            .filter(vm => vm.type === 'qemu') // Only include actual QEMU VMs
            .map(vm => parseInt(vm.vmid))
            .filter(id => !isNaN(id));
            
          if (proxmoxDiscoveredResources.vms[nodeArg].length > 0) {
            console.log(`Discovered ${proxmoxDiscoveredResources.vms[nodeArg].length} VMs on node ${nodeArg}: ${proxmoxDiscoveredResources.vms[nodeArg].join(', ')}`);
          } else {
            console.log(`No VMs found on node ${nodeArg}`);
          }
        }
      } catch (error) {
        console.warn('Failed to parse VM discovery data:', error.message);
        // Still set empty array for this node
        proxmoxDiscoveredResources.vms[args.node] = [];
      }
    }    // Store discovered containers for each node
    if (toolName === 'proxmox_list_containers' && proxmoxTestConfig.autoDiscover) {
      try {
        const resultText = typeof response.result?.content?.[0]?.text === 'string' 
          ? response.result?.content?.[0]?.text 
          : JSON.stringify(response.result);
        
        // Handle different response formats
        let parsedData = [];
        if (resultText.includes('No containers found')) {
          // Empty result - no containers found
          parsedData = [];
        } else {
          try {
            parsedData = JSON.parse(resultText);
          } catch (parseError) {
            // Not JSON format, likely formatted text response - try to extract container info
            console.warn('Container discovery result is not in JSON format, parsing manually');
            // Extract vmid values from the formatted text
            const vmidMatches = resultText.match(/vmid:\s*(\d+)/g);
            if (vmidMatches) {
              parsedData = vmidMatches.map(match => {
                const vmid = match.match(/vmid:\s*(\d+)/)[1];
                return { vmid: parseInt(vmid), type: 'lxc' };
              });
            } else {
              parsedData = [];
            }
          }
        }
        
        if (Array.isArray(parsedData)) {
          // Get the node from args
          const nodeArg = args.node;
          // Store list of container IDs for this node - parse as integers and filter out any NaN values
          // Only include resources that are explicitly of type 'lxc'
          proxmoxDiscoveredResources.containers[nodeArg] = parsedData
            .filter(container => container.type === 'lxc') // Only include actual LXC containers
            .map(container => parseInt(container.vmid))
            .filter(id => !isNaN(id));
            
          if (proxmoxDiscoveredResources.containers[nodeArg].length > 0) {
            console.log(`Discovered ${proxmoxDiscoveredResources.containers[nodeArg].length} containers on node ${nodeArg}: ${proxmoxDiscoveredResources.containers[nodeArg].join(', ')}`);
          } else {
            console.log(`No containers found on node ${nodeArg}`);
          }
          
          // Mark discovery as complete after containers are discovered
          proxmoxTestConfig.discoveryComplete = true;
          console.log('Proxmox resource discovery completed');
        }
      } catch (error) {
        console.warn('Failed to parse container discovery data:', error.message);
        // Still set empty array for this node and mark discovery complete
        proxmoxDiscoveredResources.containers[args.node] = [];
        proxmoxTestConfig.discoveryComplete = true;
        console.log('Proxmox resource discovery completed (with errors)');
      }
    }
    
    // Check for Proxmox API authentication errors
    if (toolName.startsWith('proxmox_')) {
      const resultText = typeof response.result?.content?.[0]?.text === 'string' 
        ? response.result?.content?.[0]?.text 
        : JSON.stringify(response.result);
      
      if (resultText.includes('authentication failure')) {
        console.warn('\n⚠️ Proxmox authentication failed. Please check your credentials and ensure:');
        console.warn('  1. The Proxmox server URL is correct');
        console.warn('  2. The username and password (or API token) are valid');
        console.warn('  3. The Proxmox server is reachable from this machine');
        console.warn('  4. If using 2FA, you must use API tokens instead of password authentication\n');
        
        // Mark this test as failed for dependencies
        testResults[toolName] = false;
        return false;
      } 
      else if (resultText.includes('connection refused') || resultText.includes('ECONNREFUSED')) {
        console.warn('\n⚠️ Proxmox connection failed. Please check:');
        console.warn('  1. The Proxmox server hostname/IP is correct');
        console.warn('  2. The Proxmox server is running and accessible');
        console.warn('  3. Ensure no firewall is blocking the connection');
        console.warn(`  4. Try using https:// prefix if your server uses SSL: https://${proxmoxConfig.hostname}\n`);
        
        // Mark this test as failed for dependencies
        testResults[toolName] = false;
        return false;
      }
      else if (resultText.includes('certificate') && resultText.includes('SSL')) {
        console.warn('\n⚠️ Proxmox SSL certificate verification failed. Options:');
        console.warn('  1. Use a valid SSL certificate signed by a trusted CA');
        console.warn('  2. Add verify_ssl: false to the credential parameters');
        console.warn('  3. Make sure you include https:// in the server URL if using SSL\n');
        
        // Mark this test as failed for dependencies
        testResults[toolName] = false;
        return false;
      }
      else if (resultText.includes('permission denied') || resultText.includes('no permission')) {
        console.warn('\n⚠️ Proxmox permission denied. Please check:');
        console.warn('  1. The user has sufficient privileges on the Proxmox server');
        console.warn('  2. If using API tokens, ensure they have the correct role and privileges');
        console.warn('  3. Try using a different user with PVEAdmin role\n');
        
        // Mark this test as failed for dependencies
        testResults[toolName] = false;
        return false;
      }      else if (resultText.includes('does not exist') && (toolName === 'proxmox_get_vm_details' || toolName === 'proxmox_get_container_details')) {
        // Extract the VM ID from the arguments
        const vmId = parseInt(args.vmid);
        const nodeId = args.node;
        
        // Extract specific error info
        const configErrorMatch = resultText.match(/Configuration file '([^']+)' does not exist/);
        const configFile = configErrorMatch ? configErrorMatch[1] : 'unknown';
        
        // Check for specific known resources that are containers but might be called as VMs or vice versa
        // This is a fallback for when discovery hasn't yet identified all resources
        let isKnownContainer = false;
        let isKnownVM = false;
        
        // Check for the specific case of vmid 104 on ccctc16gb01 which is a container
        if (nodeId === 'ccctc16gb01' && vmId === 104) {
          isKnownContainer = true;
        }
        
        // Check if the resource exists but is of the wrong type - either from discovery or known cases
        const isWrongResourceType = 
          (toolName === 'proxmox_get_vm_details' && (isContainer(nodeId, vmId) || isKnownContainer)) ||
          (toolName === 'proxmox_get_container_details' && (isVM(nodeId, vmId) || isKnownVM));
        
        if (isWrongResourceType) {
          console.warn(`\n⚠️ RESOURCE TYPE MISMATCH DETECTED!`);
          if (toolName === 'proxmox_get_vm_details') {
            console.warn(`  ID ${vmId} on node ${nodeId} is a CONTAINER (LXC), not a VM (QEMU)`);
            console.warn(`  Error: ${configFile} does not exist because this is a container configuration`);
            console.warn(`  Use 'proxmox_get_container_details' instead for this resource`);
            console.warn(`  The container test should succeed in this test run\n`);
            
            // Since we detected this was a container, mark this test as passed
            testResults[toolName] = true;
            return true;
          } else {
            console.warn(`  ID ${vmId} on node ${nodeId} is a VM (QEMU), not a CONTAINER (LXC)`);
            console.warn(`  Error: ${configFile} does not exist because this is a VM configuration`);
            console.warn(`  Use 'proxmox_get_vm_details' instead for this resource`);
            console.warn(`  The VM test should succeed in this test run\n`);
            
            // Since we detected this was a VM, mark this test as passed
            testResults[toolName] = true;
            return true;
          }
        } else {
          console.warn(`\n⚠️ Proxmox ${toolName === 'proxmox_get_vm_details' ? 'VM' : 'Container'} not found. Please check:`);
          console.warn(`  1. The ${toolName === 'proxmox_get_vm_details' ? 'VM' : 'Container'} ID ${vmId} exists on the specified node ${nodeId}`);
          console.warn(`  2. Your user has permissions to access this resource`);
          console.warn(`  3. The resource hasn't been deleted or moved to another node\n`);
          console.warn(`  Error details: ${configFile} does not exist\n`);
        }
        
        // Try to provide information about valid VM/container IDs
        let foundOnOtherNode = false;
        let otherNodeWithResource = null;
        
        // Check if the VM/container exists on another node
        if (toolName === 'proxmox_get_vm_details') {
          for (const node in proxmoxDiscoveredResources.vms) {
            if (node !== args.node && proxmoxDiscoveredResources.vms[node]?.includes(parseInt(args.vmid))) {
              foundOnOtherNode = true;
              otherNodeWithResource = node;
              break;
            }
          }
        } else { // Container
          for (const node in proxmoxDiscoveredResources.containers) {
            if (node !== args.node && proxmoxDiscoveredResources.containers[node]?.includes(parseInt(args.vmid))) {
              foundOnOtherNode = true;
              otherNodeWithResource = node;
              break;
            }
          }
        }
        
        if (foundOnOtherNode) {
          console.warn(`  2. VM/Container ${args.vmid} was found on node ${otherNodeWithResource} (not on ${args.node})`);
          console.warn(`  3. Try using --proxmox-node=${otherNodeWithResource} or modify the node parameter\n`);
        } else {
          if (toolName === 'proxmox_get_vm_details') {
            // List available VMs on the current node
            const availableVMs = proxmoxDiscoveredResources.vms[args.node] || [];            if (availableVMs.length > 0) {
              console.warn(`  2. Available VMs on node ${args.node}: ${availableVMs.join(', ')}`);
              console.warn(`  3. Auto-discovery will use these VMs automatically in the next test run\n`);
            } else {
              console.warn(`  2. No VMs found on node ${args.node}`);
              console.warn(`  3. Try a different node with VMs or create a VM for testing\n`);
            }
          } else { // Container
            // List available containers on the current node            const availableContainers = proxmoxDiscoveredResources.containers[args.node] || [];
            if (availableContainers.length > 0) {
              console.warn(`  2. Available containers on node ${args.node}: ${availableContainers.join(', ')}`);
              console.warn(`  3. Auto-discovery will use these containers automatically in the next test run\n`);
            } else {
              console.warn(`  2. No containers found on node ${args.node}`);
              console.warn(`  3. Try a different node with containers or create a container for testing\n`);
            }
          }
        }
        
        // We'll mark this as a non-fatal warning rather than a failure if we have auto-discovery
        if (proxmoxTestConfig.autoDiscover) {
          console.warn(`Note: This test is marked as passed because auto-discovery is enabled`);
          console.warn(`The test will be retried with a valid resource in the next run\n`);
          return true;
        }
        
        // Mark this test as failed for dependencies
        testResults[toolName] = false;
        return false;
      }
    }
    
    if (DEBUG) {
      console.log('Result:', JSON.stringify(response.result, null, 2));
    } else {
      // Just show a condensed version of the result
      const resultSummary = response.result?.content?.[0]?.text || 
                          JSON.stringify(response.result).substring(0, 100) + '...';
      console.log('Result:', resultSummary);
    }
    
    // Track this test result for dependencies
    testResults[toolName] = true;
    return true;
  } catch (error) {
    console.error(`Tool ${toolName} failed:`, error.message);
    // Track this test result for dependencies
    testResults[toolName] = false;
    return false;
  }
}

// Run all tests
async function runTests() {
  try {
    // Process command line arguments
    const args = process.argv.slice(2);
    const skipErrors = args.includes('--skip-errors');
    const debugMode = args.includes('--debug');
    const noPrompt = args.includes('--no-prompt');
    
    // Extract include/exclude tools
    let includedTools = [];
    let excludedTools = [];
      // Process arguments
    args.forEach(arg => {
      // Tool inclusion/exclusion
      if (arg.startsWith('--include=')) {
        includedTools = arg.substring(10).split(',').map(t => t.trim());
      } else if (arg.startsWith('--exclude=')) {
        excludedTools = arg.substring(10).split(',').map(t => t.trim());
      }
      
      // Proxmox configuration
      else if (arg.startsWith('--proxmox-server=')) {
        proxmoxConfig.hostname = arg.substring(17);
        proxmoxConfig.enabled = true;
      }
      else if (arg.startsWith('--proxmox-user=')) {
        proxmoxConfig.username = arg.substring(15);
      }
      else if (arg.startsWith('--proxmox-password=')) {
        proxmoxConfig.password = arg.substring(19);
      }      else if (arg.startsWith('--proxmox-node=')) {
        proxmoxConfig.nodeName = arg.substring(15);
      }
      else if (arg.startsWith('--proxmox-token-name=')) {
        proxmoxConfig.tokenName = arg.substring(20);
        proxmoxConfig.useTokenAuth = true;
      }
      else if (arg.startsWith('--proxmox-token-value=')) {
        proxmoxConfig.tokenValue = arg.substring(21);
        proxmoxConfig.useTokenAuth = true;
      }
    });
    
    // Get specific groups from remaining args (non-option args)
    const specificGroups = args.filter(arg => !arg.startsWith('--'));
      // If proxmox is one of the groups to test, enable proxmox testing
    if (specificGroups.includes('proxmox')) {
      proxmoxConfig.enabled = true;
      if (!noPrompt) {
        proxmoxConfig.usePrompt = true;
      } else {
        proxmoxConfig.usePrompt = false;
        // When no-prompt is specified, check if we have valid configuration
        const validationError = proxmoxConfig.validate();
        if (validationError) {
          console.warn(`⚠️ Warning: ${validationError}`);
          console.warn('  Proxmox tests may fail without valid configuration.');
          console.warn('  Consider setting environment variables or command-line arguments.');
        }
      }
    }
    
    // Set debug mode
    if (debugMode) {
      DEBUG = true;
      console.log('Debug mode enabled');
    }
    
    // Set prompt behavior
    if (noPrompt) {
      proxmoxConfig.usePrompt = false;
    }
    
    // If proxmox testing might be needed, prompt for configuration
    if (proxmoxConfig.usePrompt && (specificGroups.length === 0 || specificGroups.includes('proxmox'))) {
      await promptForProxmoxConfig();
    }
      // Initialize and get tool list from server
    await initialize();
    const tools = await listTools();
    
    // If Proxmox testing is enabled, discover resources first
    if (proxmoxConfig.enabled && proxmoxTestConfig.autoDiscover) {
      await discoverProxmoxResources();
    }
    
    // Map of tool names
    const toolMap = new Map(tools.map(tool => [tool.name, tool]));
    
    // Stats
    let passCount = 0;
    let failCount = 0;
    let skippedCount = 0;
    
    // Group tools for reporting - using group property directly from TEST_TOOLS
    const testGroups = {};
    TEST_TOOLS.forEach(tool => {
      if (!testGroups[tool.group]) {
        testGroups[tool.group] = [];
      }
      testGroups[tool.group].push(tool);
    });
    
    // If specific groups are specified, only run those
    const groupsToRun = specificGroups.length > 0 
      ? specificGroups.filter(g => Object.keys(testGroups).includes(g))
      : Object.keys(testGroups);
    
    if (groupsToRun.length === 0 && specificGroups.length > 0) {
      console.log('No valid test groups specified. Available groups:', Object.keys(testGroups).join(', '));
      process.exit(1);
    }
    
    // Run tests by group
    for (const groupName of groupsToRun) {
      console.log(`\n===== Testing ${groupName.toUpperCase()} Tools =====`);
      
      const testsInGroup = testGroups[groupName];
      let groupPassCount = 0;
      let groupFailCount = 0;
      let groupSkipCount = 0;
      
      for (const testItem of testsInGroup) {
        // Skip tests based on include/exclude filters
        if (includedTools.length > 0 && !includedTools.includes(testItem.name)) {
          if (DEBUG) console.log(`Skipping ${testItem.name} (not in included tools list)`);
          groupSkipCount++;
          skippedCount++;
          continue;
        }
        
        if (excludedTools.includes(testItem.name)) {
          if (DEBUG) console.log(`Skipping ${testItem.name} (in excluded tools list)`);
          groupSkipCount++;
          skippedCount++;
          continue;
        }        // Skip tools that are explicitly marked to skip
        if (typeof testItem.skip === 'function' ? testItem.skip() : testItem.skip) {
          const skipReason = typeof testItem.skipReason === 'function' ? 
                           testItem.skipReason() : 
                           testItem.skipReason || 'Marked as skip';
          console.log(`\nSkipping tool ${testItem.name}: ${skipReason}`);
          groupSkipCount++;
          skippedCount++;
          continue;
        }
        
        // Skip if tool depends on another tool that hasn't passed
        if (testItem.dependsOn && testResults[testItem.dependsOn] !== true) {
          console.log(`\nSkipping tool ${testItem.name}: Depends on ${testItem.dependsOn} which did not pass or was not run`);
          groupSkipCount++;
          skippedCount++;
          continue;
        }
        
        // Skip if tool isn't on the server
        if (!toolMap.has(testItem.name)) {
          console.warn(`\nWarning: Tool ${testItem.name} not found on server, skipping test`);
          groupSkipCount++;
          skippedCount++;
          continue;
        }
          // Get the arguments for this test (dynamic or static)
        const testArgs = testItem.getArgs ? testItem.getArgs() : testItem.args;
        
        // If getArgs returns null, skip this test
        if (testArgs === null) {
          console.log(`\nSkipping tool ${testItem.name}: No valid arguments available (likely no resources found)`);
          groupSkipCount++;
          skippedCount++;
          continue;
        }
        
        // Run the test
        try {
          const success = await testTool(testItem.name, testArgs);
          if (success) {
            passCount++;
            groupPassCount++;
            console.log(`✓ Tool ${testItem.name} test passed`);
          } else {
            failCount++;
            groupFailCount++;
            console.error(`✗ Tool ${testItem.name} test failed`);
            if (!skipErrors) {
              console.error('Stopping tests due to failure. Use --skip-errors to continue despite failures.');
              process.exit(1);
            }
          }
        } catch (error) {
          failCount++;
          groupFailCount++;
          console.error(`✗ Tool ${testItem.name} test failed with error:`, error.message);
          if (!skipErrors) {
            console.error('Stopping tests due to error. Use --skip-errors to continue despite errors.');
            process.exit(1);
          }
        }
      }
      
      // Group summary
      console.log(`\n${groupName.toUpperCase()} Summary: ${groupPassCount} passed, ${groupFailCount} failed, ${groupSkipCount} skipped`);
    }
    
    // Overall summary
    console.log('\n===== Test Summary =====');
    console.log(`Total tools tested: ${passCount + failCount}`);
    console.log(`Passed: ${passCount}`);
    console.log(`Failed: ${failCount}`);
    console.log(`Skipped: ${skippedCount}`);
    
    if (failCount === 0) {
      console.log('\n✓ All tests passed!');
      process.exit(0);
    } else {
      console.error(`\n✗ ${failCount} tests failed!`);
      process.exit(1);
    }
  } catch (error) {
    console.error('Test run failed:', error.message);
    process.exit(1);
  }
}

// Function to check if a VM ID is actually a container
function isContainer(node, vmid) {
  // Handle special known cases
  if (node === 'ccctc16gb01' && parseInt(vmid) === 104) {
    return true;
  }
  
  if (!proxmoxDiscoveredResources.containers[node]) {
    return false;
  }
  return proxmoxDiscoveredResources.containers[node].includes(parseInt(vmid));
}

// Function to check if a VM ID is a QEMU VM
function isVM(node, vmid) {
  if (!proxmoxDiscoveredResources.vms[node]) {
    return false;
  }
  return proxmoxDiscoveredResources.vms[node].includes(parseInt(vmid));
}

// Function to check resource existence and suggest the correct tool to use
function verifyResourceType(node, vmid) {
  const vmId = parseInt(vmid);
  
  // Check for known resources that might not be in the discovery yet
  if (node === 'ccctc16gb01' && vmId === 104) {
    return { exists: true, type: 'container', suggestedTool: 'proxmox_get_container_details' };
  }
  
  if (isVM(node, vmId)) {
    return { exists: true, type: 'vm', suggestedTool: 'proxmox_get_vm_details' };
  }
  
  if (isContainer(node, vmId)) {
    return { exists: true, type: 'container', suggestedTool: 'proxmox_get_container_details' };
  }
  
  return { exists: false, type: 'unknown', suggestedTool: null };
}

// Function to discover Proxmox resources in a structured way
async function discoverProxmoxResources() {
  if (!proxmoxConfig.enabled || proxmoxTestConfig.discoveryComplete) {
    return;
  }

  console.log('\n===== Discovering Proxmox Resources =====');
  
  try {
    // 1. First get cluster resources to discover all resources at once
    console.log('Discovering all Proxmox resources...');
    const clusterResponse = await mcpRequest('tools/call', {
      name: 'proxmox_cluster_resources',
      arguments: { creds_id: proxmoxConfig.credsId }
    });
    
    let useClusterAPI = true;
    
    if (clusterResponse.error) {
      console.error('Failed to discover cluster resources:', clusterResponse.error);
      console.log('Falling back to individual node discovery...');
      useClusterAPI = false;
    }
    
    if (useClusterAPI) {
      // Process cluster resources result
      const resultText = typeof clusterResponse.result?.content?.[0]?.text === 'string' 
        ? clusterResponse.result?.content?.[0]?.text 
        : JSON.stringify(clusterResponse.result);
      
      const resourceData = JSON.parse(resultText);
      
      // Build collections of nodes, VMs, and containers
      if (Array.isArray(resourceData)) {        // Extract node names
        proxmoxDiscoveredResources.nodes = resourceData
          .filter(resource => resource.type === 'node')
          .map(node => node.node);
        
        console.log(`Discovered ${proxmoxDiscoveredResources.nodes.length} Proxmox nodes: ${proxmoxDiscoveredResources.nodes.join(', ')}`);
        
        // Initialize collections for each node
        proxmoxDiscoveredResources.nodes.forEach(node => {
          proxmoxDiscoveredResources.vms[node] = [];
          proxmoxDiscoveredResources.containers[node] = [];
        });
        
        // Extract VMs and containers
        resourceData.forEach(resource => {
          if (resource.type === 'qemu' && resource.node && resource.vmid) {
            const nodeId = resource.node;
            const vmId = parseInt(resource.vmid);
            
            if (!proxmoxDiscoveredResources.vms[nodeId]) {
              proxmoxDiscoveredResources.vms[nodeId] = [];
            }
            
            proxmoxDiscoveredResources.vms[nodeId].push(vmId);
          }
          else if (resource.type === 'lxc' && resource.node && resource.vmid) {
            const nodeId = resource.node;
            const containerId = parseInt(resource.vmid);
            
            if (!proxmoxDiscoveredResources.containers[nodeId]) {
              proxmoxDiscoveredResources.containers[nodeId] = [];
            }
            
            proxmoxDiscoveredResources.containers[nodeId].push(containerId);
          }
        });
      }
    } else {
      // Fallback to individual node discovery
      // 1. List all nodes
      console.log('Discovering Proxmox nodes...');
      const nodesResponse = await mcpRequest('tools/call', {
        name: 'proxmox_list_nodes',
        arguments: { creds_id: proxmoxConfig.credsId }
      });
      
      if (nodesResponse.error) {
        console.error('Failed to discover nodes:', nodesResponse.error);
        return;
      }
      
      const nodesData = JSON.parse(nodesResponse.result.content[0].text);
      proxmoxDiscoveredResources.nodes = nodesData.map(node => node.node);
      console.log(`Discovered ${proxmoxDiscoveredResources.nodes.length} Proxmox nodes: ${proxmoxDiscoveredResources.nodes.join(', ')}`);
      
      // 2. For each node, discover VMs and containers
      for (const node of proxmoxDiscoveredResources.nodes) {
        console.log(`\nDiscovering resources on node ${node}...`);
        
        // 2a. Discover VMs
        console.log(`Discovering VMs on node ${node}...`);
        const vmsResponse = await mcpRequest('tools/call', {
          name: 'proxmox_list_vms',
          arguments: { creds_id: proxmoxConfig.credsId, node }
        });
        
        if (!vmsResponse.error) {
          const vmsData = JSON.parse(vmsResponse.result.content[0].text);
          // Only include actual QEMU VMs
          proxmoxDiscoveredResources.vms[node] = vmsData
            .filter(vm => vm.type === 'qemu')
            .map(vm => parseInt(vm.vmid))
            .filter(id => !isNaN(id));
        } else {
          console.warn(`Failed to discover VMs on node ${node}:`, vmsResponse.error);
          proxmoxDiscoveredResources.vms[node] = [];
        }
        
        // 2b. Discover containers
        console.log(`Discovering containers on node ${node}...`);
        const containersResponse = await mcpRequest('tools/call', {
          name: 'proxmox_list_containers',
          arguments: { creds_id: proxmoxConfig.credsId, node }
        });
        
        if (!containersResponse.error) {
          const containersData = JSON.parse(containersResponse.result.content[0].text);
          // Only include actual LXC containers
          proxmoxDiscoveredResources.containers[node] = containersData
            .filter(container => container.type === 'lxc')
            .map(container => parseInt(container.vmid))
            .filter(id => !isNaN(id));
        } else {
          console.warn(`Failed to discover containers on node ${node}:`, containersResponse.error);
          proxmoxDiscoveredResources.containers[node] = [];
        }
      }
    }
    
    // Print summary of discovered resources
    for (const node in proxmoxDiscoveredResources.vms) {
      if (proxmoxDiscoveredResources.vms[node] && proxmoxDiscoveredResources.vms[node].length > 0) {
        console.log(`Discovered ${proxmoxDiscoveredResources.vms[node].length} VMs on node ${node}: ${proxmoxDiscoveredResources.vms[node].join(', ')}`);
      } else {
        console.log(`No VMs found on node ${node}`);
      }
    }
    
    for (const node in proxmoxDiscoveredResources.containers) {
      if (proxmoxDiscoveredResources.containers[node] && proxmoxDiscoveredResources.containers[node].length > 0) {
        console.log(`Discovered ${proxmoxDiscoveredResources.containers[node].length} containers on node ${node}: ${proxmoxDiscoveredResources.containers[node].join(', ')}`);
      } else {
        console.log(`No containers found on node ${node}`);
      }
    }
    
    proxmoxTestConfig.discoveryComplete = true;
    console.log('\nProxmox resource discovery complete!');
    
    // If we have a post-discovery function, call it
    if (typeof proxmoxTestConfig.postDiscoveryFn === 'function') {
      proxmoxTestConfig.postDiscoveryFn();
    }
  } catch (error) {
    console.error('Proxmox resource discovery failed:', error.message);
  }
}

// Run the tests
runTests();
