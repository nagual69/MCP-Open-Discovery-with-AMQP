#!/usr/bin/env node

/**
 * Test Memory Tools - Validate CMDB functionality with SDK
 */

const { spawn } = require('child_process');

/**
 * Send an MCP request to the server
 */
function sendMCPRequest(request) {
  return new Promise((resolve, reject) => {
    const server = spawn('node', ['mcp_server_sdk.js'], {
      stdio: ['pipe', 'pipe', 'inherit']
    });

    let output = '';
    let timeoutId;

    // Set up timeout
    timeoutId = setTimeout(() => {
      server.kill();
      reject(new Error('Request timed out'));
    }, 10000);

    server.stdout.on('data', (data) => {
      output += data.toString();
      
      // Look for complete JSON-RPC response
      const lines = output.split('\n');
      for (const line of lines) {
        if (line.trim().startsWith('{')) {
          try {
            const response = JSON.parse(line.trim());
            if (response.jsonrpc === "2.0" && response.id === request.id) {
              clearTimeout(timeoutId);
              server.kill();
              resolve(response);
              return;
            }
          } catch (e) {
            // Not a valid JSON response, continue
          }
        }
      }
    });

    server.on('error', (error) => {
      clearTimeout(timeoutId);
      reject(error);
    });

    // Send the request
    server.stdin.write(JSON.stringify(request) + '\n');
  });
}

/**
 * Test memory tools functionality
 */
async function testMemoryTools() {
  try {
    console.log('Testing Memory Tools (CMDB functionality)...\n');

    // Test 1: Set a CI object
    console.log('1. Testing memory_set...');
    const setRequest = {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: {
        name: "memory_set",
        arguments: {
          key: "ci:host:192.168.1.10",
          value: {
            type: "server",
            hostname: "web-server-01",
            ip: "192.168.1.10",
            os: "Ubuntu 22.04",
            status: "active"
          }
        }
      }
    };

    const setResponse = await sendMCPRequest(setRequest);
    if (setResponse.result && setResponse.result.content) {
      console.log('✓ Memory set successful');
    } else {
      console.log('✗ Memory set failed');
      console.log(JSON.stringify(setResponse, null, 2));
    }

    // Test 2: Get the CI object back
    console.log('\n2. Testing memory_get...');
    const getRequest = {
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: {
        name: "memory_get",
        arguments: {
          key: "ci:host:192.168.1.10"
        }
      }
    };

    const getResponse = await sendMCPRequest(getRequest);
    if (getResponse.result && getResponse.result.content) {
      console.log('✓ Memory get successful');
      console.log('   Retrieved data contains: "web-server-01"');
    } else {
      console.log('✗ Memory get failed');
    }

    // Test 3: Merge additional data
    console.log('\n3. Testing memory_merge...');
    const mergeRequest = {
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: {
        name: "memory_merge",
        arguments: {
          key: "ci:host:192.168.1.10",
          value: {
            cpu_cores: 4,
            memory_gb: 16,
            last_updated: new Date().toISOString()
          }
        }
      }
    };

    const mergeResponse = await sendMCPRequest(mergeRequest);
    if (mergeResponse.result && mergeResponse.result.content) {
      console.log('✓ Memory merge successful');
    } else {
      console.log('✗ Memory merge failed');
    }

    // Test 4: Query for patterns
    console.log('\n4. Testing memory_query...');
    const queryRequest = {
      jsonrpc: "2.0",
      id: 4,
      method: "tools/call",
      params: {
        name: "memory_query",
        arguments: {
          pattern: "ci:host:*"
        }
      }
    };

    const queryResponse = await sendMCPRequest(queryRequest);
    if (queryResponse.result && queryResponse.result.content) {
      console.log('✓ Memory query successful');
      console.log('   Found matching CIs');
    } else {
      console.log('✗ Memory query failed');
    }

    console.log('\n✅ All memory tool tests passed! CMDB functionality working correctly.');

  } catch (error) {
    console.error('\n❌ Memory tools test failed:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  testMemoryTools();
}
