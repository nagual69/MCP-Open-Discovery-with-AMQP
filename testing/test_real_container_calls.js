#!/usr/bin/env node

/**
 * Test MCP Parameter Detection with Real Container Call
 * This test makes actual HTTP calls to the running MCP server container
 * to see exactly what parameters the MCP SDK is passing in production
 */

const http = require('http');

async function makeToolCall(toolName, params) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({
      jsonrpc: "2.0",
      id: `test-${Date.now()}`,
      method: "tools/call",
      params: {
        name: toolName,
        arguments: params
      }
    });

    const options = {
      hostname: 'localhost',
      port: 3000,
      path: '/mcp',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    console.log(`Making tool call to ${toolName} with:`, params);
    console.log('HTTP Request:', { ...options, body: postData });

    const req = http.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        try {
          const response = JSON.parse(data);
          console.log(`Response for ${toolName}:`, JSON.stringify(response, null, 2));
          resolve(response);
        } catch (error) {
          console.error(`Failed to parse response for ${toolName}:`, error);
          reject(error);
        }
      });
    });

    req.on('error', (error) => {
      console.error(`Request error for ${toolName}:`, error);
      reject(error);
    });

    req.write(postData);
    req.end();
  });
}

async function testRealParameterDetection() {
  try {
    console.log('=== Testing Real MCP Parameter Detection with Container ===');
    
    // Test memory_set tool with parameters
    const memorySetParams = {
      key: 'test:container:web01',
      value: {
        hostname: 'web01.container.com',
        ip: '192.168.1.101',
        type: 'web-server',
        tested_at: new Date().toISOString()
      }
    };
    
    console.log('\n=== Testing memory_set with real container ===');
    await makeToolCall('memory_set', memorySetParams);
    
    // Test memory_get to verify it worked
    console.log('\n=== Testing memory_get to verify storage ===');
    await makeToolCall('memory_get', { key: 'test:container:web01' });
    
    // Test memory_stats
    console.log('\n=== Testing memory_stats (no parameters) ===');
    await makeToolCall('memory_stats', {});
    
    // Test ping tool from network tools
    console.log('\n=== Testing ping tool with parameters ===');
    await makeToolCall('ping', { 
      target: '8.8.8.8', 
      count: 2,
      timeout: 3
    });
    
  } catch (error) {
    console.error('Test failed:', error);
  }
}

testRealParameterDetection().catch(console.error);
