require('dotenv').config();
const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { ListToolsResultSchema, CallToolResultSchema } = require('@modelcontextprotocol/sdk/types.js');
const { AMQPClientTransport } = require('../tools/transports/amqp-client-transport.js');

const config = {
  host: process.env.RABBITMQ_HOST || 'localhost',
  port: process.env.RABBITMQ_PORT || 5672,
  username: process.env.RABBITMQ_USERNAME || 'mcp',
  password: process.env.RABBITMQ_PASSWORD || 'discovery',
  queuePrefix: process.env.QUEUE_PREFIX || 'mcp',
  exchangeName: process.env.EXCHANGE_NAME || 'mcp.notifications'
};

async function testSimpleBidirectional() {
  console.log('\n🧪 Testing Simple MCP Bidirectional Routing\n');
  
  try {
    // Create AMQP transport with MCP bidirectional routing
    console.log('🔌 Creating AMQP client transport...');
    const transport = new AMQPClientTransport({
      amqpUrl: `amqp://${config.username}:${config.password}@${config.host}:${config.port}`,
      serverQueuePrefix: config.queuePrefix,
      exchangeName: config.exchangeName,
      responseTimeout: 30000
    });

    // Create MCP client
    const client = new Client(
      { name: 'mcp-test-client', version: '1.0.0' },
      { capabilities: { tools: true } }
    );

    console.log('📡 Connecting to MCP server...');
    await client.connect(transport);
    console.log('✅ Connected successfully!');

    // Test 1: List tools
    console.log('\n🔧 Test 1: Listing available tools...');
    const toolsResponse = await client.request(
      { method: 'tools/list' },
      ListToolsResultSchema,
      { timeout: 10000 }
    );
    
    console.log(`📊 Found ${toolsResponse.tools?.length || 0} tools available`);
    if (toolsResponse.tools && toolsResponse.tools.length > 0) {
      console.log('🏷️  First 5 tools:');
      toolsResponse.tools.slice(0, 5).forEach(tool => 
        console.log(`   - ${tool.name}: ${tool.description || 'No description'}`)
      );
    }

    // Test 2: Call a simple tool (credentials_list)
    console.log('\n🔐 Test 2: Testing credentials_list tool...');
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
    
    console.log('✅ Credentials tool call successful!');
    console.log(`   Response has content: ${!!credentialsResponse.content}`);
    if (credentialsResponse.content && credentialsResponse.content.length > 0) {
      console.log(`   Content type: ${credentialsResponse.content[0].type}`);
    }

    console.log('\n🎉 All tests passed! Bidirectional routing is working correctly.');

    await client.close();
    await transport.close();
    
    console.log('✅ Test completed successfully!');
    process.exit(0);

  } catch (error) {
    console.error('\n❌ Test failed:');
    console.error(`Error: ${error.message}`);
    console.error(`Stack: ${error.stack}`);
    process.exit(1);
  }
}

testSimpleBidirectional().catch(console.error);
