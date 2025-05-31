#!/usr/bin/env node
/**
 * Direct MCP Tools Test
 * Run with: node direct_test_tools.js
 */

const http = require('http');

// Function to make a JSON-RPC request
function makeRequest(method, params = {}, id = 1) {
  return new Promise((resolve, reject) => {
    const requestBody = JSON.stringify({
      jsonrpc: "2.0",
      method,
      params,
      id
    });
    
    const options = {
      hostname: 'localhost',
      port: 3000,
      path: '/',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(requestBody)
      }
    };
    
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        try {
          const response = JSON.parse(data);
          resolve(response);
        } catch (error) {
          reject(new Error(`Failed to parse response: ${error.message}`));
        }
      });
    });
    
    req.on('error', (error) => {
      reject(error);
    });
    
    req.write(requestBody);
    req.end();
  });
}

// Main function to test the MCP server
async function testMCPServer() {
  try {
    console.log('Testing MCP server at http://localhost:3000');
    
    // Test 1: Initialize
    console.log('\nTest 1: Initialize');
    const initResponse = await makeRequest('initialize');
    console.log('Initialize response:', JSON.stringify(initResponse, null, 2));
    
    // Test 2: Status
    console.log('\nTest 2: Status');
    const statusResponse = await makeRequest('status');
    console.log('Status response:', JSON.stringify(statusResponse, null, 2));
    
    // Test 3: Tools List
    console.log('\nTest 3: Tools List');
    const toolsResponse = await makeRequest('tools/list');
    console.log('Tools response:', JSON.stringify(toolsResponse, null, 2));
    
    // Test 4: Ping Tool
    console.log('\nTest 4: Ping Tool');
    const pingResponse = await makeRequest('tools/call', {
      name: 'ping',
      arguments: {
        host: 'example.com',
        count: 2
      }
    });
    console.log('Ping response:', JSON.stringify(pingResponse, null, 2));
    
    console.log('\nAll tests completed successfully');
  } catch (error) {
    console.error('Error:', error.message);
  }
}

// Run the tests
testMCPServer();
