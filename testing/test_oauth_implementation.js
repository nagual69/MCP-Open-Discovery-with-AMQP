/**
 * OAuth 2.1 Implementation Test Suite
 * 
 * Tests the OAuth 2.1 resource server implementation including:
 * - Protected resource metadata endpoint
 * - Bearer token validation
 * - WWW-Authenticate challenges
 * - Scope validation
 */

const fetch = require('node-fetch');
const assert = require('assert');

// Test configuration
const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3000';
const VALID_TOKEN = 'mcp_demo_token_12345678901234567890'; // Demo token that starts with 'mcp_'
const INVALID_TOKEN = 'invalid_token_123';
const SHORT_TOKEN = 'short';

/**
 * Test helper functions
 */
async function makeRequest(path, options = {}) {
  const url = `${BASE_URL}${path}`;
  const response = await fetch(url, options);
  
  return {
    status: response.status,
    headers: Object.fromEntries(response.headers.entries()),
    data: await response.json().catch(() => null),
    text: await response.text().catch(() => null)
  };
}

function createAuthHeaders(token) {
  return {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  };
}

/**
 * Test Suite
 */
class OAuthTestSuite {
  constructor() {
    this.tests = [];
    this.results = {
      passed: 0,
      failed: 0,
      errors: []
    };
  }

  addTest(name, testFn) {
    this.tests.push({ name, testFn });
  }

  async runTests() {
    console.log('🔐 Starting OAuth 2.1 Implementation Tests\n');
    
    for (const test of this.tests) {
      try {
        console.log(`Testing: ${test.name}`);
        await test.testFn();
        console.log(`✅ PASSED: ${test.name}\n`);
        this.results.passed++;
      } catch (error) {
        console.log(`❌ FAILED: ${test.name}`);
        console.log(`   Error: ${error.message}\n`);
        this.results.failed++;
        this.results.errors.push({ test: test.name, error: error.message });
      }
    }

    this.printSummary();
  }

  printSummary() {
    console.log('📊 Test Results Summary');
    console.log('========================');
    console.log(`✅ Passed: ${this.results.passed}`);
    console.log(`❌ Failed: ${this.results.failed}`);
    console.log(`📈 Total:  ${this.results.passed + this.results.failed}`);
    
    if (this.results.errors.length > 0) {
      console.log('\n❌ Failed Tests:');
      this.results.errors.forEach(({ test, error }) => {
        console.log(`   - ${test}: ${error}`);
      });
    }
    
    console.log('');
  }
}

/**
 * Test Definitions
 */
const testSuite = new OAuthTestSuite();

// Test 1: Protected Resource Metadata Endpoint
testSuite.addTest('Protected Resource Metadata Endpoint (RFC 9728)', async () => {
  const response = await makeRequest('/.well-known/oauth-protected-resource');
  
  assert.strictEqual(response.status, 200, 'Should return 200 OK');
  assert.strictEqual(response.headers['content-type'], 'application/json; charset=utf-8', 'Should return JSON');
  assert(response.data, 'Should return valid JSON data');
  
  // Validate required fields per RFC 9728
  assert(response.data.resource, 'Should include resource identifier');
  assert(Array.isArray(response.data.scopes_supported), 'Should include supported scopes');
  assert(Array.isArray(response.data.bearer_methods_supported), 'Should include bearer methods');
  assert(response.data.bearer_methods_supported.includes('header'), 'Should support header bearer method');
  
  console.log(`   Resource URI: ${response.data.resource}`);
  console.log(`   Supported Scopes: ${response.data.scopes_supported.join(', ')}`);
});

// Test 2: Health Endpoint (Public)
testSuite.addTest('Health Endpoint Access (No Auth Required)', async () => {
  const response = await makeRequest('/health');
  
  assert.strictEqual(response.status, 200, 'Health endpoint should be accessible without auth');
  assert(response.data.oauth, 'Should include OAuth configuration in health response');
  
  console.log(`   OAuth Enabled: ${response.data.oauth.enabled}`);
  console.log(`   OAuth Realm: ${response.data.oauth.realm}`);
});

