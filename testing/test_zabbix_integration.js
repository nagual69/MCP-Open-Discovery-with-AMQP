/**
 * Zabbix Integration Testing for MCP Open Discovery
 * 
 * This script tests the Zabbix tools integration with a local test environment.
 * Run this after starting the Zabbix test stack with docker-compose.
 */

const { execSync } = require('child_process');
const fetch = require('node-fetch');

// Test configuration
const ZABBIX_CONFIG = {
  baseUrl: 'http://localhost:8080',
  username: 'Admin',
  password: 'zabbix', // Default Zabbix password
  testTimeout: 120000 // 2 minutes for services to start
};

const EXPECTED_SERVICES = [
  { name: 'Zabbix Web', url: 'http://localhost:8080', expectedStatus: 200 },
  { name: 'Test Web Server', url: 'http://localhost:8888', expectedStatus: 200 },
  { name: 'Nginx Status', url: 'http://localhost:8888/nginx_status', expectedStatus: 200 }
];

/**
 * Check if a service is responding
 */
async function checkService(service) {
  try {
    console.log(`🔍 Checking ${service.name}...`);
    const response = await fetch(service.url, { 
      timeout: 5000,
      method: 'GET'
    });
    
    if (response.status === service.expectedStatus) {
      console.log(`✅ ${service.name} is responding (${response.status})`);
      return true;
    } else {
      console.log(`❌ ${service.name} returned status ${response.status}, expected ${service.expectedStatus}`);
      return false;
    }
  } catch (error) {
    console.log(`❌ ${service.name} is not responding: ${error.message}`);
    return false;
  }
}

/**
 * Wait for services to be ready
 */
async function waitForServices() {
  console.log('⏳ Waiting for Zabbix services to start...');
  
  const startTime = Date.now();
  const timeout = ZABBIX_CONFIG.testTimeout;
  
  while (Date.now() - startTime < timeout) {
    let allReady = true;
    
    for (const service of EXPECTED_SERVICES) {
      const isReady = await checkService(service);
      if (!isReady) {
        allReady = false;
        break;
      }
    }
    
    if (allReady) {
      console.log('✅ All services are ready!');
      return true;
    }
    
    console.log('⏳ Some services not ready yet, waiting 10 seconds...');
    await new Promise(resolve => setTimeout(resolve, 10000));
  }
  
  console.log('❌ Timeout waiting for services to start');
  return false;
}

/**
 * Test Zabbix API authentication
 */
async function testZabbixAuth() {
  console.log('\n🔑 Testing Zabbix API authentication...');
  
  try {
    const response = await fetch(`${ZABBIX_CONFIG.baseUrl}/api_jsonrpc.php`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json-rpc',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'user.login',
        params: {
          user: ZABBIX_CONFIG.username,
          password: ZABBIX_CONFIG.password
        },
        id: 1
      })
    });

    const data = await response.json();
    
    if (data.error) {
      console.log(`❌ Zabbix authentication failed: ${data.error.message}`);
      return null;
    }
    
    console.log('✅ Zabbix authentication successful');
    return data.result; // auth token
  } catch (error) {
    console.log(`❌ Zabbix authentication error: ${error.message}`);
    return null;
  }
}

/**
 * Test basic Zabbix API calls
 */
async function testZabbixAPI(authToken) {
  console.log('\n📊 Testing Zabbix API calls...');
  
  try {
    // Test getting Zabbix version
    const versionResponse = await fetch(`${ZABBIX_CONFIG.baseUrl}/api_jsonrpc.php`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json-rpc',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'apiinfo.version',
        params: {},
        id: 2
      })
    });

    const versionData = await versionResponse.json();
    if (versionData.result) {
      console.log(`✅ Zabbix version: ${versionData.result}`);
    }

    // Test getting hosts
    const hostsResponse = await fetch(`${ZABBIX_CONFIG.baseUrl}/api_jsonrpc.php`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json-rpc',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'host.get',
        params: {
          output: ['hostid', 'host', 'name', 'status'],
          limit: 10
        },
        auth: authToken,
        id: 3
      })
    });

    const hostsData = await hostsResponse.json();
    if (hostsData.result) {
      console.log(`✅ Found ${hostsData.result.length} hosts in Zabbix`);
      hostsData.result.forEach(host => {
        console.log(`   - ${host.name} (${host.host}) - Status: ${host.status === '0' ? 'Enabled' : 'Disabled'}`);
      });
    }

    return true;
  } catch (error) {
    console.log(`❌ Zabbix API test failed: ${error.message}`);
    return false;
  }
}

/**
 * Test MCP Zabbix tools (requires MCP server to be running)
 */
