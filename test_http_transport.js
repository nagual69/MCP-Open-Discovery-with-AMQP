/**
 * Test script for HTTP transport functionality
 * 
 * This script tests the multi-transport server's HTTP capabilities,
 * including session management, tool calls, and SSE streaming.
 */

const fs = require('fs');
const http = require('http');

/**
 * Enhanced logging
 */
function log(level, message, data = null) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] [${level.toUpperCase()}] ${message}`;
  
  if (level === 'error') {
    console.error(logMessage, data ? JSON.stringify(data, null, 2) : '');
  } else {
    console.log(logMessage, data ? JSON.stringify(data, null, 2) : '');
  }
}

/**
 * Make HTTP request to MCP server
 */
function makeRequest(options, data = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => {
        body += chunk;
      });
      res.on('end', () => {
        try {
          const parsed = body ? JSON.parse(body) : null;
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body: parsed
          });
        } catch (error) {
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body: body
          });
        }
      });
    });

    req.on('error', reject);
    
    if (data) {
      req.write(JSON.stringify(data));
    }
    req.end();
  });
}

/**
 * Test the health endpoint
 */
async function testHealthEndpoint() {
  log('info', 'Testing health endpoint...');
  
  try {
    const response = await makeRequest({
      hostname: 'localhost',
      port: 3000,
      path: '/health',
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    });

    if (response.statusCode === 200) {
      log('info', 'Health endpoint test PASSED', response.body);
      return true;
    } else {
      log('error', 'Health endpoint test FAILED', {
        statusCode: response.statusCode,
        body: response.body
      });
      return false;
    }
  } catch (error) {
    log('error', 'Health endpoint test ERROR', error.message);
    return false;
  }
}

/**
 * Test MCP initialization over HTTP
 */
async function testMcpInitialization() {
  log('info', 'Testing MCP initialization...');
  
  const initRequest = {
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2024-11-05',
      capabilities: {
        tools: {}
      },
      clientInfo: {
        name: 'test-client',
        version: '1.0.0'
      }
    }
  };

  try {    const response = await makeRequest({
      hostname: 'localhost',
      port: 3000,
      path: '/mcp',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream'
      }
    }, initRequest);    if (response.statusCode === 200) {
      // Handle SSE format response
      if (typeof response.body === 'string' && response.body.includes('event: message')) {
        // Parse SSE format
        const dataMatch = response.body.match(/data: ({.*})/);
        if (dataMatch) {
          try {
            const parsed = JSON.parse(dataMatch[1]);
            if (parsed.result) {
              log('info', 'MCP initialization test PASSED');
              log('debug', 'Server capabilities', parsed.result.capabilities);
              
              // Extract session ID from headers
              const sessionId = response.headers['mcp-session-id'];
              if (sessionId) {
                log('info', 'Session ID received', { sessionId });
                return sessionId;
              } else {
                log('warn', 'No session ID in response headers');
                return null;
              }
            }
          } catch (parseError) {
            log('error', 'Failed to parse SSE data', parseError.message);
          }
        }
      } else if (response.body?.result) {
        // Handle regular JSON response
        log('info', 'MCP initialization test PASSED');
        log('debug', 'Server capabilities', response.body.result.capabilities);
        
        // Extract session ID from headers
        const sessionId = response.headers['mcp-session-id'];
        if (sessionId) {
          log('info', 'Session ID received', { sessionId });
          return sessionId;
        } else {
          log('warn', 'No session ID in response headers');
          return null;
        }
      }
    } else {
      log('error', 'MCP initialization test FAILED', {
        statusCode: response.statusCode,
        body: response.body
      });
      return null;
    }
  } catch (error) {
    log('error', 'MCP initialization test ERROR', error.message);
    return null;
  }
}

/**
 * Test listing tools
 */
async function testListTools(sessionId) {
  log('info', 'Testing tools/list...');
  
  const listRequest = {
    jsonrpc: '2.0',
    id: 2,
    method: 'tools/list'
  };

  try {    const response = await makeRequest({
      hostname: 'localhost',
      port: 3000,
      path: '/mcp',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream',
        'mcp-session-id': sessionId
      }
    }, listRequest);    if (response.statusCode === 200) {
      let tools = null;
      
      // Handle SSE format response
      if (typeof response.body === 'string' && response.body.includes('event: message')) {
        // Parse SSE format
        const dataMatch = response.body.match(/data: ({.*})/);
        if (dataMatch) {
          try {
            const parsed = JSON.parse(dataMatch[1]);
            if (parsed.result && parsed.result.tools) {
              tools = parsed.result.tools;
            }
          } catch (parseError) {
            log('error', 'Failed to parse SSE data', parseError.message);
          }
        }
      } else if (response.body?.result?.tools) {
        // Handle regular JSON response
        tools = response.body.result.tools;
      }
      
      if (tools) {
        log('info', 'List tools test PASSED', {
          toolCount: tools.length,
          tools: tools.slice(0, 3).map(t => t.name) // Show first 3 tools
        });
        return tools;
      }
    } else {
      log('error', 'List tools test FAILED', {
        statusCode: response.statusCode,
        body: response.body
      });
      return null;
    }
  } catch (error) {
    log('error', 'List tools test ERROR', error.message);
    return null;
  }
}

/**
 * Test calling a simple tool
 */
async function testToolCall(sessionId) {
  log('info', 'Testing tool call (ping)...');
  
  const toolRequest = {
    jsonrpc: '2.0',
    id: 3,
    method: 'tools/call',
    params: {
      name: 'ping',
      arguments: {
        host: '8.8.8.8',
        count: 2
      }
    }
  };

  try {    const response = await makeRequest({
      hostname: 'localhost',
      port: 3000,
      path: '/mcp',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream',
        'mcp-session-id': sessionId
      }
    }, toolRequest);    if (response.statusCode === 200) {
      let result = null;
      
      // Handle SSE format response
      if (typeof response.body === 'string' && response.body.includes('event: message')) {
        // Parse SSE format
        const dataMatch = response.body.match(/data: ({.*})/);
        if (dataMatch) {
          try {
            const parsed = JSON.parse(dataMatch[1]);
            if (parsed.result) {
              result = parsed.result;
            }
          } catch (parseError) {
            log('error', 'Failed to parse SSE data', parseError.message);
          }
        }
      } else if (response.body?.result) {
        // Handle regular JSON response
        result = response.body.result;
      }
      
      if (result) {
        log('info', 'Tool call test PASSED');
        log('debug', 'Tool result', {
          hasContent: !!result.content,
          contentLength: result.content?.length || 0
        });
        return true;
      }
    } else {
      log('error', 'Tool call test FAILED', {
        statusCode: response.statusCode,
        body: response.body
      });
      return false;
    }
  } catch (error) {
    log('error', 'Tool call test ERROR', error.message);
    return false;
  }
}

/**
 * Test memory tools functionality
 */
async function testMemoryTools(sessionId) {
  log('info', 'Testing memory tools...');
  
  // Test setting a memory item
  const setRequest = {
    jsonrpc: '2.0',
    id: 4,
    method: 'tools/call',
    params: {
      name: 'memory_set',
      arguments: {
        key: 'test:host:example.com',
        value: {
          type: 'host',
          name: 'example.com',
          ip: '93.184.216.34',
          status: 'active',
          last_seen: new Date().toISOString()
        }
      }
    }
  };

  try {
    // Helper function to parse SSE or JSON response
    const parseResponse = (response) => {
      if (response.statusCode !== 200) return null;
      
      // Handle SSE format response
      if (typeof response.body === 'string' && response.body.includes('event: message')) {
        const dataMatch = response.body.match(/data: ({.*})/);
        if (dataMatch) {
          try {
            const parsed = JSON.parse(dataMatch[1]);
            return parsed.result;
          } catch (parseError) {
            log('error', 'Failed to parse SSE data', parseError.message);
          }
        }
      } else if (response.body?.result) {
        // Handle regular JSON response
        return response.body.result;
      }
      return null;
    };
    
    const setResponse = await makeRequest({
      hostname: 'localhost',
      port: 3000,
      path: '/mcp',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream',
        'mcp-session-id': sessionId
      }    }, setRequest);

    const setResult = parseResponse(setResponse);
    if (!setResult) {
      log('error', 'Memory set test FAILED', setResponse.body);
      return false;
    }

    // Test getting the memory item
    const getRequest = {
      jsonrpc: '2.0',
      id: 5,
      method: 'tools/call',
      params: {
        name: 'memory_get',
        arguments: {
          key: 'test:host:example.com'
        }
      }
    };    const getResponse = await makeRequest({
      hostname: 'localhost',
      port: 3000,
      path: '/mcp',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream',
        'mcp-session-id': sessionId
      }    }, getRequest);

    const getResult = parseResponse(getResponse);
    if (getResult) {
      log('info', 'Memory tools test PASSED');
      return true;
    } else {
      log('error', 'Memory get test FAILED', getResponse.body);
      return false;
    }
  } catch (error) {
    log('error', 'Memory tools test ERROR', error.message);
    return false;
  }
}

/**
 * Test session termination
 */
async function testSessionTermination(sessionId) {
  log('info', 'Testing session termination...');
  
  try {
    const response = await makeRequest({
      hostname: 'localhost',
      port: 3000,
      path: '/mcp',
      method: 'DELETE',
      headers: {
        'mcp-session-id': sessionId
      }
    });

    log('info', 'Session termination test completed', {
      statusCode: response.statusCode
    });
    return true;
  } catch (error) {
    log('error', 'Session termination test ERROR', error.message);
    return false;
  }
}

/**
 * Run all HTTP transport tests
 */
async function runTests() {
  log('info', 'Starting HTTP transport tests...');
  log('info', 'Note: Make sure the server is running with HTTP transport enabled');
  log('info', 'Run: npm run start-http or TRANSPORT_MODE=http node mcp_server_multi_transport_sdk.js');
  
  // Wait a moment for server to be ready
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  const results = {
    health: false,
    initialization: false,
    listTools: false,
    toolCall: false,
    memoryTools: false,
    sessionTermination: false
  };

  let sessionId = null;

  try {
    // Test health endpoint
    results.health = await testHealthEndpoint();
    
    if (results.health) {
      // Test MCP initialization
      sessionId = await testMcpInitialization();
      results.initialization = !!sessionId;
      
      if (sessionId) {
        // Test listing tools
        const tools = await testListTools(sessionId);
        results.listTools = !!tools;
        
        if (tools) {
          // Test tool call
          results.toolCall = await testToolCall(sessionId);
          
          // Test memory tools
          results.memoryTools = await testMemoryTools(sessionId);
        }
        
        // Test session termination
        results.sessionTermination = await testSessionTermination(sessionId);
      }
    }

  } catch (error) {
    log('error', 'Test suite error', error.message);
  }

  // Report results
  log('info', 'Test Results Summary:');
  const passed = Object.values(results).filter(Boolean).length;
  const total = Object.keys(results).length;
  
  for (const [test, result] of Object.entries(results)) {
    log('info', `  ${test}: ${result ? 'PASS' : 'FAIL'}`);
  }
  
  log('info', `Overall: ${passed}/${total} tests passed`);
  
  if (passed === total) {
    log('info', '🎉 All HTTP transport tests PASSED!');
    process.exit(0);
  } else {
    log('error', '❌ Some HTTP transport tests FAILED');
    process.exit(1);
  }
}

// Run tests if this file is executed directly
if (require.main === module) {
  runTests().catch((error) => {
    log('error', 'Test runner failed', error);
    process.exit(1);
  });
}

module.exports = { runTests };
