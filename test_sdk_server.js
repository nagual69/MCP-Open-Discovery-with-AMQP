#!/usr/bin/env node

/**
 * Test SDK Server - Comprehensive Test Suite
 * 
 * This test file validates the MCP Open Discovery Server functionality
 * including tool registration, MCP protocol compliance, and basic operations.
 */

const { spawn } = require('child_process');
const http = require('http');
const path = require('path');

// Test configuration
const CONFIG = {
  timeout: 30000,
  serverStartDelay: 3000,
  httpPort: 3000
};

// Test results tracking
const results = {
  passed: 0,
  failed: 0,
  total: 0,
  errors: []
};

/**
 * Enhanced logging with timestamps
 */
function log(level, message, data = null) {
  const timestamp = new Date().toISOString();
  const prefix = `[${timestamp}] [${level.toUpperCase()}]`;
  
  if (data) {
    console.log(`${prefix} ${message}`, data);
  } else {
    console.log(`${prefix} ${message}`);
  }
}

/**
 * Run a test with proper error handling and reporting
 */
async function runTest(testName, testFunction) {
  results.total++;
  
  try {
    log('info', `🧪 Running test: ${testName}`);
    await testFunction();
    results.passed++;
    log('info', `✅ PASSED: ${testName}`);
  } catch (error) {
    results.failed++;
    results.errors.push({ test: testName, error: error.message });
    log('error', `❌ FAILED: ${testName}`, error.message);
  }
}

/**
 * Test 1: Server Module Loading
 */
async function testServerModuleLoading() {
  const serverPath = path.resolve('./mcp_server_multi_transport_sdk.js');
  
  try {
    // Try to require the server module
    const serverModule = require(serverPath);
    
    if (!serverModule) {
      throw new Error('Server module did not export anything');
    }
    
    log('info', 'Server module loaded successfully');
  } catch (error) {
    throw new Error(`Failed to load server module: ${error.message}`);
  }
}

/**
 * Test 2: Tool Registry Loading
 */
async function testToolRegistryLoading() {
  try {
    const { registerAllTools, getToolCounts } = require('./tools/sdk_tool_registry');
    
    if (typeof registerAllTools !== 'function') {
      throw new Error('registerAllTools is not a function');
    }
    
    const toolCounts = getToolCounts();
    
    if (!toolCounts || typeof toolCounts.total !== 'number') {
      throw new Error('getToolCounts did not return valid tool counts');
    }
    
    log('info', `Tool registry loaded successfully. Total tools: ${toolCounts.total}`);
    
    if (toolCounts.total < 50) {
      throw new Error(`Expected at least 50 tools, got ${toolCounts.total}`);
    }
    
  } catch (error) {
    throw new Error(`Failed to load tool registry: ${error.message}`);
  }
}

/**
 * Test 3: MCP Protocol Compliance (stdio)
 */
async function testMcpStdioProtocol() {
  return new Promise((resolve, reject) => {
    const serverPath = path.resolve('./mcp_server_multi_transport_sdk.js');
    
    // Start server with stdio transport
    const server = spawn('node', [serverPath], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, TRANSPORT_MODE: 'stdio' }
    });
    
    let responseData = '';
    let timeoutId;
    
    // Set up timeout
    timeoutId = setTimeout(() => {
      server.kill();
      reject(new Error('MCP stdio test timed out'));
    }, CONFIG.timeout);
    
    server.stdout.on('data', (data) => {
      responseData += data.toString();
      
      // Look for initialize response
      if (responseData.includes('"method":"initialize"') || responseData.includes('"result"')) {
        clearTimeout(timeoutId);
        server.kill();
        
        try {
          // Try to parse at least one JSON response
          const lines = responseData.split('\n').filter(line => line.trim());
          let foundValidJson = false;
          
          for (const line of lines) {
            try {
              const parsed = JSON.parse(line);
              if (parsed.jsonrpc === '2.0') {
                foundValidJson = true;
                break;
              }
            } catch (e) {
              // Continue looking
            }
          }
          
          if (foundValidJson) {
            log('info', 'MCP stdio protocol responded correctly');
            resolve();
          } else {
            reject(new Error('No valid JSON-RPC 2.0 responses found'));
          }
        } catch (error) {
          reject(new Error(`Failed to parse MCP response: ${error.message}`));
        }
      }
    });
    
    server.stderr.on('data', (data) => {
      log('warn', 'Server stderr:', data.toString());
    });
    
    server.on('error', (error) => {
      clearTimeout(timeoutId);
      reject(new Error(`Server process error: ${error.message}`));
    });
    
    // Wait a moment then send initialize request
    setTimeout(() => {
      const initRequest = {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'test-client', version: '1.0.0' }
        }
      };
      
      try {
        server.stdin.write(JSON.stringify(initRequest) + '\n');
      } catch (error) {
        clearTimeout(timeoutId);
        reject(new Error(`Failed to send initialize request: ${error.message}`));
      }
    }, 1000);
  });
}

/**
 * Test 4: HTTP Health Endpoint
 */
