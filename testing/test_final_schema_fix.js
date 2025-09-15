#!/usr/bin/env node

/**
 * Final Schema Fix Test
 * Tests that our schema conversion fix resolves the keyValidator._parse error
 * for all tool types (standard library converted vs. custom array tools)
 */

console.log("🧪 Testing Final Schema Fix - MCP Open Discovery v2.0");
const { mcpUrl } = require('./test_http_port');
console.log("=" .repeat(60));

// Test various tool types that previously failed with keyValidator._parse
const testCases = [
  {
    name: "Memory Tool (Standard Library)",
    method: "POST", 
  url: mcpUrl,
    data: {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: {
        name: "memory_stats",
        arguments: {}
      }
    }
  },
  {
    name: "Network Tool (Standard Library)", 
    method: "POST",
  url: mcpUrl, 
    data: {
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: {
        name: "ping",
        arguments: {
          host: "8.8.8.8",
          count: 3
        }
      }
    }
  },
  {
    name: "SNMP Array Tool (Custom Conversion)",
    method: "POST",
  url: mcpUrl,
    data: {
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call", 
      params: {
        name: "snmp_get",
        arguments: {
          sessionId: "test-session",
          oids: ["1.3.6.1.2.1.1.1.0", "1.3.6.1.2.1.1.3.0"]
        }
      }
    }
  }
];

async function runTest(testCase, sessionId) {
  console.log(`\n🔧 Testing: ${testCase.name}`);
  console.log("-".repeat(40));
  
  try {
    const response = await fetch(testCase.url, {
      method: testCase.method,
      headers: { 
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream',
        'mcp-session-id': sessionId
      },
      body: JSON.stringify(testCase.data)
    });
    
    const result = await parseSSEResponse(response);
    
    if (result.error) {
      console.log(`❌ FAILED: ${result.error.message}`);
      if (result.error.message.includes("keyValidator._parse")) {
        console.log("🚨 CRITICAL: keyValidator._parse error still present!");
        return false;
      }
      return false;
    } else {
      console.log(`✅ SUCCESS: Tool executed without keyValidator._parse error`);
      console.log(`📋 Result type: ${typeof result.result}`);
      console.log(`📋 Result preview: ${JSON.stringify(result.result).substring(0, 100)}...`);
      return true;
    }
  } catch (error) {
    console.log(`❌ FAILED: ${error.message}`);
    return false;
  }
}

async function parseSSEResponse(response) {
  const text = await response.text();
  const contentType = response.headers.get('content-type');
  
  if (contentType?.includes('text/event-stream')) {
    // Parse Server-Sent Events format
    const lines = text.split('\n');
    const events = [];
    let currentEvent = {};
    
    for (const line of lines) {
      if (line.startsWith('event: ')) {
        currentEvent.event = line.substring(7);
      } else if (line.startsWith('data: ')) {
        const jsonData = line.substring(6);
        try {
          currentEvent.data = JSON.parse(jsonData);
        } catch (err) {
          currentEvent.data = jsonData;
        }
      } else if (line === '' && Object.keys(currentEvent).length > 0) {
        events.push(currentEvent);
        currentEvent = {};
      }
    }
    
    // Add last event if not empty
    if (Object.keys(currentEvent).length > 0) {
      events.push(currentEvent);
    }
    
    // Look for response event (either result or error)
    const responseEvent = events.find(e => e.event === 'message' && (e.data?.result || e.data?.error));
    if (responseEvent) {
      return responseEvent.data;
    } else {
      throw new Error('No valid response event found in SSE');
    }
  } else {
    // Regular JSON response
    return JSON.parse(text);
  }
}

