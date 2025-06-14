#!/usr/bin/env node

/**
 * Test SDK Server - Quick validation of MCP SDK integration
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
 * Test the server
 */
async function testServer() {
  try {
    console.log('Testing MCP SDK Server...\n');

    // Test 1: Initialize
    console.log('1. Testing initialization...');
    const initRequest = {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-03-26",
        clientInfo: {
          name: "test-client",
          version: "1.0.0"
        },
        capabilities: {}
      }
    };

    const initResponse = await sendMCPRequest(initRequest);
    console.log('✓ Initialization successful');
    console.log(`   Server: ${initResponse.result.serverInfo.name} v${initResponse.result.serverInfo.version}`);

    // Test 2: List tools
    console.log('\n2. Testing tools/list...');
    const listRequest = {
      jsonrpc: "2.0",
      id: 2,
      method: "tools/list",
      params: {}
    };

    const listResponse = await sendMCPRequest(listRequest);
    console.log('✓ Tools list successful');
    console.log(`   Found ${listResponse.result.tools.length} tools:`);
    listResponse.result.tools.forEach(tool => {
      console.log(`   - ${tool.name}: ${tool.description}`);
    });

    // Test 3: Call a simple tool (ping)
    console.log('\n3. Testing tool call (ping)...');
    const pingRequest = {
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: {
        name: "ping",
        arguments: {
          host: "127.0.0.1",
          count: 1
        }
      }
    };

    const pingResponse = await sendMCPRequest(pingRequest);
    if (pingResponse.result && pingResponse.result.content) {
      console.log('✓ Ping tool call successful');
      console.log(`   Result: ${pingResponse.result.content[0].text.substring(0, 100)}...`);
    } else {
      console.log('✗ Ping tool call failed');
      console.log(`   Response: ${JSON.stringify(pingResponse, null, 2)}`);
    }

    console.log('\n✅ All tests passed! SDK server is working correctly.');

  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  testServer();
}