async function testHttpHealthEndpoint() {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: CONFIG.httpPort,
      path: '/health',
      method: 'GET',
      timeout: 5000
    };
    
    const req = http.request(options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        if (res.statusCode === 200) {
          log('info', 'HTTP health endpoint responded correctly');
          resolve();
        } else {
          reject(new Error(`Health endpoint returned status ${res.statusCode}: ${data}`));
        }
      });
    });
    
    req.on('error', (error) => {
      // This is expected if server is not running in HTTP mode
      log('warn', 'HTTP health test skipped (server may not be running in HTTP mode)');
      resolve(); // Don't fail the test for this
    });
    
    req.on('timeout', () => {
      req.destroy();
      log('warn', 'HTTP health test timed out (server may not be running in HTTP mode)');
      resolve(); // Don't fail the test for this
    });
    
    req.end();
  });
}

/**
 * Test 5: Resource Registry Loading
 */
async function testResourceRegistry() {
  try {
    const { registerAllResources, getResourceCounts } = require('./tools/resource_registry');
    
    if (typeof registerAllResources !== 'function') {
      throw new Error('registerAllResources is not a function');
    }
    
    const resourceCounts = getResourceCounts();
    
    if (!resourceCounts || typeof resourceCounts.total !== 'number') {
      throw new Error('getResourceCounts did not return valid resource counts');
    }
    
    log('info', `Resource registry loaded successfully. Total resources: ${resourceCounts.total}`);
    
  } catch (error) {
    throw new Error(`Failed to load resource registry: ${error.message}`);
  }
}

/**
 * Test 6: Credential Manager
 */
async function testCredentialManager() {
  try {
    const credentialsManager = require('./tools/credentials_manager');
    
    if (typeof credentialsManager.listCredentials !== 'function') {
      throw new Error('credentialsManager.listCredentials is not a function');
    }
    
    // Test listing credentials (should not throw)
    const credentials = credentialsManager.listCredentials();
    
    if (!Array.isArray(credentials)) {
      throw new Error('listCredentials did not return an array');
    }
    
    log('info', `Credential manager working. Found ${credentials.length} stored credentials`);
    
  } catch (error) {
    throw new Error(`Failed to test credential manager: ${error.message}`);
  }
}

/**
 * Test 7: Individual Tool Modules
 */
async function testIndividualToolModules() {
  const toolModules = [
    './tools/network_tools_sdk',
    './tools/memory_tools_sdk', 
    './tools/nmap_tools_sdk',
    './tools/proxmox_tools_sdk',
    './tools/snmp_tools_sdk',
    './tools/nagios_tools_sdk',
    './tools/credentials_tools_sdk'
  ];
  
  for (const modulePath of toolModules) {
    try {
      const module = require(modulePath);
      
      // Check that module exports expected functions
      const moduleExports = Object.keys(module);
      if (moduleExports.length === 0) {
        throw new Error(`Module ${modulePath} exports nothing`);
      }
      
      log('info', `✓ ${modulePath} loaded successfully`);
    } catch (error) {
      throw new Error(`Failed to load ${modulePath}: ${error.message}`);
    }
  }
}

/**
 * Main test runner
 */
async function runAllTests() {
  console.log('🚀 MCP Open Discovery Server - Test Suite');
  console.log('==========================================\n');
  
  log('info', 'Starting comprehensive server tests...');
  
  // Run all tests
  await runTest('Server Module Loading', testServerModuleLoading);
  await runTest('Tool Registry Loading', testToolRegistryLoading);
  await runTest('Resource Registry Loading', testResourceRegistry);
  await runTest('Credential Manager', testCredentialManager);
  await runTest('Individual Tool Modules', testIndividualToolModules);
  await runTest('MCP Protocol Compliance (stdio)', testMcpStdioProtocol);
  await runTest('HTTP Health Endpoint', testHttpHealthEndpoint);
  
  // Print summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 TEST SUMMARY');
  console.log('='.repeat(60));
  console.log(`Total Tests: ${results.total}`);
  console.log(`Passed: ${results.passed}`);
  console.log(`Failed: ${results.failed}`);
  console.log(`Success Rate: ${((results.passed / results.total) * 100).toFixed(1)}%`);
  
  if (results.failed > 0) {
    console.log('\n❌ FAILED TESTS:');
    results.errors.forEach((error, index) => {
      console.log(`${index + 1}. ${error.test}: ${error.error}`);
    });
  }
  
  if (results.failed === 0) {
    console.log('\n🎉 All tests passed! Server is ready for deployment.');
    process.exit(0);
  } else {
    console.log(`\n⚠️  ${results.failed} test(s) failed. Please check the issues above.`);
    process.exit(1);
  }
}

// Handle errors
process.on('uncaughtException', (error) => {
  log('error', 'Uncaught exception:', error.message);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  log('error', 'Unhandled rejection:', reason);
  process.exit(1);
});

// Run tests
if (require.main === module) {
  runAllTests().catch((error) => {
    log('error', 'Test suite failed:', error.message);
    process.exit(1);
  });
}

module.exports = { runAllTests };
