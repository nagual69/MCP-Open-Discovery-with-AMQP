/**
 * Proper MCP SDK-Compatible AMQP Client Test
 * 
 * This test demonstrates how to properly use the MCP SDK Client with our AMQP transport
 * following the patterns from the official MCP SDK client examples.
 */

const { Client } = require('@modelcontextprotocol/sdk/dist/cjs/client/index.js');
const { 
    CallToolResultSchema, 
    ListToolsResultSchema, 
    LoggingMessageNotificationSchema 
} = require('@modelcontextprotocol/sdk/dist/cjs/types.js');

// Our custom AMQP transport
const { AMQPClientTransport } = require('./tools/transports/amqp-client-transport.js');

async function testProperMcpAmqpClient() {
    console.log('\n=== Proper MCP SDK AMQP Client Test ===\n');

    let client = null;
    let transport = null;

    try {
        // 1. Create MCP SDK Client (following official examples)
        console.log('🔌 Creating MCP SDK Client...');
        client = new Client({
            name: 'mcp-discovery-amqp-client',
            version: '1.0.0'
        });

        // 2. Set up error handler (following official pattern)
        client.onerror = (error) => {
            console.error('❌ Client error:', error);
        };

        // 3. Set up notification handler (following official pattern)
        client.setNotificationHandler(LoggingMessageNotificationSchema, (notification) => {
            console.log(`📢 Notification: ${notification.params.level} - ${notification.params.data}`);
        });

        // 4. Create our AMQP transport
        console.log('🔌 Creating AMQP transport...');
        transport = new AMQPClientTransport({
            amqpUrl: 'amqp://mcp:discovery@localhost:5672',
            serverQueuePrefix: 'mcp.server',
            exchangeName: 'mcp.requests'
        });

        // 5. Connect using MCP SDK pattern (client.connect)
        console.log('🔌 Connecting to MCP server via AMQP...');
        await client.connect(transport);
        console.log('✅ Connected successfully to MCP server');

        // 6. List available tools (following official pattern)
        console.log('\n🔧 Listing available tools...');
        const toolsRequest = {
            method: 'tools/list',
            params: {}
        };
        const toolsResult = await client.request(toolsRequest, ListToolsResultSchema);
        
        console.log('✅ Tools list received');
        console.log(`📊 Total tools available: ${toolsResult.tools.length}`);
        
        if (toolsResult.tools.length > 0) {
            console.log('🔧 First few tools:');
            toolsResult.tools.slice(0, 5).forEach(tool => {
                console.log(`  - ${tool.name}: ${tool.description}`);
            });
        }

        // 7. Call a tool (following official pattern)
        console.log('\n💾 Testing memory statistics tool...');
        const memoryToolRequest = {
            method: 'tools/call',
            params: {
                name: 'mcp_mcp-open-disc_memory_stats',
                arguments: {}
            }
        };
        const memoryResult = await client.request(memoryToolRequest, CallToolResultSchema);
        console.log('✅ Memory stats tool result:');
        memoryResult.content.forEach(item => {
            if (item.type === 'text') {
                console.log(`  ${item.text}`);
            } else {
                console.log(`  ${item.type}:`, item);
            }
        });

        // 8. Test ping tool
        console.log('\n🏓 Testing ping tool...');
        const pingToolRequest = {
            method: 'tools/call',
            params: {
                name: 'mcp_mcp-open-disc_ping',
                arguments: {
                    host: '8.8.8.8',
                    count: 2
                }
            }
        };
        const pingResult = await client.request(pingToolRequest, CallToolResultSchema);
        console.log('✅ Ping tool result:');
        pingResult.content.forEach(item => {
            if (item.type === 'text') {
                console.log(`  ${item.text}`);
            } else {
                console.log(`  ${item.type}:`, item);
            }
        });

        // 9. Test registry status tool
        console.log('\n📊 Testing registry status tool...');
        const registryToolRequest = {
            method: 'tools/call',
            params: {
                name: 'mcp_mcp-open-disc_registry_get_status',
                arguments: {
                    format: 'summary'
                }
            }
        };
        const registryResult = await client.request(registryToolRequest, CallToolResultSchema);
        console.log('✅ Registry status result:');
        registryResult.content.forEach(item => {
            if (item.type === 'text') {
                console.log(`  ${item.text}`);
            } else {
                console.log(`  ${item.type}:`, item);
            }
        });

        console.log('\n🎉 All tests completed successfully!');
        console.log('✅ AMQP client is properly configured for MCP SDK compatibility');
        console.log('✅ Bidirectional communication working correctly');

    } catch (error) {
        console.error('❌ Test failed:', error);
        if (error.stack) {
            console.error('Stack trace:', error.stack);
        }
    } finally {
        try {
            if (transport) {
                await transport.close();
                console.log('🔌 Transport closed');
            }
        } catch (closeError) {
            console.error('Error closing transport:', closeError);
        }
    }
}

// Run the test
testProperMcpAmqpClient().catch(console.error);