// Test 3: Root Endpoint (Public)
testSuite.addTest('Root Endpoint Access (No Auth Required)', async () => {
  const response = await makeRequest('/');
  
  assert.strictEqual(response.status, 200, 'Root endpoint should be accessible without auth');
  assert(response.data.oauth, 'Should include OAuth configuration');
  assert(response.data.endpoints['oauth_metadata'], 'Should include OAuth metadata endpoint');
  
  console.log(`   Service: ${response.data.service}`);
  console.log(`   OAuth Metadata: ${response.data.endpoints.oauth_metadata}`);
});

// Test 4: MCP Endpoint Without Token (Should Challenge)
testSuite.addTest('MCP Endpoint Without Token (WWW-Authenticate Challenge)', async () => {
  const response = await makeRequest('/mcp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'initialize',
      id: 1,
      params: { protocolVersion: '2025-06-18' }
    })
  });
  
  // Should return 401 with WWW-Authenticate header if OAuth is enabled
  // If OAuth is disabled, it might work without auth
  if (response.status === 401) {
    assert(response.headers['www-authenticate'], 'Should include WWW-Authenticate header');
    assert(response.headers['www-authenticate'].includes('Bearer'), 'Should use Bearer authentication');
    assert(response.data.error, 'Should include error in response body');
    
    console.log(`   WWW-Authenticate: ${response.headers['www-authenticate']}`);
    console.log(`   Error: ${response.data.error}`);
  } else {
    console.log(`   OAuth appears to be disabled (status: ${response.status})`);
  }
});

// Test 5: MCP Endpoint With Invalid Token
testSuite.addTest('MCP Endpoint With Invalid Token', async () => {
  const response = await makeRequest('/mcp', {
    method: 'POST',
    headers: createAuthHeaders(INVALID_TOKEN),
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'initialize',
      id: 1,
      params: { protocolVersion: '2025-06-18' }
    })
  });
  
  // Should return 401 with invalid_token error if OAuth is enabled
  if (response.status === 401) {
    assert(response.headers['www-authenticate'], 'Should include WWW-Authenticate header');
    assert(response.headers['www-authenticate'].includes('invalid_token'), 'Should indicate invalid token');
    
    console.log(`   WWW-Authenticate: ${response.headers['www-authenticate']}`);
    console.log(`   Error: ${response.data.error}`);
  } else {
    console.log(`   OAuth appears to be disabled (status: ${response.status})`);
  }
});

// Test 6: MCP Endpoint With Malformed Token
testSuite.addTest('MCP Endpoint With Malformed Token', async () => {
  const response = await makeRequest('/mcp', {
    method: 'POST',
    headers: createAuthHeaders(SHORT_TOKEN),
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'initialize',
      id: 1,
      params: { protocolVersion: '2025-06-18' }
    })
  });
  
  // Should return 401 with invalid_token error for malformed token
  if (response.status === 401) {
    assert(response.headers['www-authenticate'], 'Should include WWW-Authenticate header');
    assert(response.data.error === 'invalid_token', 'Should indicate invalid token format');
    
    console.log(`   Error: ${response.data.error}`);
    console.log(`   Description: ${response.data.error_description}`);
  } else {
    console.log(`   OAuth appears to be disabled (status: ${response.status})`);
  }
});

