/**
 * Validated AMQP Client Test Based on MCP SDK Examples
 * 
 * This test follows the exact patterns from the official MCP SDK client examples
 * to ensure our AMQP transport is properly configured for bidirectional communication.
 */

const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { 
    CallToolResultSchema, 
    ListToolsResultSchema, 
    LoggingMessageNotificationSchema 
} = require('@modelcontextprotocol/sdk/types.js');

// Our custom AMQP transport
const { AMQPClientTransport } = require('./tools/transports/amqp-client-transport.js');

/**
 * Test single client with multiple tool calls (following parallelToolCallsClient.js)
 */
async function testSingleClientMultipleTools() {
    console.log('\n=== Testing Single Client with Multiple Tools (AMQP) ===\n');

    let client = null;
    let transport = null;

    try {
        // 1. Create client (following exact SDK pattern)
        client = new Client({
            name: 'amqp-parallel-tool-calls-client',
            version: '1.0.0'
        });

        // 2. Set up error handler (following exact SDK pattern)
        client.onerror = (error) => {
            console.error('Client error:', error);
        };

        // 3. Create AMQP transport
        transport = new AMQPClientTransport({
            amqpUrl: 'amqp://mcp:discovery@localhost:5672',
            serverQueuePrefix: 'mcp.discovery',
            exchangeName: 'mcp.notifications'
        });

        // 4. Connect to server (following exact SDK pattern)
        await client.connect(transport);
        console.log('Successfully connected to MCP server via AMQP');

        // 5. Set up notification handler (following exact SDK pattern)
        client.setNotificationHandler(LoggingMessageNotificationSchema, (notification) => {
            console.log(`Notification: ${notification.params.data}`);
        });

        // 6. List tools (following exact SDK pattern)
        console.log('\n=== Listing Tools ===');
        const toolsRequest = {
            method: 'tools/list',
            params: {}
        };
        const toolsResult = await client.request(toolsRequest, ListToolsResultSchema);
        
        console.log('Available tools:');
        if (toolsResult.tools.length === 0) {
            console.log('  No tools available');
        } else {
            for (const tool of toolsResult.tools) {
                console.log(`  - ${tool.name}: ${tool.description}`);
            }
        }

        // 7. Start multiple tool calls in parallel (following exact SDK pattern)
        console.log('\n=== Starting Multiple Tool Calls in Parallel ===');
        const toolCalls = [
            {
                caller: 'memory-stats',
                request: {
                    method: 'tools/call',
                    params: {
                        name: 'mcp_mcp-open-disc_memory_stats',
                        arguments: {}
                    }
                }
            },
            {
                caller: 'registry-status',
                request: {
                    method: 'tools/call',
                    params: {
                        name: 'mcp_mcp-open-disc_registry_get_status',
                        arguments: {
                            format: 'summary'
                        }
                    }
                }
            },
            {
                caller: 'ping-test',
                request: {
                    method: 'tools/call',
                    params: {
                        name: 'mcp_mcp-open-disc_ping',
                        arguments: {
                            host: '8.8.8.8',
                            count: 2
                        }
                    }
                }
            }
        ];

        console.log(`Starting ${toolCalls.length} tool calls in parallel...`);

        // Start all tool calls in parallel (following exact SDK pattern)
        const toolPromises = toolCalls.map(({ caller, request }) => {
            console.log(`Starting tool call for ${caller}...`);
            return client.request(request, CallToolResultSchema)
                .then(result => ({ caller, result }))
                .catch(error => {
                    console.error(`Error in tool call for ${caller}:`, error);
                    throw error;
                });
        });

        // Wait for all tool calls to complete
        const results = await Promise.all(toolPromises);

        // Log the results from each tool call (following exact SDK pattern)
        for (const { caller, result } of results) {
            console.log(`\n=== Tool result for ${caller} ===`);
            result.content.forEach((item) => {
                if (item.type === 'text') {
                    console.log(`  ${item.text}`);
                } else {
                    console.log(`  ${item.type} content:`, item);
                }
            });
        }

        // Wait for any pending notifications (following exact SDK pattern)
        console.log('\n=== Waiting for notifications ===');
        await new Promise(resolve => setTimeout(resolve, 3000));

        console.log('\n✅ Single client multiple tools test completed successfully');

    } catch (error) {
        console.error('❌ Test failed:', error);
        throw error;
    } finally {
        if (transport) {
            await transport.close();
            console.log('🔌 Disconnected from MCP server');
        }
    }
}

