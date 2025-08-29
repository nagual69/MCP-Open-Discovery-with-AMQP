/**
 * Test MCP Types Integration
 * 
 * This test validates our new mcp-types integration approach
 * to ensure it resolves the Zod to JSON schema conversion issues.
 */

const { z } = require('zod');
const { ToolSchema } = require('mcp-types');
const { adaptToolToMCPTypes, createParameterValidator, getValidationSummary } = require('../tools/registry/mcp_types_adapter');

// Mock MCP server for testing
class MockMCPServer {
  constructor() {
    this.registeredTools = new Map();
  }
  
  tool(name, description, inputSchema, handler) {
    console.log(`[Mock Server] Registering tool: ${name}`);
    console.log(`[Mock Server] Description: ${description}`);
    console.log(`[Mock Server] Schema type: ${typeof inputSchema}`);
    console.log(`[Mock Server] Schema structure:`, JSON.stringify(inputSchema, null, 2));
    
    // Validate that the schema is proper JSON Schema, not Zod
    if (inputSchema && typeof inputSchema.safeParse === 'function') {
      throw new Error(`Tool ${name}: inputSchema is a Zod schema, should be JSON Schema`);
    }
    
    this.registeredTools.set(name, {
      description,
      inputSchema,
      handler
    });
    
    console.log(`[Mock Server] ✅ Successfully registered: ${name}`);
  }
}

// Test tool definitions with various schema types
const testTools = [
  {
    name: 'test_simple_params',
    description: 'Test tool with simple parameters',
    inputSchema: z.object({
      message: z.string().describe('Message to process'),
      count: z.number().int().min(1).max(100).optional().describe('Number of repetitions')
    })
  },
  {
    name: 'test_array_params', 
    description: 'Test tool with array parameters',
    inputSchema: z.object({
      items: z.array(z.string()).describe('List of items to process'),
      options: z.array(z.object({
        key: z.string(),
        value: z.string()
      })).optional().describe('Optional configuration')
    })
  },
  {
    name: 'test_no_params',
    description: 'Test tool with no parameters',
    inputSchema: undefined
  },
  {
    name: 'test_json_schema',
    description: 'Test tool with existing JSON Schema',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Name parameter' },
        age: { type: 'number', minimum: 0, maximum: 150 }
      },
      required: ['name']
    }
  }
];

async function runTests() {
  console.log('========================================');
  console.log('🧪 Testing MCP Types Integration');
  console.log('========================================\n');
  
  const server = new MockMCPServer();
  let passedTests = 0;
  let totalTests = 0;
  
  for (const tool of testTools) {
    totalTests++;
    console.log(`\n--- Testing Tool: ${tool.name} ---`);
    
    try {
      // Test 1: Adaptation to mcp-types format
      console.log('🔄 Step 1: Adapting to mcp-types format...');
      const adaptedTool = adaptToolToMCPTypes(tool);
      
      // Test 2: Validate against mcp-types schema
      console.log('🔍 Step 2: Validating against mcp-types schema...');
      const validation = ToolSchema.safeParse(adaptedTool);
      
      if (!validation.success) {
        console.error('❌ mcp-types validation failed:', validation.error.errors);
        continue;
      }
      
      console.log('✅ mcp-types validation passed');
      
      // Test 3: Parameter validator creation
      console.log('🔄 Step 3: Creating parameter validator...');
      const validateParams = createParameterValidator(tool.inputSchema);
      
      // Test 4: Mock registration with server
      console.log('🔄 Step 4: Registering with mock server...');
      server.tool(
        adaptedTool.name,
        adaptedTool.description,
        adaptedTool.inputSchema,
        async (args) => {
          const validation = validateParams(args);
          if (!validation.success) {
            return { error: validation.error.message };
          }
          return { result: 'success', args: validation.data };
        }
      );
      
      // Test 5: Get validation summary
      console.log('🔄 Step 5: Getting validation summary...');
      const summary = getValidationSummary(tool);
      console.log('📊 Validation Summary:', JSON.stringify(summary, null, 2));
      
      console.log(`✅ ${tool.name}: ALL TESTS PASSED`);
      passedTests++;
      
    } catch (error) {
      console.error(`❌ ${tool.name}: FAILED -`, error.message);
      console.error(error.stack);
    }
  }
  
  console.log('\n========================================');
  console.log('🏁 Test Results Summary');
  console.log('========================================');
  console.log(`Total Tests: ${totalTests}`);
  console.log(`Passed: ${passedTests}`);
  console.log(`Failed: ${totalTests - passedTests}`);
  console.log(`Success Rate: ${Math.round((passedTests / totalTests) * 100)}%`);
  
  if (passedTests === totalTests) {
    console.log('🎉 ALL TESTS PASSED - mcp-types integration working correctly!');
    
    // Show registered tools
    console.log('\n📋 Registered Tools Summary:');
    for (const [name, tool] of server.registeredTools) {
      console.log(`  ✅ ${name}: ${Object.keys(tool.inputSchema.properties || {}).length} properties`);
    }
    
  } else {
    console.log('❌ Some tests failed - check implementation');
  }
  
  return passedTests === totalTests;
}

// Run tests
if (require.main === module) {
  runTests().then(success => {
    process.exit(success ? 0 : 1);
  }).catch(error => {
    console.error('Test execution failed:', error);
    process.exit(1);
  });
}

module.exports = { runTests };
