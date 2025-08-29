/**
 * Debug MCP SDK Schema Handling
 * 
 * This script tests what the MCP SDK actually expects for inputSchema
 * and helps us understand the "keyValidator._parse is not a function" error.
 */

const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { z } = require('zod');
const { zodToJsonSchema } = require('zod-to-json-schema');

async function testMCPSchemaTypes() {
  console.log('🔬 Testing MCP SDK Schema Types...\n');

  // Create a test server
  const server = new Server(
    {
      name: 'test-server',
      version: '1.0.0'
    },
    {
      capabilities: {
        tools: {}
      }
    }
  );

  // Test 1: Raw JSON Schema (what we're converting to)
  console.log('📋 Test 1: Raw JSON Schema');
  try {
    const jsonSchema = {
      type: "object",
      properties: {
        message: {
          type: "string",
          description: "Test message"
        }
      },
      required: ["message"]
    };

    server.registerTool('test_json_schema', {
      description: 'Test with raw JSON Schema',
      inputSchema: jsonSchema
    }, async (args) => {
      return { content: [{ type: "text", text: "JSON Schema test successful" }] };
    });

    console.log('✅ Raw JSON Schema registration: SUCCESS');
  } catch (error) {
    console.log('❌ Raw JSON Schema registration: FAILED');
    console.log('Error:', error.message);
  }

  // Test 2: Zod Schema (original format)
  console.log('\n📋 Test 2: Zod Schema');
  try {
    const zodSchema = z.object({
      message: z.string().describe("Test message")
    });

    server.registerTool('test_zod_schema', {
      description: 'Test with Zod Schema',
      inputSchema: zodSchema
    }, async (args) => {
      return { content: [{ type: "text", text: "Zod Schema test successful" }] };
    });

    console.log('✅ Zod Schema registration: SUCCESS');
  } catch (error) {
    console.log('❌ Zod Schema registration: FAILED');
    console.log('Error:', error.message);
  }

  // Test 3: Converted Zod to JSON Schema (our conversion)
  console.log('\n📋 Test 3: Converted Zod to JSON Schema');
  try {
    const zodSchema = z.object({
      message: z.string().describe("Test message")
    });
    
    const convertedSchema = zodToJsonSchema(zodSchema, { name: 'test' });

    server.registerTool('test_converted_schema', {
      description: 'Test with converted Zod to JSON Schema',
      inputSchema: convertedSchema
    }, async (args) => {
      return { content: [{ type: "text", text: "Converted Schema test successful" }] };
    });

    console.log('✅ Converted Schema registration: SUCCESS');
  } catch (error) {
    console.log('❌ Converted Schema registration: FAILED');
    console.log('Error:', error.message);
  }

  // Test 4: Check what MCP SDK actually calls during tool execution
  console.log('\n📋 Test 4: Tool Execution Test');
  
  // Mock a tool call to see where the error occurs
  try {
    // Simulate what happens when a tool is called
    console.log('Simulating tool call...');
    
    // This is roughly what the MCP SDK does internally
    const toolName = 'test_json_schema';
    const args = { message: 'test' };
    
    console.log('🔍 Inspecting registered tools:');
    // Try to access internal tool registry if possible
    if (server._tools) {
      console.log('Found _tools registry');
      Object.keys(server._tools).forEach(name => {
        const tool = server._tools[name];
        console.log(`Tool: ${name}`);
        console.log(`- Has inputSchema:`, !!tool.inputSchema);
        console.log(`- Schema type:`, typeof tool.inputSchema);
        console.log(`- Has _parse method:`, !!(tool.inputSchema && tool.inputSchema._parse));
        console.log(`- Schema keys:`, tool.inputSchema ? Object.keys(tool.inputSchema) : 'none');
      });
    } else {
      console.log('No _tools registry found');
    }

  } catch (error) {
    console.log('❌ Tool execution test: FAILED');
    console.log('Error:', error.message);
    console.log('Stack:', error.stack);
  }

  console.log('\n🏁 Schema testing complete');
}

// Run the test
testMCPSchemaTypes().catch(console.error);