async function testMCPZabbixTools() {
  console.log('\n🔧 Testing MCP Zabbix tools...');
  
  try {
    // Check if MCP server is running
    const mcpResponse = await fetch('http://localhost:3000/health', { timeout: 5000 });
    if (!mcpResponse.ok) {
      console.log('⚠️  MCP server not running on port 3000, skipping tool tests');
      return false;
    }
    
    console.log('✅ MCP server is running, Zabbix tools should be available');
    console.log('   You can now test the tools using:');
    console.log(`   - zabbix_host_discover with baseUrl: ${ZABBIX_CONFIG.baseUrl}`);
    console.log(`   - zabbix_get_metrics with baseUrl: ${ZABBIX_CONFIG.baseUrl}`);
    console.log(`   - zabbix_get_alerts with baseUrl: ${ZABBIX_CONFIG.baseUrl}`);
    console.log(`   - zabbix_get_inventory with baseUrl: ${ZABBIX_CONFIG.baseUrl}`);
    console.log(`   - API Key: ${ZABBIX_CONFIG.password}`);
    
    return true;
  } catch (error) {
    console.log('⚠️  Could not check MCP server status');
    return false;
  }
}

/**
 * Display test summary and next steps
 */
function displaySummary(results) {
  console.log('\n' + '='.repeat(60));
  console.log('📋 ZABBIX INTEGRATION TEST SUMMARY');
  console.log('='.repeat(60));
  
  console.log(`✅ Services Ready: ${results.servicesReady ? 'YES' : 'NO'}`);
  console.log(`✅ Zabbix Auth: ${results.authSuccess ? 'YES' : 'NO'}`);
  console.log(`✅ Zabbix API: ${results.apiSuccess ? 'YES' : 'NO'}`);
  console.log(`✅ MCP Tools: ${results.mcpToolsReady ? 'YES' : 'NO'}`);
  
  console.log('\n📚 NEXT STEPS:');
  
  if (results.servicesReady && results.authSuccess) {
    console.log('1. ✅ Zabbix is ready for testing');
    console.log('2. 🌐 Access Zabbix Web UI: http://localhost:8080');
    console.log('3. 🔑 Login credentials: Admin / zabbix');
    console.log('4. 🧪 Test web server: http://localhost:8888');
    
    if (results.mcpToolsReady) {
      console.log('5. 🔧 Test MCP Zabbix tools with VS Code MCP extension');
      console.log('6. 📊 Use the following parameters for testing:');
      console.log(`   - Base URL: ${ZABBIX_CONFIG.baseUrl}`);
      console.log(`   - API Key: ${ZABBIX_CONFIG.password}`);
    } else {
      console.log('5. 🚀 Start MCP Open Discovery server to test tools');
      console.log('6. 📁 Run: npm start or ./rebuild_deploy.ps1');
    }
  } else {
    console.log('1. ❌ Fix service startup issues first');
    console.log('2. 🐳 Check Docker containers: docker-compose -f testing/docker-compose-zabbix-testing.yml ps');
    console.log('3. 📋 Check logs: docker-compose -f testing/docker-compose-zabbix-testing.yml logs');
  }
  
  console.log('\n📖 For more information, see:');
  console.log('   - docs/PHASE_1_IMPLEMENTATION_PLAN.md');
  console.log('   - testing/docker-compose-zabbix-testing.yml');
  console.log('   - tools/zabbix_tools_sdk.js');
}

/**
 * Main test execution
 */
async function runTests() {
  console.log('🧪 MCP Open Discovery - Zabbix Integration Test');
  console.log('==================================================\n');
  
  const results = {
    servicesReady: false,
    authSuccess: false,
    apiSuccess: false,
    mcpToolsReady: false
  };
  
  // Test 1: Check if services are ready
  results.servicesReady = await waitForServices();
  
  if (results.servicesReady) {
    // Test 2: Test Zabbix authentication
    const authToken = await testZabbixAuth();
    results.authSuccess = authToken !== null;
    
    if (results.authSuccess) {
      // Test 3: Test Zabbix API
      results.apiSuccess = await testZabbixAPI(authToken);
    }
  }
  
  // Test 4: Check MCP tools availability
  results.mcpToolsReady = await testMCPZabbixTools();
  
  // Display summary
  displaySummary(results);
  
  // Exit with appropriate code
  const allPassed = results.servicesReady && results.authSuccess && results.apiSuccess;
  process.exit(allPassed ? 0 : 1);
}

// Handle uncaught errors
process.on('unhandledRejection', (error) => {
  console.error('❌ Unhandled error:', error);
  process.exit(1);
});

// Run tests if this file is executed directly
if (require.main === module) {
  runTests().catch(error => {
    console.error('❌ Test execution failed:', error);
    process.exit(1);
  });
}

module.exports = {
  runTests,
  checkService,
  testZabbixAuth,
  testZabbixAPI,
  ZABBIX_CONFIG
};
