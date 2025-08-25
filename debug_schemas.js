#!/usr/bin/env node

/**
 * Schema Debugging Test
 * Deep dive into what schemas are actually being generated
 */

console.log("🔬 Schema Debugging - MCP Open Discovery v2.0");
console.log("=" .repeat(60));

async function parseSSEResponse(response) {
  const text = await response.text();
  const contentType = response.headers.get('content-type');
  
  if (contentType?.includes('text/event-stream')) {
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
    
    if (Object.keys(currentEvent).length > 0) {
      events.push(currentEvent);
    }
    
    const responseEvent = events.find(e => e.event === 'message' && (e.data?.result || e.data?.error));
    if (responseEvent) {
      return responseEvent.data;
    } else {
      throw new Error('No valid response event found in SSE');
    }
  } else {
    return JSON.parse(text);
  }
}

async function getToolSchemas() {
  console.log("\n🔍 Fetching Tool Schemas");
  console.log("-".repeat(40));
  
  try {
    // Initialize session
    const initResponse = await fetch("http://localhost:3000/mcp", {
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
          capabilities: { tools: {} },
          clientInfo: { name: "schema-debug-client", version: "1.0.0" }
        }
      })
    });
    
    const initResult = await parseSSEResponse(initResponse);
    const sessionId = initResponse.headers.get('mcp-session-id');
    console.log(`🔗 Session ID: ${sessionId}`);
    
    // Send initialized notification
    await fetch("http://localhost:3000/mcp", {
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
    
    // Get tools list
    const response = await fetch("http://localhost:3000/mcp", {
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
      console.log(`❌ Failed to get tools: ${result.error.message}`);
      return;
    }
    
    const tools = result.result.tools;
    console.log(`✅ Got ${tools.length} tools`);
    
    // Analyze specific problematic tools
    const testTools = {
      "memory_stats": tools.find(t => t.name === "memory_stats"),
      "ping": tools.find(t => t.name === "ping"), 
      "snmp_get": tools.find(t => t.name === "snmp_get"),
      "test_simple": tools.find(t => t.name === "test_simple")
    };
    
    console.log("\n📊 Schema Analysis");
    console.log("=".repeat(60));
    
    for (const [name, tool] of Object.entries(testTools)) {
      if (!tool) {
        console.log(`❌ Tool '${name}' not found`);
        continue;
      }
      
      console.log(`\n🔧 Tool: ${name}`);
      console.log(`   Description: ${tool.description?.substring(0, 60)}...`);
      console.log(`   Has inputSchema: ${!!tool.inputSchema}`);
      
      if (tool.inputSchema) {
        const schema = tool.inputSchema;
        console.log(`   Schema type: ${schema.type}`);
        console.log(`   Has properties: ${!!schema.properties}`);
        console.log(`   Properties count: ${schema.properties ? Object.keys(schema.properties).length : 0}`);
        console.log(`   Required fields: ${schema.required ? schema.required.length : 0}`);
        console.log(`   Has additionalProperties: ${'additionalProperties' in schema}`);
        console.log(`   additionalProperties value: ${schema.additionalProperties}`);
        console.log(`   Has $schema: ${'$schema' in schema}`);
        console.log(`   Has definitions: ${'definitions' in schema}`);
        console.log(`   Has $defs: ${'$defs' in schema}`);
        
        // Show first few properties
        if (schema.properties) {
          const propNames = Object.keys(schema.properties).slice(0, 3);
          console.log(`   First properties: ${propNames.join(', ')}`);
        }
        
        // Show full schema for debugging (first 500 chars)
        const schemaStr = JSON.stringify(schema, null, 2);
        console.log(`   Schema preview:\n${schemaStr.substring(0, 500)}${schemaStr.length > 500 ? '...' : ''}`);
      }
    }
    
  } catch (error) {
    console.log(`❌ Error: ${error.message}`);
  }
}

getToolSchemas().catch(console.error);
