#!/usr/bin/env node

/**
 * Test the fixed AMQP transport with proper send() method implementation
 * This test validates our Transport interface compliance fixes
 */

const amqp = require('amqplib');

async function testAMQPSendFix() {
  let connection;
  
  try {
    console.log('🔧 Testing AMQP Transport Send() Method Fix...');
    
    // Connect to RabbitMQ
    connection = await amqp.connect('amqp://mcp:discovery@localhost:5672');
    const channel = await connection.createChannel();
    
    // Create temporary reply queue
    const replyQueue = await channel.assertQueue('', { exclusive: true });
    const correlationId = `test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    console.log(`📡 Created reply queue: ${replyQueue.queue}`);
    console.log(`🔗 Correlation ID: ${correlationId}`);
    
    // Test message for memory_stats tool
    const testMessage = {
      jsonrpc: "2.0",
      method: "tools/call",
      params: {
        name: "memory_stats",
        arguments: {}
      },
      id: `test-${Date.now()}`
    };
    
    console.log('📨 Sending test message:', JSON.stringify(testMessage, null, 2));
    
    // Set up response listener
    const responsePromise = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Response timeout after 30 seconds'));
      }, 30000);
      
      channel.consume(replyQueue.queue, (msg) => {
        if (msg && msg.properties.correlationId === correlationId) {
          clearTimeout(timeout);
          try {
            const response = JSON.parse(msg.content.toString());
            channel.ack(msg);
            resolve(response);
          } catch (error) {
            reject(new Error(`Failed to parse response: ${error.message}`));
          }
        }
      }, { noAck: false });
    });
    
    // Send the message
    await channel.sendToQueue('mcp.discovery.requests', Buffer.from(JSON.stringify(testMessage)), {
      correlationId,
      replyTo: replyQueue.queue,
      persistent: false
    });
    
    console.log('✅ Message sent to AMQP queue');
    console.log('⏳ Waiting for response...');
    
    // Wait for response
    const response = await responsePromise;
    
    console.log('🎉 SUCCESS! Received response from AMQP transport:');
    console.log(JSON.stringify(response, null, 2));
    
    // Verify response structure
    if (response.jsonrpc === "2.0" && response.id === testMessage.id) {
      if (response.result) {
        console.log('✅ Response is a valid JSON-RPC success result');
        console.log('🔧 Transport send() method is working correctly!');
        
        // Check if it contains memory stats data
        if (response.result.content && Array.isArray(response.result.content)) {
          console.log('📊 Memory stats response structure verified');
          console.log(`📈 Response contains ${response.result.content.length} content items`);
        }
      } else if (response.error) {
        console.log('⚠️  Response is a valid JSON-RPC error result');
        console.log('🔧 Transport send() method is working (error case)');
        console.log('❌ Tool execution error:', response.error.message);
      }
    } else {
      console.log('❌ Invalid JSON-RPC response structure');
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error('Stack:', error.stack);
  } finally {
    if (connection) {
      await connection.close();
      console.log('🔌 AMQP connection closed');
    }
  }
}

// Run the test
testAMQPSendFix().catch(console.error);
