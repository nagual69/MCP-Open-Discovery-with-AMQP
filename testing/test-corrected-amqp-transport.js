/**
 * Test the corrected AMQP transport implementation
 * Tests complete request-response cycle with the fixed transport
 */

const { AMQPClientTransport } = require('../tools/transports/amqp-client-transport.js');

async function testCorrectedAmqpTransport() {
    console.log('\n=== Testing Corrected AMQP Transport Implementation ===\n');
    
    const client = new AMQPClientTransport({
        amqpUrl: 'amqp://mcp:discovery@localhost:5672',
        serverQueuePrefix: 'mcp.server',
        exchangeName: 'mcp.requests'
    });

    // Create a request helper that uses the transport
    const sendRequest = async (message) => {
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('Request timeout'));
            }, 30000);

            // Set up one-time message handler for the response
            const originalOnMessage = client.onmessage;
            client.onmessage = (response) => {
                clearTimeout(timeout);
                client.onmessage = originalOnMessage;
                
                try {
                    const parsed = typeof response === 'string' ? JSON.parse(response) : response;
                    if (parsed.id === message.id) {
                        resolve(parsed);
                    }
                } catch (error) {
                    reject(error);
                }
            };

            // Send the message
            client.send(message).catch(reject);
        });
    };

    try {
        // Start/connect the transport
        console.log('🔌 Connecting to server...');
        await client.start();
        console.log('✅ Connected successfully');

        // Test 1: Initialize MCP session
        console.log('\n📋 Test 1: Initializing MCP session...');
        const initResponse = await sendRequest({
            jsonrpc: '2.0',
            id: 'test-init-1',
            method: 'initialize',
            params: {
                protocolVersion: '2024-11-05',
                capabilities: {
                    tools: {}
                },
                clientInfo: {
                    name: 'AMQP Transport Test Client',
                    version: '1.0.0'
                }
            }
        });
        
        console.log('✅ Initialize response received:', JSON.stringify(initResponse, null, 2));

        // Test 2: List available tools
        console.log('\n🔧 Test 2: Listing available tools...');
        const toolsResponse = await sendRequest({
            jsonrpc: '2.0',
            id: 'test-tools-1',
            method: 'tools/list',
            params: {}
        });
        
        console.log('✅ Tools list response received');
        console.log(`📊 Total tools available: ${toolsResponse.result?.tools?.length || 0}`);
        
        if (toolsResponse.result?.tools?.length > 0) {
            console.log('🔧 First few tools:');
            toolsResponse.result.tools.slice(0, 5).forEach(tool => {
                console.log(`  - ${tool.name}: ${tool.description}`);
            });
        }

        // Test 3: Call a simple tool (memory stats)
        console.log('\n💾 Test 3: Testing memory statistics tool...');
        const memoryResponse = await sendRequest({
            jsonrpc: '2.0',
            id: 'test-memory-1',
            method: 'tools/call',
            params: {
                name: 'mcp_mcp-open-disc_memory_stats',
                arguments: {}
            }
        });
        
        console.log('✅ Memory stats response received:', JSON.stringify(memoryResponse, null, 2));

        // Test 4: Test ping tool
        console.log('\n🏓 Test 4: Testing ping tool...');
        const pingResponse = await sendRequest({
            jsonrpc: '2.0',
            id: 'test-ping-1',
            method: 'tools/call',
            params: {
                name: 'mcp_mcp-open-disc_ping',
                arguments: {
                    host: '8.8.8.8',
                    count: 2
                }
            }
        });
        
        console.log('✅ Ping response received:', JSON.stringify(pingResponse, null, 2));

        console.log('\n🎉 All tests completed successfully!');
        console.log('🔧 Corrected AMQP transport is working properly with complete request-response cycle');

    } catch (error) {
        console.error('❌ Test failed:', error);
        if (error.stack) {
            console.error('Stack trace:', error.stack);
        }
    } finally {
        try {
            await client.close();
            console.log('🔌 Connection closed');
        } catch (closeError) {
            console.error('Error closing connection:', closeError);
        }
    }
}

// Run the test
testCorrectedAmqpTransport().catch(console.error);
