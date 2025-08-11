/**
 * Simple test to isolate the keyValidator._parse error
 */

const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');

async function testDirectRegistration() {
  console.log('🔧 Testing Direct MCP SDK Registration');
  
  const server = new McpServer(
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

  // Test 1: Simple registerTool with JSON Schema
  try {
    console.log('\n📋 Test 1: server.registerTool() with JSON Schema');
    
    const simpleSchema = {
      type: 'object',
      properties: {
        host: {
          type: 'string',
          description: 'Target host'
        }
      },
      required: ['host']
    };
    
    server.registerTool('test_simple', {
      description: 'Simple test tool',
      inputSchema: simpleSchema
    }, async (args) => {
      console.log('Tool called with args:', args);
      return { result: 'success', input: args };
    });
    
    console.log('✅ registerTool() worked');
    
  } catch (error) {
    console.log('❌ registerTool() failed:', error.message);
  }

  // Test calling the tool
  console.log('\n📋 Test 3: Actually calling the tool through MCP protocol');
  
  try {
    const transport = new StdioServerTransport();
    
    // Connect server to transport
    await server.connect(transport);
    
    console.log('✅ Server connected to transport');
    
  } catch (error) {
    console.log('❌ Server connection failed:', error.message);
    console.log('Full error:', error);
  }

  console.log('\n🎯 Registration test completed');
}

// Run test if this file is executed directly
if (require.main === module) {
  testDirectRegistration().catch(console.error);
}

module.exports = { testDirectRegistration };
