/**
 * FORENSIC TEST: Direct tool invocation test
 * 
 * This will test calling a tool directly to see where the error occurs
 */

const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { z } = require('zod');
const { zodToJsonSchema } = require('zod-to-json-schema');

console.log('=== DIRECT TOOL INVOCATION TEST ===');

// Create a simple server
const testServer = new McpServer(
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

// Create a simple tool with Zod schema
const testToolSchema = z.object({
  message: z.string()
});

// Convert to JSON Schema
const jsonSchema = zodToJsonSchema(testToolSchema);
console.log('1. JSON Schema being registered:');
console.log(JSON.stringify(jsonSchema, null, 2));

// Register the tool using server.registerTool (like our simple parameter tools)
try {
  console.log('\n2. Registering tool with server.registerTool...');
  testServer.registerTool('test_tool', {
    description: 'A test tool',
    inputSchema: jsonSchema
  }, async (args) => {
    console.log('Tool called with args:', args);
    return {
      content: [
        {
          type: "text",
          text: `Received: ${args.message}`
        }
      ]
    };
  });
  console.log('✅ Tool registered successfully');
} catch (error) {
  console.log('❌ Registration failed:', error.message);
  console.log(error.stack);
}

// Now try to simulate calling the tool
console.log('\n3. Tool registration complete. In a real scenario, the tool would be called by MCP client...');
console.log('   The keyValidator._parse error happens during tool invocation, not registration.');

console.log('\n=== END TEST ===');
