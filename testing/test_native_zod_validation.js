/**
 * Simple test to validate our native Zod tools work correctly
 */

const { z } = require('zod');

// Test network tools
const networkTools = require('../tools/network_tools_sdk');

console.log('🧪 Testing Native Zod Tools Validation');
console.log('=====================================');

async function testToolSchemas() {
  try {
    console.log('\n📋 Network Tools:');
    console.log(`   Total tools: ${networkTools.tools.length}`);
    
    for (const tool of networkTools.tools) {
      console.log(`   ✓ ${tool.name}: ${tool.description}`);
      
      // Test if the schema is a valid Zod object
      if (tool.inputSchema && tool.inputSchema._def) {
        console.log(`     🎯 Schema type: ${tool.inputSchema._def.typeName}`);
        
        // Test schema parsing with a simple object
        try {
          if (tool.name === 'ping') {
            const testInput = { host: '8.8.8.8' };
            const parsed = tool.inputSchema.parse(testInput);
            console.log(`     ✅ Schema validation works`);
          }
        } catch (schemaError) {
          console.log(`     ❌ Schema validation failed: ${schemaError.message}`);
        }
      } else {
        console.log(`     ❌ Invalid Zod schema!`);
      }
    }

    // Test handleToolCall function
    console.log('\n🔧 Testing handleToolCall function:');
    if (typeof networkTools.handleToolCall === 'function') {
      console.log('   ✅ handleToolCall function exists');
      
      // Test a simple ping call
      try {
        console.log('   🧪 Testing ping tool...');
        const result = await networkTools.handleToolCall('ping', { host: '8.8.8.8', count: 1 });
        console.log('   ✅ Ping tool executed successfully');
        console.log(`   📊 Result type: ${typeof result}`);
      } catch (toolError) {
        console.log(`   ⚠️  Tool execution failed: ${toolError.message}`);
      }
    } else {
      console.log('   ❌ handleToolCall function missing!');
    }

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error('Stack:', error.stack);
  }
}

testToolSchemas().then(() => {
  console.log('\n🎯 Test completed!');
}).catch(console.error);