/**
 * Test multiple clients in parallel (following multipleClientsParallel.js)
 */
async function createAndRunAmqpClient(config) {
    console.log(`[${config.id}] Creating AMQP client: ${config.name}`);
    
    const client = new Client({
        name: config.name,
        version: '1.0.0'
    });
    
    const transport = new AMQPClientTransport({
        amqpUrl: 'amqp://mcp:discovery@localhost:5672',
        serverQueuePrefix: 'mcp.discovery',
        exchangeName: 'mcp.notifications'
    });

    // Set up client-specific error handler (following exact SDK pattern)
    client.onerror = (error) => {
        console.error(`[${config.id}] Client error:`, error);
    };

    // Set up client-specific notification handler (following exact SDK pattern)
    client.setNotificationHandler(LoggingMessageNotificationSchema, (notification) => {
        console.log(`[${config.id}] Notification: ${notification.params.data}`);
    });

    try {
        // Connect to the server (following exact SDK pattern)
        await client.connect(transport);
        console.log(`[${config.id}] Connected to MCP server via AMQP`);

        // Call the specified tool (following exact SDK pattern)
        console.log(`[${config.id}] Calling tool: ${config.toolName}`);
        const toolRequest = {
            method: 'tools/call',
            params: {
                name: config.toolName,
                arguments: {
                    ...config.toolArguments,
                    caller: config.id  // Add client ID for identification
                }
            }
        };

        const result = await client.request(toolRequest, CallToolResultSchema);
        console.log(`[${config.id}] Tool call completed`);

        // Keep the connection open for a bit to receive notifications (following exact SDK pattern)
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Disconnect (following exact SDK pattern)
        await transport.close();
        console.log(`[${config.id}] Disconnected from MCP server`);

        return { id: config.id, result };

    } catch (error) {
        console.error(`[${config.id}] Error:`, error);
        throw error;
    }
}

async function testMultipleAmqpClients() {
    console.log('\n=== Testing Multiple AMQP Clients in Parallel ===\n');

    try {
        // Define client configurations (following exact SDK pattern)
        const clientConfigs = [
            {
                id: 'amqp-client1',
                name: 'amqp-basic-client-1',
                toolName: 'mcp_mcp-open-disc_memory_stats',
                toolArguments: {}
            },
            {
                id: 'amqp-client2',
                name: 'amqp-basic-client-2',
                toolName: 'mcp_mcp-open-disc_ping',
                toolArguments: {
                    host: '8.8.8.8',
                    count: 1
                }
            },
            {
                id: 'amqp-client3',
                name: 'amqp-basic-client-3',
                toolName: 'mcp_mcp-open-disc_registry_get_status',
                toolArguments: {
                    format: 'summary'
                }
            }
        ];

        // Start all clients in parallel (following exact SDK pattern)
        console.log(`Starting ${clientConfigs.length} AMQP clients in parallel...`);
        const clientPromises = clientConfigs.map(config => createAndRunAmqpClient(config));
        const results = await Promise.all(clientPromises);

        // Display results from all clients (following exact SDK pattern)
        console.log('\n=== Final Results from Multiple AMQP Clients ===');
        results.forEach(({ id, result }) => {
            console.log(`\n[${id}] Tool result:`);
            if (Array.isArray(result.content)) {
                result.content.forEach((item) => {
                    if (item.type === 'text' && item.text) {
                        console.log(`  ${item.text}`);
                    } else {
                        console.log(`  ${item.type} content:`, item);
                    }
                });
            } else {
                console.log(`  Unexpected result format:`, result);
            }
        });

        console.log('\n✅ Multiple AMQP clients test completed successfully');

    } catch (error) {
        console.error('❌ Multiple clients test failed:', error);
        throw error;
    }
}

/**
 * Main test runner
 */
async function main() {
    console.log('🚀 MCP AMQP Transport Validation (Following SDK Examples)');
    console.log('===========================================================');

    try {
        // Test 1: Single client with multiple tool calls
        await testSingleClientMultipleTools();

        // Test 2: Multiple clients in parallel
        await testMultipleAmqpClients();

        console.log('\n🎉 All AMQP transport validation tests completed successfully!');
        console.log('✅ AMQP transport is properly configured for bidirectional MQ');
        console.log('✅ Follows official MCP SDK client patterns');

    } catch (error) {
        console.error('❌ AMQP transport validation failed:', error);
        process.exit(1);
    }
}

// Run the validation
main().catch((error) => {
    console.error('Error running AMQP transport validation:', error);
    process.exit(1);
});