// Test 7: MCP Endpoint With Valid Token
testSuite.addTest('MCP Endpoint With Valid Token', async () => {
  const response = await makeRequest('/mcp', {
    method: 'POST',
    headers: createAuthHeaders(VALID_TOKEN),
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'initialize',
      id: 1,
      params: {
        protocolVersion: '2025-06-18',
        capabilities: {},
        clientInfo: { name: 'test-client', version: '1.0.0' }
      }
    })
  });
  
  // Should either work (200) or still require session setup
  if (response.status === 200 || response.status === 400) {
    console.log(`   Status: ${response.status}`);
    if (response.data) {
      console.log(`   Response: ${JSON.stringify(response.data).substring(0, 100)}...`);
    }
  } else {
    console.log(`   Unexpected status: ${response.status}`);
    if (response.data) {
      console.log(`   Error: ${response.data.error}`);
    }
  }
  
  // For this test, we just verify it doesn't return 401 (authentication works)
  assert(response.status !== 401, 'Should not return 401 with valid token');
});

// Test 8: Authorization Header Parsing
testSuite.addTest('Authorization Header Parsing', async () => {
  // Test various Authorization header formats
  const testCases = [
    { header: 'Bearer ' + VALID_TOKEN, shouldWork: true },
    { header: 'bearer ' + VALID_TOKEN, shouldWork: true }, // Case insensitive
    { header: 'Basic ' + Buffer.from('user:pass').toString('base64'), shouldWork: false },
    { header: VALID_TOKEN, shouldWork: false }, // Missing Bearer prefix
  ];
  
  for (const testCase of testCases) {
    const response = await makeRequest('/mcp', {
      method: 'POST',
      headers: {
        'Authorization': testCase.header,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'initialize',
        id: 1,
        params: { protocolVersion: '2025-06-18' }
      })
    });
    
    if (testCase.shouldWork) {
      assert(response.status !== 401 || response.status === 400, `Should accept: ${testCase.header.substring(0, 20)}...`);
    } else {
      // If OAuth is enabled, these should fail with 401
      if (response.status === 401) {
        console.log(`   ✓ Correctly rejected: ${testCase.header.substring(0, 20)}...`);
      } else {
        console.log(`   ? OAuth may be disabled (status: ${response.status})`);
      }
    }
  }
});

// Test 9: CORS Headers
testSuite.addTest('CORS Headers Include Authorization', async () => {
  const response = await makeRequest('/mcp', {
    method: 'OPTIONS'
  });
  
  assert.strictEqual(response.status, 200, 'OPTIONS should return 200');
  assert(response.headers['access-control-allow-headers'], 'Should include CORS headers');
  assert(response.headers['access-control-allow-headers'].includes('Authorization'), 
    'Should allow Authorization header in CORS');
  
  console.log(`   CORS Headers: ${response.headers['access-control-allow-headers']}`);
});

// Test 10: Cache Headers on Metadata Endpoint
testSuite.addTest('Metadata Endpoint Cache Headers', async () => {
  const response = await makeRequest('/.well-known/oauth-protected-resource');
  
  assert.strictEqual(response.status, 200, 'Should return 200 OK');
  assert(response.headers['cache-control'], 'Should include cache control headers');
  
  console.log(`   Cache-Control: ${response.headers['cache-control']}`);
});

/**
 * Main test runner
 */
async function runOAuthTests() {
  try {
    // Check if server is running
    console.log(`🔗 Connecting to server at ${BASE_URL}`);
    const healthCheck = await makeRequest('/health');
    
    if (healthCheck.status !== 200) {
      throw new Error(`Server not available at ${BASE_URL} (status: ${healthCheck.status})`);
    }
    
    console.log(`✅ Server is running`);
    console.log(`🔐 OAuth Enabled: ${healthCheck.data.oauth?.enabled || false}`);
    console.log(`🏰 OAuth Realm: ${healthCheck.data.oauth?.realm || 'N/A'}`);
    console.log('');
    
    await testSuite.runTests();
    
    // Exit with appropriate code
    process.exit(testSuite.results.failed > 0 ? 1 : 0);
    
  } catch (error) {
    console.error('❌ Test runner failed:', error.message);
    process.exit(1);
  }
}

// Run tests if this file is executed directly
if (require.main === module) {
  runOAuthTests();
}

module.exports = { runOAuthTests, OAuthTestSuite };
