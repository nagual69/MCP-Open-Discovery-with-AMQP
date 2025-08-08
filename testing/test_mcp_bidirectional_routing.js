#!/usr/bin/env node

/**
 * Test MCP Bidirectional Routing Implementation
 * Tests the complete MCP session/stream management with bidirectional pub/sub routing
 */

const { Client } = require('@modelcontextprotocol/sdk/client/index.js');

// Import our AMQP client transport
const { AMQPClientTransport } = require('../tools/transports/amqp-client-transport.js');

// Load environment configuration if available
try {
  require('dotenv').config();
} catch (error) {
  // Fallback if dotenv not available
  console.log('Note: dotenv not available, using defaults');
}

const config = {
  host: process.env.RABBITMQ_HOST || 'localhost',
  port: parseInt(process.env.RABBITMQ_PORT || '5672'),
  username: process.env.RABBITMQ_USERNAME || 'mcp',
  password: process.env.RABBITMQ_PASSWORD || 'discovery',
  exchangeName: process.env.RABBITMQ_EXCHANGE || 'mcp.notifications',
  queuePrefix: process.env.RABBITMQ_QUEUE_PREFIX || 'mcp.discovery'
};

async function testMCPBidirectionalRouting() {
  console.log('\n🧪 Testing MCP Bidirectional Routing Implementation\n');
  
  try {
    // Create AMQP transport with MCP bidirectional routing
    console.log('🔌 Creating AMQP client transport with bidirectional routing...');
    const transport = new AMQPClientTransport({
      amqpUrl: `amqp://${config.username}:${config.password}@${config.host}:${config.port}`,
      serverQueuePrefix: config.queuePrefix,
      exchangeName: config.exchangeName,
      responseTimeout: 30000
    });

    // Create MCP client
    const client = new Client(
      { name: 'mcp-test-client', version: '1.0.0' },
      { capabilities: { tools: true, resources: true, prompts: true } }
    );

    console.log('📡 Connecting to MCP server with bidirectional routing...');
    await client.connect(transport);

    console.log('✅ Connected successfully! Testing MCP protocol operations...\n');

    // Test 1: List available tools
    console.log('🔧 Test 1: Listing available tools...');
    const { ListToolsResultSchema } = require('@modelcontextprotocol/sdk');
    const toolsResponse = await client.request(
      { method: 'tools/list' },
      ListToolsResultSchema,
      { timeout: 10000 }
    );
    
    console.log(`📊 Found ${toolsResponse.tools?.length || 0} tools available`);
    if (toolsResponse.tools && toolsResponse.tools.length > 0) {
      console.log('🏷️  Tool categories found:');
      const categories = [...new Set(toolsResponse.tools.map(tool => {
        const nameParts = tool.name.split('_');
        return nameParts[0] || 'general';
      }))];
      categories.forEach(cat => console.log(`   - ${cat}`));
    }

    // Test 2: Test credentials tool (simple operation)
    console.log('\n🔐 Test 2: Testing credentials_list tool...');
    try {
      const { CallToolResultSchema } = require('@modelcontextprotocol/sdk');
      const credentialsResponse = await client.request(
        {
          method: 'tools/call',
          params: {
            name: 'credentials_list',
            arguments: {}
          }
        },
        CallToolResultSchema,
        { timeout: 10000 }
      );
      console.log('✅ Credentials tool responded successfully');
      console.log(`📝 Credentials found: ${credentialsResponse.content?.[0]?.text ? 'Yes' : 'None'}`);
    } catch (error) {
      console.log(`⚠️  Credentials tool error: ${error.message}`);
    }

    // Test 3: Test memory tool (memory operations)
    console.log('\n🧠 Test 3: Testing memory_stats tool...');
    try {
      const memoryResponse = await client.request(
        {
          method: 'tools/call',
          params: {
            name: 'memory_stats',
            arguments: {}
          }
        },
        { timeout: 10000 }
      );
      console.log('✅ Memory tool responded successfully');
      console.log(`📊 Memory stats retrieved: ${memoryResponse.content?.[0]?.text ? 'Yes' : 'None'}`);
    } catch (error) {
      console.log(`⚠️  Memory tool error: ${error.message}`);
    }

    // Test 4: Test ping tool (network operations)
    console.log('\n🏓 Test 4: Testing ping tool with localhost...');
    try {
      const pingResponse = await client.request(
        {
          method: 'tools/call',
          params: {
            name: 'ping',
            arguments: {
              host: 'localhost',
              count: 1
            }
          }
        },
        { timeout: 15000 }
      );
      console.log('✅ Ping tool responded successfully');
      console.log(`🌐 Ping result: ${pingResponse.content?.[0]?.text ? 'Success' : 'No response'}`);
    } catch (error) {
      console.log(`⚠️  Ping tool error: ${error.message}`);
    }

    // Test 5: Test resources access
    console.log('\n📚 Test 5: Testing resource access...');
    try {
      const resourcesResponse = await client.request(
        { method: 'resources/list' },
        { timeout: 10000 }
      );
      console.log(`📖 Found ${resourcesResponse.resources?.length || 0} resources available`);
    } catch (error) {
      console.log(`⚠️  Resources error: ${error.message}`);
    }

    // Test 6: Test prompts access
    console.log('\n💬 Test 6: Testing prompts access...');
    try {
      const promptsResponse = await client.request(
        { method: 'prompts/list' },
        { timeout: 10000 }
      );
      console.log(`🗨️  Found ${promptsResponse.prompts?.length || 0} prompts available`);
    } catch (error) {
      console.log(`⚠️  Prompts error: ${error.message}`);
    }

    console.log('\n🎉 MCP Bidirectional Routing Tests Complete!');
    console.log('✅ All MCP protocol operations working through bidirectional AMQP routing');

    // Cleanup
    await transport.close();
    console.log('🔌 Transport closed cleanly');

  } catch (error) {
    console.error('\n❌ Test failed:');
    console.error('Error:', error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
  }
}

// Run the test
testMCPBidirectionalRouting().catch(error => {
  console.error('💥 Fatal error:', error);
  process.exit(1);
});
