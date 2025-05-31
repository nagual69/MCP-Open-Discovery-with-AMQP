#!/usr/bin/env node

const http = require('http');
const { promisify } = require('util');

class MCPClient {
  constructor(baseUrl = 'http://localhost:3000') {
    this.baseUrl = baseUrl;
    this.requestId = 1;
  }
  async sendRequest(method, params = {}) {
    const id = this.requestId++;
    const requestBody = JSON.stringify({
      jsonrpc: "2.0",
      method,
      params,
      id
    });

    console.log(`\nSending request: ${method}`);
    if (Object.keys(params).length > 0) {
      console.log('Parameters:', JSON.stringify(params, null, 2));
    }

    try {
      const response = await this.makeHttpRequest(requestBody);
      console.log('Response:', JSON.stringify(response, null, 2));
      
      // Validate response matches request ID
      if (response.id !== id) {
        console.warn(`WARNING: Response ID ${response.id} does not match request ID ${id}`);
      }

      return response;
    } catch (error) {
      console.error(`Error during ${method} request:`, error.message);
      throw error;
    }
  }

  makeHttpRequest(body) {
    return new Promise((resolve, reject) => {
      const options = {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body)
        }
      };

      const req = http.request(this.baseUrl, options, (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            try {
              const response = JSON.parse(data);
              resolve(response);
            } catch (e) {
              reject(new Error(`Failed to parse response: ${e.message}`));
            }
          } else {
            reject(new Error(`HTTP error: ${res.statusCode} ${res.statusMessage}`));
          }
        });
      });

      req.on('error', (e) => {
        reject(new Error(`Request failed: ${e.message}`));
      });

      req.write(body);
      req.end();
    });
  }
  async listTools() {
    return this.sendRequest('tools/list');
  }

  async callTool(name, arguments_ = {}) {
    return this.sendRequest('tools/call', {
      name,
      arguments: arguments_
    });
  }
  
  async getStatus() {
    return this.sendRequest('status');
  }
  
  async getVersion() {
    return this.sendRequest('version');
  }
  
  async listServers() {
    return this.sendRequest('servers/list');
  }
}

// Test configuration
const config = {
  serverUrl: 'http://localhost:3000',
  toolTests: {
    ping: { host: 'example.com', count: 2 },
    wget: { url: 'https://httpbin.org/json', headers_only: true },
    nslookup: { domain: 'google.com' },
    netstat: { numeric: true },
    telnet: { host: 'google.com', port: 80 },
    route: { numeric: true },
    ifconfig: {},
    arp: { numeric: true }
  }
};

// Validation functions
function validateMCPResponse(response, method) {
  // Common MCP response validation
  if (!response.jsonrpc) {
    console.error('Response missing jsonrpc field');
    return false;
  }
  
  if (response.jsonrpc !== "2.0") {
    console.error(`Invalid jsonrpc version: ${response.jsonrpc}`);
    return false;
  }
  
  if (response.error) {
    console.error(`Error in ${method} response:`, response.error);
    return false;
  }

  // Method-specific validation
  if (method === 'tools/list') {
    if (!Array.isArray(response.tools)) {
      console.error('Response missing tools array');
      return false;
    }
    
    // Validate each tool has required fields
    for (const tool of response.tools) {
      if (!tool.name || !tool.description || !tool.schema) {
        console.error('Tool missing required fields:', tool);
        return false;
      }
    }
  } else if (method === 'tools/call') {
    if (!response.content || !Array.isArray(response.content)) {
      console.error('Response missing content array');
      return false;
    }
    
    // Validate content items
    for (const item of response.content) {
      if (!item.type || !item.text) {
        console.error('Content item missing required fields:', item);
        return false;
      }
    }
    
    // isError should be a boolean if present
    if (response.isError !== undefined && typeof response.isError !== 'boolean') {
      console.error('isError is not a boolean:', response.isError);
      return false;
    }
  } else if (method === 'status') {
    if (!response.status) {
      console.error('Response missing status field');
      return false;
    }
  } else if (method === 'version') {
    if (!response.version) {
      console.error('Response missing version field');
      return false;
    }
  } else if (method === 'servers/list') {
    if (!Array.isArray(response.servers)) {
      console.error('Response missing servers array');
      return false;
    }
  }
  
  return true;
}