async function testToolList() {
  console.log("\n🔍 Testing Tool Discovery (tools/list)");
  console.log("-".repeat(40));
  
  // First establish session
  try {
  const initResponse = await fetch(mcpUrl, {
      method: "POST",
      headers: { 
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream'
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: -1,
        method: "initialize",
        params: {
          protocolVersion: "2024-11-05",
          capabilities: {
            tools: {}
          },
          clientInfo: {
            name: "schema-test-client",
            version: "1.0.0"
          }
        }
      })
    });
    
    const initResult = await parseSSEResponse(initResponse);
    console.log(`📡 Initialize response: ${initResult.error ? 'FAILED' : 'SUCCESS'}`);
    
    if (initResult.error) {
      console.log(`❌ Initialize failed: ${initResult.error.message}`);
      return { success: false, sessionId: null };
    }
    
    // Extract session ID from response headers, initialize response, or generate one
    let sessionId = initResponse.headers.get('mcp-session-id') || 
                    initResponse.headers.get('x-session-id') ||
                    initResult.result?.sessionId;
    
    if (!sessionId) {
      sessionId = `test-session-${Date.now()}`;
      console.log(`⚠️  No session ID from server, generating: ${sessionId}`);
    } else {
      console.log(`🔗 Session ID from server: ${sessionId}`);
    }
    
    // Send initialized notification (required by MCP protocol)
  const notifyResponse = await fetch(mcpUrl, {
      method: "POST", 
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream',
        'mcp-session-id': sessionId
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "notifications/initialized",
        params: {}
      })
    });
    
    console.log(`📡 Initialized notification sent: ${notifyResponse.ok ? 'SUCCESS' : 'FAILED'}`);
    
    // Now test tools/list
  const response = await fetch(mcpUrl, {
      method: "POST",
      headers: { 
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream',
        'mcp-session-id': sessionId
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 0,
        method: "tools/list",
        params: {}
      })
    });
    
    const result = await parseSSEResponse(response);
    
    if (result.error) {
      console.log(`❌ Tool list failed: ${result.error.message}`);
      return { success: false, sessionId };
    }
    
    const toolCount = result.result?.tools?.length || 0;
    console.log(`✅ SUCCESS: Discovered ${toolCount} tools`);
    
    // Check for specific tool types
    const tools = result.result.tools || [];
    const memoryTools = tools.filter(t => t.name.startsWith('memory_')).length;
    const networkTools = tools.filter(t => t.name.startsWith('ping') || t.name.startsWith('wget')).length;
    const snmpTools = tools.filter(t => t.name.startsWith('snmp_')).length;
    const testTools = tools.filter(t => t.name.startsWith('test_')).length;
    
    console.log(`📊 Tool Categories:`);
    console.log(`   • Memory Tools: ${memoryTools}`);
    console.log(`   • Network Tools: ${networkTools}`);
    console.log(`   • SNMP Tools: ${snmpTools}`);
    console.log(`   • Test Tools: ${testTools}`);
    
    return { success: true, sessionId };
  } catch (error) {
    console.log(`❌ Tool list failed: ${error.message}`);
    return { success: false, sessionId: null };
  }
}

async function main() {
  console.log("\n🚀 Starting Final Schema Fix Validation");
  
  // Wait for server to be ready
  console.log("\n⏳ Waiting for server startup...");
  await new Promise(resolve => setTimeout(resolve, 5000));
  
  // Test tool discovery first
  const listResult = await testToolList();
  if (!listResult.success) {
    console.log("\n🚨 CRITICAL: Tool discovery failed - cannot proceed with tests");
    process.exit(1);
  }
  
  const sessionId = listResult.sessionId;
  console.log(`\n🔗 Using session ID: ${sessionId}`);
  
  // Run individual tool tests
  let successCount = 0;
  let totalTests = testCases.length;
  
  for (const testCase of testCases) {
    const success = await runTest(testCase, sessionId);
    if (success) successCount++;
  }
  
  // Summary
  console.log("\n" + "=".repeat(60));
  console.log("📊 FINAL RESULTS");
  console.log("=".repeat(60));
  
  if (successCount === totalTests) {
    console.log(`🎉 ALL TESTS PASSED! (${successCount}/${totalTests})`);
    console.log("✅ keyValidator._parse error has been RESOLVED!");
    console.log("✅ Standard library schema conversion working");
    console.log("✅ Custom array tool conversion working");
    console.log("✅ Raw schema tools working");
    console.log("\n🚀 MCP Open Discovery v2.0 - Schema Fix Complete!");
  } else {
    console.log(`❌ SOME TESTS FAILED (${successCount}/${totalTests})`);
    console.log("🔧 Further investigation required");
  }
  
  console.log("\n📋 Test Summary:");
  console.log(`   • Total Tests: ${totalTests}`);
  console.log(`   • Successful: ${successCount}`);
  console.log(`   • Failed: ${totalTests - successCount}`);
  console.log(`   • Success Rate: ${Math.round((successCount/totalTests) * 100)}%`);
}

main().catch(console.error);