// Run tests
async function runTests() {
  console.log('🧪 MCP Compliance Test Script');
  console.log('============================');
  console.log(`Testing MCP server at: ${config.serverUrl}`);
  
  try {
    const client = new MCPClient(config.serverUrl);
    
    // Check health endpoint
    try {
      const healthResponse = await new Promise((resolve, reject) => {
        http.get(`${config.serverUrl}/health`, (res) => {
          let data = '';
          res.on('data', (chunk) => {
            data += chunk;
          });
          
          res.on('end', () => {
            if (res.statusCode === 200) {
              try {
                resolve(JSON.parse(data));
              } catch (e) {
                reject(new Error(`Failed to parse health response: ${e.message}`));
              }
            } else {
              reject(new Error(`Health check failed: ${res.statusCode}`));
            }
          });
        }).on('error', reject);
      });
      
      console.log('\n✅ Health check passed:', healthResponse);
    } catch (error) {
      console.error('\n❌ Health check failed:', error.message);
    }
    
    // Test tools/list
    console.log('\n📋 Testing tools/list method...');
    const toolsListResponse = await client.listTools();
    
    if (validateMCPResponse(toolsListResponse, 'tools/list')) {
      console.log('\n✅ tools/list validation passed');
      console.log(`Found ${toolsListResponse.tools.length} tools:`);
      toolsListResponse.tools.forEach(tool => {
        console.log(`- ${tool.name}: ${tool.description}`);
      });
      
      // Collect tool names for testing
      const availableTools = toolsListResponse.tools.map(tool => tool.name);
      
      // Test each tool
      console.log('\n🛠️  Testing individual tools...');
      let passedTests = 0;
      let failedTests = 0;
      
      for (const toolName of availableTools) {
        if (config.toolTests[toolName]) {
          console.log(`\n📌 Testing tool: ${toolName}`);
          try {
            const response = await client.callTool(toolName, config.toolTests[toolName]);
            
            if (validateMCPResponse(response, 'tools/call')) {
              console.log(`✅ ${toolName} test passed`);
              passedTests++;
            } else {
              console.error(`❌ ${toolName} MCP validation failed`);
              failedTests++;
            }
          } catch (error) {
            console.error(`❌ ${toolName} test failed:`, error.message);
            failedTests++;
          }
        } else {
          console.warn(`⚠️ No test configuration for tool: ${toolName}`);
        }
      }
      
      // Test summary
      console.log('\n📊 Test Summary');
      console.log('=============');
      console.log(`Total tools: ${availableTools.length}`);
      console.log(`Tests passed: ${passedTests}`);
      console.log(`Tests failed: ${failedTests}`);
      console.log(`Overall status: ${failedTests === 0 ? '✅ PASSED' : '❌ FAILED'}`);
    } else {
      console.error('\n❌ tools/list validation failed');
    }
      // Test with invalid tool name
    console.log('\n🔍 Testing error handling with invalid tool...');
    try {
      const invalidResponse = await client.callTool('nonexistent_tool');
      console.log('Response for invalid tool:', invalidResponse);
      if (invalidResponse.error || invalidResponse.isError) {
        console.log('✅ Server correctly returned error for invalid tool');
      } else {
        console.error('❌ Server did not return error for invalid tool');
      }
    } catch (error) {
      console.error('❌ Error testing invalid tool:', error.message);
    }
    
    // Test MCP protocol methods
    console.log('\n📡 Testing MCP protocol methods...');
    
    try {
      // Test status method
      console.log('\n🔄 Testing status method...');
      const statusResponse = await client.getStatus();
      if (validateMCPResponse(statusResponse, 'status')) {
        console.log(`✅ status test passed - Server is ${statusResponse.status}`);
      } else {
        console.error('❌ status test failed');
      }
      
      // Test version method
      console.log('\n📊 Testing version method...');
      const versionResponse = await client.getVersion();
      if (validateMCPResponse(versionResponse, 'version')) {
        console.log(`✅ version test passed - Server version is ${versionResponse.version}`);
      } else {
        console.error('❌ version test failed');
      }
      
      // Test servers/list method
      console.log('\n🖥️ Testing servers/list method...');
      const serversResponse = await client.listServers();
      if (validateMCPResponse(serversResponse, 'servers/list')) {
        console.log(`✅ servers/list test passed - Found ${serversResponse.servers.length} servers`);
      } else {
        console.error('❌ servers/list test failed');
      }
    } catch (error) {
      console.error('\n❌ Protocol methods tests failed:', error.message);
    }
    
  } catch (error) {
    console.error('\n❌ Test suite failed:', error.message);
  }
}

// Run the test suite
runTests().catch(error => {
  console.error('Unhandled error in test suite:', error);
  process.exit(1);
});
